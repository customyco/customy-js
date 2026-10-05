/**
 * Cliente de servidor de Customy Storage sobre `@customyai/core`: transporte,
 * reintentos con `Retry-After`, idempotencia y tokens de Access vienen del
 * core; aquí solo está el contrato de Files para apps conectadas.
 *
 * `files.upload` hace el flujo completo de la API (sesión → partes firmadas →
 * `PUT` al almacén → completar) con los bytes que la app ya tiene en memoria:
 * calcula el SHA-256, trocea en las partes que pida Storage y reintenta cada
 * parte ante red o `5xx`. No hay una ruta de subida directa: los bytes nunca
 * pasan por el proceso de Storage (van firmados al almacén), igual que desde
 * Workspace, y el antivirus, la cuota y la deduplicación son los mismos.
 */
import {
  connectProduct,
  createIdempotencyKey,
  isRetryableStatus,
  sleep,
  type ProductClientOptions,
  type RequestOptions,
  type Transport,
} from "@customyai/core";
import { CustomyStorageError, storageCall } from "./errors";
import type {
  DownloadedFile,
  DownloadOptions,
  DownloadUrl,
  DownloadUrlOptions,
  StorageFile,
  StorageScanStatus,
  UploadInput,
  UploadOptions,
} from "./types";

export const STORAGE_DEFAULT_BASE_URL = "https://storage-api.customy.ai";
export const STORAGE_AUDIENCE = "customy-storage";

/**
 * Scopes de Access para Storage. `read`: ver y descargar; `write`: subir;
 * `delete`: mandar a la papelera. Pide solo los que la app usa.
 */
export const STORAGE_SCOPES = ["storage:files:read", "storage:files:write", "storage:files:delete"] as const;
export type StorageScope = (typeof STORAGE_SCOPES)[number];

/** Tope de `files.upload`: los bytes viven en memoria del proceso. */
export const STORAGE_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export type StorageOptions = ProductClientOptions;

/** Lo que devuelve Storage de un ítem (`serializeItem`); el SDK solo lee lo que publica. */
type WireItem = {
  id: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | string;
  scanStatus: string;
  createdAt: string | null;
  metadata?: Record<string, unknown> | null;
};

type WireUploadSession = {
  uploadSessionId: string;
  status: string;
  itemId?: string | null;
  partSizeBytes?: number;
  parentId?: string;
};

type WireSignedParts = { uploadSessionId: string; parts: Array<{ partNumber: number; url: string }> };

const enc = encodeURIComponent;
const PART_ATTEMPTS = 3;
const PART_TIMEOUT_MS = 120_000;
const MAX_PARTS_PER_SIGN = 100;

function scanStatusOf(value: string): StorageScanStatus {
  if (value === "clean" || value === "not_required") return "clean";
  if (value === "pending" || value === "scanning") return "pending";
  if (value === "failed") return "failed";
  return "infected";
}

function stringMetadata(value: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value ?? {})) if (typeof entry === "string") out[key] = entry;
  return out;
}

export function toStorageFile(item: WireItem, checksumSha256: string | null = null): StorageFile {
  return {
    id: String(item.id),
    name: item.name,
    mimeType: item.mimeType || "application/octet-stream",
    sizeBytes: Number(item.sizeBytes),
    checksumSha256,
    scanStatus: scanStatusOf(item.scanStatus),
    createdAt: item.createdAt ?? new Date(0).toISOString(),
    metadata: stringMetadata(item.metadata),
  };
}

/** SHA-256 en hexadecimal con la Web Crypto del entorno (node ≥ 20, edge y navegador). */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!subtle) throw new CustomyStorageError({ code: "SDK_CRYPTO_UNAVAILABLE", message: "Web Crypto (crypto.subtle) is required to hash uploads", retryable: false });
  const digest = await subtle.digest("SHA-256", data as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function invalid(message: string): CustomyStorageError {
  return new CustomyStorageError({ code: "SDK_INVALID_INPUT", message, retryable: false });
}

function validateUpload(input: UploadInput): void {
  if (!(input?.data instanceof Uint8Array)) throw invalid("data must be a Uint8Array");
  if (input.data.byteLength === 0) throw invalid("data must not be empty");
  if (input.data.byteLength > STORAGE_MAX_UPLOAD_BYTES) {
    throw new CustomyStorageError({ code: "FILE_TOO_LARGE", status: 413, message: `files.upload accepts up to ${STORAGE_MAX_UPLOAD_BYTES} bytes`, retryable: false });
  }
  if (typeof input.fileName !== "string" || input.fileName.trim().length === 0 || input.fileName.length > 255 || /[\u0000-\u001f/\\]/.test(input.fileName)) {
    throw invalid("fileName must be 1-255 characters without '/', '\\' or control characters");
  }
  if (typeof input.mimeType !== "string" || input.mimeType.length === 0 || input.mimeType.length > 255) throw invalid("mimeType is required");
  for (const [key, value] of Object.entries(input.metadata ?? {})) {
    if (typeof value !== "string") throw invalid(`metadata.${key} must be a string`);
  }
}

/** Señal que aborta con la de quien llama o al vencer el plazo. */
function deadline(outer: AbortSignal | undefined, ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), ms);
  const onAbort = () => controller.abort(outer?.reason);
  if (outer?.aborted) controller.abort(outer.reason);
  else outer?.addEventListener("abort", onAbort, { once: true });
  return { signal: controller.signal, done: () => { clearTimeout(timer); outer?.removeEventListener("abort", onAbort); } };
}

export type CustomyStorage = ReturnType<typeof createStorage>;

/**
 * ```ts
 * const storage = createStorage({ machineTokens, platform, scopes: ["storage:files:read", "storage:files:write"] });
 * const file = await storage.files.upload({ data, fileName: "recibo.jpg", mimeType: "image/jpeg", folder: "recibos" });
 * const { url } = await storage.files.downloadUrl(file.id); // 423 FILE_SCAN_PENDING mientras pasa el antivirus
 * ```
 */
export function createStorage(options: StorageOptions) {
  const connection = connectProduct(options, { key: "storage", audience: STORAGE_AUDIENCE, defaultBaseUrl: STORAGE_DEFAULT_BASE_URL });
  const http: Transport = connection.transport;
  const fetchImpl = connection.fetch;

  const call = <T>(method: "GET" | "POST" | "DELETE", path: string, request: RequestOptions = {}) =>
    storageCall(async () => (await http.request<T>(method, path, request)).data);

  function itemPath(id: string, suffix = ""): string {
    if (typeof id !== "string" || id.length === 0) throw invalid("id is required");
    return `/v2/items/${enc(id)}${suffix}`;
  }

  /** `PUT` de una parte a su URL firmada (sin credencial de la app); reintenta red, 408, 429 y 5xx. */
  async function putPart(url: string, body: Uint8Array, partNumber: number, signal?: AbortSignal): Promise<string> {
    let last: CustomyStorageError | null = null;
    for (let attempt = 0; attempt < PART_ATTEMPTS; attempt += 1) {
      if (signal?.aborted) throw new CustomyStorageError({ code: "SDK_ABORTED", cause: signal.reason, retryable: false });
      const limit = deadline(signal, PART_TIMEOUT_MS);
      try {
        const response = await fetchImpl(url, {
          method: "PUT",
          // Siempre binario: el proxy de Storage no debe interpretar el cuerpo (p. ej. un .json).
          headers: { "content-type": "application/octet-stream" },
          body: body as unknown as BodyInit,
          signal: limit.signal,
        });
        const etag = response.headers.get("etag");
        await response.arrayBuffer().catch(() => undefined);
        if (response.ok && etag) return etag;
        last = response.ok
          ? new CustomyStorageError({ code: "UPLOAD_PART_ETAG_MISSING", status: response.status, message: `Part ${partNumber} was stored without an ETag`, retryable: false })
          : new CustomyStorageError({ code: "UPLOAD_PART_FAILED", status: response.status, message: `Part ${partNumber} upload failed (${response.status})` });
        if (response.ok || !isRetryableStatus(response.status)) throw last;
      } catch (error) {
        if (error instanceof CustomyStorageError && !error.retryable) throw error;
        if (signal?.aborted) throw new CustomyStorageError({ code: "SDK_ABORTED", cause: error, retryable: false });
        if (!(error instanceof CustomyStorageError)) {
          last = new CustomyStorageError({ code: "SDK_NETWORK_ERROR", status: 0, message: `Part ${partNumber} upload failed`, cause: error });
        }
      } finally {
        limit.done();
      }
      if (attempt + 1 < PART_ATTEMPTS) await sleep(250 * 2 ** attempt, signal).catch(() => undefined);
    }
    throw last ?? new CustomyStorageError({ code: "UPLOAD_PART_FAILED", message: `Part ${partNumber} upload failed` });
  }

  const files = {
    /**
     * Sube bytes en memoria (≤ 25 MiB) y devuelve el archivo. Calcula el
     * SHA-256, sube las partes firmadas y completa. El archivo queda privado a
     * la app (nadie más lo ve) dentro de su carpeta; `folder` crea subcarpetas
     * (`"recibos/2026"`). Si los mismos bytes ya estaban, no se suben otra vez.
     *
     * La misma `idempotencyKey` (por defecto, una nueva por llamada) hace que
     * repetir la llamada tras un fallo devuelva el mismo archivo. Recién
     * subido, `scanStatus` es `pending` hasta que pasa el antivirus.
     */
    async upload(input: UploadInput, uploadOptions: UploadOptions = {}): Promise<StorageFile> {
      validateUpload(input);
      const signal = uploadOptions.signal;
      const idempotencyKey = uploadOptions.idempotencyKey ?? createIdempotencyKey();
      if (idempotencyKey.length < 8 || idempotencyKey.length > 255) throw invalid("idempotencyKey must be 8-255 characters");
      const checksumSha256 = await sha256Hex(input.data);
      const sizeBytes = input.data.byteLength;

      const session = await call<WireUploadSession>("POST", "/v2/uploads", {
        body: {
          fileName: input.fileName,
          mimeType: input.mimeType,
          sizeBytes,
          checksumSha256,
          idempotencyKey,
          ...(input.metadata ? { metadata: input.metadata } : {}),
          ...(input.folder ? { folder: input.folder } : {}),
        },
        idempotencyKey: `${idempotencyKey}:session`,
        signal,
      });
      const sessionPath = `/v2/uploads/${enc(session.uploadSessionId)}`;
      if (session.status === "completed" && session.itemId) {
        return toStorageFile(await call<WireItem>("GET", itemPath(session.itemId), { signal }), checksumSha256);
      }
      if (!["initiated", "uploading", "uploaded", "completing"].includes(session.status)) {
        throw new CustomyStorageError({ code: "UPLOAD_SESSION_NOT_UPLOADABLE", status: 409, message: `Upload session is ${session.status}; retry with a new idempotencyKey`, retryable: false });
      }

      const parts: Array<{ partNumber: number; etag: string }> = [];
      if (session.status === "initiated" || session.status === "uploading") {
        const partSize = session.partSizeBytes && session.partSizeBytes > 0 ? session.partSizeBytes : 16 * 1024 * 1024;
        const count = Math.ceil(sizeBytes / partSize);
        for (let first = 1; first <= count; first += MAX_PARTS_PER_SIGN) {
          const partNumbers = Array.from({ length: Math.min(MAX_PARTS_PER_SIGN, count - first + 1) }, (_, index) => first + index);
          const signed = await call<WireSignedParts>("POST", `${sessionPath}/parts`, { body: { partNumbers }, idempotencyKey: true, signal });
          for (const part of signed.parts) {
            const start = (part.partNumber - 1) * partSize;
            const etag = await putPart(part.url, input.data.subarray(start, Math.min(start + partSize, sizeBytes)), part.partNumber, signal);
            parts.push({ partNumber: part.partNumber, etag });
          }
        }
      }

      const item = await call<WireItem>("POST", `${sessionPath}/complete`, {
        body: {
          parts,
          checksumSha256,
          ...(session.parentId ? { parentId: session.parentId } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        },
        idempotencyKey: `${idempotencyKey}:complete`,
        signal,
      });
      return toStorageFile(item, checksumSha256);
    },

    /** Metadatos de un archivo de la app (404 `STORAGE_ITEM_NOT_FOUND` si no es suyo o no existe). */
    async get(id: string): Promise<StorageFile> {
      return toStorageFile(await call<WireItem>("GET", itemPath(id)));
    },

    /**
     * URL firmada y temporal para descargar (`expiresIn` 30–3600 s, 300 por
     * defecto). Mientras el antivirus no termina lanza `CustomyStorageError`
     * 423 `FILE_SCAN_PENDING` (`retryable: true`); `FILE_SCAN_FAILED` y
     * `FILE_QUARANTINED` no se arreglan reintentando.
     */
    async downloadUrl(id: string, urlOptions: DownloadUrlOptions = {}): Promise<DownloadUrl> {
      const path = itemPath(id, "/download");
      const result = await call<{ url: string; expiresIn: number }>("POST", path, {
        body: {
          ...(urlOptions.inline !== undefined ? { inline: urlOptions.inline } : {}),
          ...(urlOptions.expiresIn !== undefined ? { expiresIn: urlOptions.expiresIn } : {}),
          ...(urlOptions.fileName !== undefined ? { fileName: urlOptions.fileName } : {}),
        },
        // Firmar no cambia nada: se puede repetir ante red o 5xx.
        idempotencyKey: true,
      });
      return { url: result.url, expiresIn: Number(result.expiresIn) };
    },

    /** Los bytes del archivo (con `downloadUrl` + `fetch`), su tipo y su nombre. */
    async download(id: string, downloadOptions: DownloadOptions = {}): Promise<DownloadedFile> {
      const signal = downloadOptions.signal;
      const [file, link] = await Promise.all([
        call<WireItem>("GET", itemPath(id), { signal }).then((item) => toStorageFile(item)),
        files.downloadUrl(id),
      ]);
      let response: Response;
      try {
        response = await fetchImpl(link.url, { method: "GET", signal });
      } catch (error) {
        throw new CustomyStorageError({ code: signal?.aborted ? "SDK_ABORTED" : "SDK_NETWORK_ERROR", status: 0, cause: error, ...(signal?.aborted ? { retryable: false } : {}) });
      }
      if (!response.ok) {
        await response.arrayBuffer().catch(() => undefined);
        throw new CustomyStorageError({ code: "DOWNLOAD_FAILED", status: response.status, message: `Download failed (${response.status})` });
      }
      const data = new Uint8Array(await response.arrayBuffer());
      return { data, mimeType: file.mimeType, name: file.name };
    },

    /** A la papelera (se purga a los 30 días). Solo archivos de la app. */
    async trash(id: string): Promise<void> {
      await call("POST", itemPath(id, "/trash"), { idempotencyKey: true });
    },
  };

  return { files };
}

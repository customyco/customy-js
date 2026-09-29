/** Estado del antivirus: solo un archivo `clean` se puede descargar. */
export type StorageScanStatus = "pending" | "clean" | "infected" | "failed";

/** Un archivo de la app en Customy Storage. */
export type StorageFile = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** SHA-256 en hexadecimal: lo da `upload`; `get` no lo conoce (`null`). */
  checksumSha256: string | null;
  scanStatus: StorageScanStatus;
  createdAt: string;
  metadata: Record<string, string>;
};

export type UploadInput = {
  /** Los bytes del archivo (≤ 25 MiB). */
  data: Uint8Array;
  /** Nombre con extensión, sin `/` ni `\`. Si ya existe en la carpeta, Storage le añade un sufijo. */
  fileName: string;
  mimeType: string;
  /** Pares de texto que se guardan con el archivo y vuelven en `metadata`. */
  metadata?: Record<string, string>;
  /** Subcarpeta dentro de la carpeta de la app (`"recibos/2026"`). */
  folder?: string;
};

export type UploadOptions = {
  /** La misma clave repetida devuelve el mismo archivo (8–255 caracteres). */
  idempotencyKey?: string;
  signal?: AbortSignal;
};

export type DownloadUrlOptions = {
  /** `Content-Disposition: inline` (mostrar en el navegador) en lugar de `attachment`. */
  inline?: boolean;
  /** Vida de la URL en segundos, 30–3600 (300 por defecto). */
  expiresIn?: number;
  /** Nombre con el que se descarga; por defecto, el del archivo. */
  fileName?: string;
};

export type DownloadUrl = { url: string; expiresIn: number };

export type DownloadOptions = { signal?: AbortSignal };

export type DownloadedFile = { data: Uint8Array; mimeType: string; name: string };

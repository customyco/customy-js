import { StoriesError } from "./errors";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]", "10.0.2.2"];

/**
 * La URL base del cliente (`baseUrl`) lleva el token de suscriptor en cada petición: solo `https`, salvo `http` hacia la máquina
 * de desarrollo (`localhost`, `127.0.0.1`, `[::1]`, `10.0.2.2` = el anfitrión visto desde el emulador de Android). Sin credenciales
 * en la URL. Lanza `StoriesError("invalid")`; sin `baseUrl` se usa el valor por defecto (https) y no hay nada que comprobar.
 */
export function assertSecureBaseUrl(baseUrl: string | undefined): void {
  if (baseUrl === undefined) return;
  let u: URL;
  try {
    u = new URL(baseUrl);
  } catch {
    throw new StoriesError("invalid", "baseUrl no es una URL válida");
  }
  if (u.username || u.password) throw new StoriesError("invalid", "baseUrl no puede llevar credenciales");
  if (u.protocol === "https:") return;
  if (u.protocol === "http:" && LOCAL_HOSTS.includes(u.hostname)) return;
  throw new StoriesError("invalid", "baseUrl debe ser https (http solo hacia localhost, 127.0.0.1 o 10.0.2.2 en desarrollo)");
}

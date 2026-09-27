/** Quita las barras finales en tiempo lineal (sin la regex `/\/+$/`, cuadrática con muchas `/`). */
export function trimTrailingSlashes(value: string): string {
    let end = value.length;
    while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
    return value.slice(0, end);
}

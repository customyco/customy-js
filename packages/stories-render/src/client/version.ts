/** Versión del renderer/SDK: la que se compara con `min_sdk` del placement y viaja en `Customy-Client`. */
export const STORIES_SDK_VERSION = "0.2.0";
export const STORIES_SDK_ID = `stories-render/${STORIES_SDK_VERSION}`;

/** Compara versiones x.y.z (ignora el sufijo de prerelease). `-1`, `0` o `1`. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] => v.split(/[-+]/)[0]!.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

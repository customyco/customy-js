/** Decodificador BlurHash (https://blurha.sh, MIT) sin dependencias, y su pintor en un `<canvas>`. */
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~";
const decode83 = (s: string) => {
  let v = 0;
  for (const c of s) {
    const d = DIGITS.indexOf(c);
    if (d < 0) throw new Error("blurhash: carácter inválido");
    v = v * 83 + d;
  }
  return v;
};
const toLinear = (v: number) => { const n = v / 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; };
const toSRGB = (v: number) => { const n = Math.max(0, Math.min(1, v)); return Math.trunc(n <= 0.0031308 ? n * 12.92 * 255 + 0.5 : (1.055 * n ** (1 / 2.4) - 0.055) * 255 + 0.5); };
const signPow = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e;

export function isValidBlurhash(hash: string): boolean {
  if (typeof hash !== "string" || hash.length < 6) return false;
  try {
    const size = decode83(hash[0]!);
    const cx = (size % 9) + 1, cy = Math.floor(size / 9) + 1;
    return hash.length === 4 + 2 * cx * cy;
  } catch { return false; }
}

/** RGBA de `width`×`height`; lanza si el hash es inválido. */
export function decodeBlurhash(hash: string, width: number, height: number, punch = 1): Uint8ClampedArray {
  if (!isValidBlurhash(hash)) throw new Error("blurhash: hash inválido");
  const size = decode83(hash[0]!);
  const cx = (size % 9) + 1, cy = Math.floor(size / 9) + 1;
  const max = ((decode83(hash[1]!) + 1) / 166) * punch;
  const colors: [number, number, number][] = [];
  for (let i = 0; i < cx * cy; i++) {
    if (i === 0) {
      const v = decode83(hash.slice(2, 6));
      colors.push([toLinear(v >> 16), toLinear((v >> 8) & 255), toLinear(v & 255)]);
    } else {
      const v = decode83(hash.slice(4 + i * 2, 6 + i * 2));
      const q = (n: number) => signPow((n - 9) / 9, 2) * max;
      colors.push([q(Math.floor(v / 361)), q(Math.floor(v / 19) % 19), q(v % 19)]);
    }
  }
  const px = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < cy; j++) {
        for (let i = 0; i < cx; i++) {
          const basis = Math.cos((Math.PI * x * i) / width) * Math.cos((Math.PI * y * j) / height);
          const c = colors[i + j * cx]!;
          r += c[0] * basis; g += c[1] * basis; b += c[2] * basis;
        }
      }
      const o = 4 * (x + y * width);
      px[o] = toSRGB(r); px[o + 1] = toSRGB(g); px[o + 2] = toSRGB(b); px[o + 3] = 255;
    }
  }
  return px;
}

/** Pinta el hash en un canvas pequeño (se estira por CSS). Sin canvas (SSR, jsdom) no hace nada y devuelve `false`. */
export function paintBlurhash(canvas: HTMLCanvasElement, hash: string, size = 32): boolean {
  if (!isValidBlurhash(hash)) return false;
  const ctx = canvas.getContext?.("2d");
  if (!ctx) return false;
  const w = size, h = size;
  canvas.width = w; canvas.height = h;
  const data = ctx.createImageData(w, h);
  data.data.set(decodeBlurhash(hash, w, h));
  ctx.putImageData(data, 0, 0);
  return true;
}

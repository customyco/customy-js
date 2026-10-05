/** Lectura mínima de playlists HLS: lo justo para precargar el primer segmento. */

export type MasterVariant = { uri: string; bandwidth: number; width: number; height: number; codecs: string };

export function resolveUrl(base: string, ref: string): string {
  try {
    return new URL(ref, base).toString();
  } catch {
    return ref;
  }
}

const attr = (line: string, name: string): string | undefined => {
  const m = new RegExp(`(?:^|[:,])${name}=("([^"]*)"|[^,]*)`).exec(line);
  return m ? (m[2] ?? m[1]) : undefined;
};

export function parseMaster(text: string): MasterVariant[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const out: MasterVariant[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
    const uri = lines.slice(i + 1).find((l) => l && !l.startsWith("#"));
    if (!uri) continue;
    const [w, h] = (attr(line, "RESOLUTION") ?? "0x0").split("x").map(Number);
    out.push({ uri, bandwidth: Number(attr(line, "BANDWIDTH") ?? 0), width: w || 0, height: h || 0, codecs: attr(line, "CODECS") ?? "" });
  }
  return out.sort((a, b) => a.bandwidth - b.bandwidth);
}

export function parseMedia(text: string): { init?: string; segments: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const init = lines.map((l) => (l.startsWith("#EXT-X-MAP:") ? /URI="([^"]+)"/.exec(l)?.[1] : undefined)).find(Boolean);
  const segments: string[] = [];
  let expect = false;
  for (const l of lines) {
    if (l.startsWith("#EXTINF:")) expect = true;
    else if (expect && l && !l.startsWith("#")) { segments.push(l); expect = false; }
  }
  return { init, segments };
}

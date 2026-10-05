import { describe, expect, it } from "vitest";
import { parseMaster, parseMedia, resolveUrl } from "./hls-parse";

const master = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-STREAM-INF:BANDWIDTH=5000000,AVERAGE-BANDWIDTH=2500000,RESOLUTION=720x1280,FRAME-RATE=30.000,CODECS="avc1.64001f,mp4a.40.2"
720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1300000,AVERAGE-BANDWIDTH=650000,RESOLUTION=360x640,FRAME-RATE=30.000,CODECS="avc1.64001e,mp4a.40.2"
360p/index.m3u8
`;
describe("parseMaster", () => {
  it("ordena por ancho de banda y lee resolución y códecs", () => {
    const v = parseMaster(master);
    expect(v.map((x) => x.uri)).toEqual(["360p/index.m3u8", "720p/index.m3u8"]);
    expect(v[1]).toMatchObject({ bandwidth: 5_000_000, width: 720, height: 1280, codecs: "avc1.64001f,mp4a.40.2" });
  });
  it("no confunde AVERAGE-BANDWIDTH con BANDWIDTH", () => expect(parseMaster(master)[0]!.bandwidth).toBe(1_300_000));
  it("texto sin variantes → vacío", () => expect(parseMaster("hola")).toEqual([]));
});
describe("parseMedia", () => {
  it("init y segmentos", () => {
    const m = parseMedia('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2.0,\nseg_00000.m4s\n#EXTINF:1.5,\nseg_00001.m4s\n#EXT-X-ENDLIST\n');
    expect(m).toEqual({ init: "init.mp4", segments: ["seg_00000.m4s", "seg_00001.m4s"] });
  });
});
describe("resolveUrl", () => {
  it("resuelve relativas, incluidas las de la carpeta padre (subtítulos)", () => {
    expect(resolveUrl("https://c/v/100/tok/hls/master.m3u8", "360p/index.m3u8")).toBe("https://c/v/100/tok/hls/360p/index.m3u8");
    expect(resolveUrl("https://c/v/100/tok/hls/master.m3u8", "../captions/es.m3u8")).toBe("https://c/v/100/tok/captions/es.m3u8");
  });
});

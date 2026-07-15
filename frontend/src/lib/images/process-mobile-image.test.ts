import {
  MOBILE_IMAGE_LIMITS,
  MobileImageError,
  blobsToBoundedDataUrls,
  blobToBoundedDataUrl,
  parseImageHeader,
  processMobileImage,
  processMobileImages,
} from "./process-mobile-image";

const drawable = (width = 4000, height = 3000) => ({ width, height, close: jest.fn() }) as unknown as CanvasImageSource & { width: number; height: number; close: () => void };
function jpegBytes(width = 100, height = 100, padding = 0) {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0, 0xff, 0xd9, ...new Uint8Array(padding)]);
}
function pngBytes(width: number, height: number) { const b = new Uint8Array(24); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); b.set([0x49, 0x48, 0x44, 0x52], 12); new DataView(b.buffer).setUint32(16, width); new DataView(b.buffer).setUint32(20, height); return b; }
function image(name: string, size = 100, type = "image/jpeg", dimensions = { width: 100, height: 100 }) { const header = type === "image/png" ? pngBytes(dimensions.width, dimensions.height) : jpegBytes(dimensions.width, dimensions.height, Math.max(0, size - 23)); return new File([header], name, { type }); }

describe("header seguro", () => {
  it("lê JPEG e PNG sem decodificar", async () => {
    await expect(parseImageHeader(image("x.jpg"))).resolves.toMatchObject({ width: 100, height: 100, mimeType: "image/jpeg" });
    await expect(parseImageHeader(image("x.png", 100, "image/png", { width: 640, height: 480 }))).resolves.toMatchObject({ width: 640, height: 480, mimeType: "image/png" });
  });
  it("bloqueia bomba de pixels antes do decode", async () => {
    const decode = jest.fn(async () => drawable());
    await expect(processMobileImage(image("bomb.png", 100, "image/png", { width: 10_000, height: 10_000 }), { decode })).rejects.toMatchObject({ code: "dimensions" });
    expect(decode).not.toHaveBeenCalled();
  });
  it("bloqueia MIME que não corresponde ao magic header", async () => {
    await expect(processMobileImage(new File([jpegBytes()], "fake.png", { type: "image/png" }))).rejects.toMatchObject({ code: "type" });
  });
});

describe("processMobileImage", () => {
  it("rejeita MIME não permitido e input grande antes de decodificar", async () => {
    await expect(processMobileImage(new File(["x"], "x.gif", { type: "image/gif" }))).rejects.toMatchObject({ code: "type" });
    await expect(processMobileImage(image("huge.jpg", MOBILE_IMAGE_LIMITS.maxInputBytes + 1))).rejects.toMatchObject({ code: "input-size" });
  });
  it("redimensiona, gera JPEG e metadados", async () => {
    const source = drawable(); const encode = jest.fn(async () => new Blob([new Uint8Array(1200)], { type: "image/jpeg" }));
    const result = await processMobileImage(image("obra.png", 5000, "image/png"), { decode: async () => source, encode });
    expect(result).toMatchObject({ width: 1600, height: 1200, originalName: "obra.png", mimeType: "image/jpeg" }); expect(result.file.name).toBe("obra.jpg"); expect(source.close).toHaveBeenCalled();
  });
  it("reduz qualidade e dimensões até o limite", async () => {
    const sizes = [3000, 3000, 3000, 3000, 3000, 900]; const encode = jest.fn(async () => new Blob([new Uint8Array(sizes.shift() || 900)]));
    const result = await processMobileImage(image("large.jpg"), { decode: async () => drawable(3200, 2400), encode, maxOutputBytes: 1000 });
    expect(result.outputBytes).toBeLessThanOrEqual(1000); expect(encode).toHaveBeenCalledTimes(6);
  });
  it("falha explicitamente sem atingir limite", async () => {
    await expect(processMobileImage(image("large.jpg"), { decode: async () => drawable(), encode: async () => new Blob([new Uint8Array(2000)]), maxOutputBytes: 1000 })).rejects.toMatchObject({ code: "output-size" });
  });
});

describe("processMobileImages", () => {
  it("limita concorrência, mantém sucesso parcial e ordem da seleção", async () => {
    let active = 0; let peak = 0; const files = [image("slow.jpg"), image("bad.png", 100, "image/png"), image("fast.jpg")];
    const result = await processMobileImages(files, { concurrency: 2, decode: async (file) => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, file.name === "slow.jpg" ? 10 : 1)); active--; if (file.name === "bad.png") throw new Error("corrompida"); return drawable(100, 100); }, encode: async () => new Blob(["ok"]) });
    expect(peak).toBeLessThanOrEqual(2); expect(result.processed.map((x) => x.originalName)).toEqual(["slow.jpg", "fast.jpg"]); expect(result.rejected[0]).toMatchObject({ file: files[1], code: "decode" });
  });
  it("rejeita excedentes sem perder válidos", async () => { const files = [image("a.jpg"), image("b.jpg"), image("c.jpg")]; const result = await processMobileImages(files, { maxFiles: 2, decode: async () => drawable(100, 100), encode: async () => new Blob(["ok"]) }); expect(result.processed).toHaveLength(2); expect(result.rejected[0]).toMatchObject({ file: files[2] }); });
  it("respeita cancelamento", async () => { const controller = new AbortController(); controller.abort(); await expect(processMobileImage(image("a.jpg"), { signal: controller.signal })).rejects.toMatchObject({ code: "cancelled" }); });
});

describe("quota DataURL", () => {
  it("considera expansão base64 no limite individual", async () => { await expect(blobToBoundedDataUrl(new Blob(["1234"]), 5)).rejects.toBeInstanceOf(MobileImageError); });
  it("aplica limite agregado e mantém os sucessos anteriores", async () => { const first = new Blob(["1234"], { type: "image/jpeg" }); const result = await blobsToBoundedDataUrls([first, first], { maxEachBytes: 100, maxAggregateBytes: 40 }); expect(result.values).toHaveLength(1); expect(result.rejected).toHaveLength(1); });
});

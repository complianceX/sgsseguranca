export const MOBILE_IMAGE_LIMITS = {
  maxInputBytes: 20 * 1024 * 1024,
  maxOutputBytes: 2 * 1024 * 1024,
  maxDataUrlBytes: 3 * 1024 * 1024,
  maxAggregateDataUrlBytes: 12 * 1024 * 1024,
  maxFiles: 12,
  maxWidth: 1600,
  maxHeight: 1200,
  maxDimension: 16_384,
  maxPixels: 40_000_000,
  concurrency: 2,
} as const;

export const MOBILE_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type MobileImageOutputMime = "image/jpeg" | "image/webp";
export type ImageHeader = { mimeType: (typeof MOBILE_IMAGE_MIME_TYPES)[number]; width: number; height: number };
export type ProcessedMobileImage = { file: File; sourceFile: File; width: number; height: number; originalName: string; originalBytes: number; outputBytes: number; mimeType: MobileImageOutputMime; processedAt: string };
export type MobileImageFailure = { file: File; code: "type" | "input-size" | "dimensions" | "output-size" | "quota" | "decode" | "cancelled" | "unknown"; message: string };
export class MobileImageError extends Error {
  constructor(public readonly code: MobileImageFailure["code"], message: string) { super(message); this.name = "MobileImageError"; }
}
type Drawable = CanvasImageSource & { width: number; height: number; close?: () => void };
type ProcessOptions = {
  maxInputBytes?: number; maxOutputBytes?: number; maxWidth?: number; maxHeight?: number;
  maxDimension?: number; maxPixels?: number; mimeType?: MobileImageOutputMime; quality?: number;
  signal?: AbortSignal; decode?: (file: File) => Promise<Drawable>;
  encode?: (drawable: Drawable, width: number, height: number, mime: MobileImageOutputMime, quality: number) => Promise<Blob>;
};
const be16 = (v: Uint8Array, o: number) => (v[o]! << 8) | v[o + 1]!;
const be32 = (v: Uint8Array, o: number) => ((v[o]! * 0x1000000) + (v[o + 1]! << 16) + (v[o + 2]! << 8) + v[o + 3]!) >>> 0;
const le24 = (v: Uint8Array, o: number) => v[o]! | (v[o + 1]! << 8) | (v[o + 2]! << 16);
const le32 = (v: Uint8Array, o: number) => (v[o]! | (v[o + 1]! << 8) | (v[o + 2]! << 16) | (v[o + 3]! << 24)) >>> 0;

/** Reads only the encoded header. This must run before browser decode to reject decompression bombs. */
export async function parseImageHeader(file: Blob): Promise<ImageHeader> {
  const headerBlob = file.slice(0, Math.min(file.size, 512 * 1024));
  const buffer = typeof headerBlob.arrayBuffer === "function"
    ? await headerBlob.arrayBuffer()
    : await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(headerBlob);
      });
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52) {
    return { mimeType: "image/png", width: be32(bytes, 16), height: be32(bytes, 20) };
  }
  if (bytes.length >= 10 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1]!;
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = be16(bytes, offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return { mimeType: "image/jpeg", height: be16(bytes, offset + 3), width: be16(bytes, offset + 5) };
      }
      offset += length;
    }
  }
  if (bytes.length >= 30 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    const kind = String.fromCharCode(...bytes.slice(12, 16));
    if (kind === "VP8X") return { mimeType: "image/webp", width: 1 + le24(bytes, 24), height: 1 + le24(bytes, 27) };
    if (kind === "VP8L" && bytes[20] === 0x2f) {
      const bits = le32(bytes, 21);
      return { mimeType: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (kind === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return { mimeType: "image/webp", width: be16(new Uint8Array([bytes[27]!, bytes[26]!]), 0) & 0x3fff, height: be16(new Uint8Array([bytes[29]!, bytes[28]!]), 0) & 0x3fff };
  }
  throw new MobileImageError("decode", "Cabeçalho de imagem inválido ou não suportado.");
}
function throwIfAborted(signal?: AbortSignal) { if (signal?.aborted) throw new MobileImageError("cancelled", "Processamento cancelado."); }
function targetSize(width: number, height: number, maxWidth: number, maxHeight: number) { const ratio = Math.min(1, maxWidth / width, maxHeight / height); return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) }; }
async function decodeBrowserImage(file: File, header: ImageHeader, maxWidth: number, maxHeight: number): Promise<Drawable> {
  if (typeof createImageBitmap === "function") {
    try {
      const target = targetSize(header.width, header.height, maxWidth, maxHeight);
      return await createImageBitmap(file, { imageOrientation: "from-image", resizeWidth: target.width, resizeHeight: target.height, resizeQuality: "high" }) as Drawable;
    } catch { /* WebView/Safari fallback. */ }
  }
  const objectUrl = URL.createObjectURL(file);
  try { return await new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new MobileImageError("decode", "Não foi possível abrir a imagem.")); image.src = objectUrl; }); }
  finally { URL.revokeObjectURL(objectUrl); }
}
async function encodeCanvas(drawable: Drawable, width: number, height: number, mime: MobileImageOutputMime, quality: number): Promise<Blob> {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d"); if (!context) throw new MobileImageError("unknown", "O navegador não permite otimizar esta imagem.");
  context.drawImage(drawable, 0, 0, width, height);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new MobileImageError("unknown", "Falha ao comprimir a imagem.")), mime, quality));
}
function outputName(name: string, mime: MobileImageOutputMime) { const base = name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]+/g, "-") || "foto"; return `${base}.${mime === "image/webp" ? "webp" : "jpg"}`; }
export async function processMobileImage(file: File, options: ProcessOptions = {}): Promise<ProcessedMobileImage> {
  const maxInputBytes = options.maxInputBytes ?? MOBILE_IMAGE_LIMITS.maxInputBytes;
  const maxOutputBytes = options.maxOutputBytes ?? MOBILE_IMAGE_LIMITS.maxOutputBytes;
  if (!(MOBILE_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) throw new MobileImageError("type", "Formato não aceito. Use JPEG, PNG ou WebP.");
  if (file.size <= 0 || file.size > maxInputBytes) throw new MobileImageError("input-size", `A imagem deve ter no máximo ${Math.round(maxInputBytes / 1024 / 1024)} MB.`);
  throwIfAborted(options.signal);
  const header = await parseImageHeader(file);
  if (header.mimeType !== file.type) throw new MobileImageError("type", "O conteúdo da imagem não corresponde ao formato declarado.");
  const maxDimension = options.maxDimension ?? MOBILE_IMAGE_LIMITS.maxDimension;
  const maxPixels = options.maxPixels ?? MOBILE_IMAGE_LIMITS.maxPixels;
  if (!header.width || !header.height || header.width > maxDimension || header.height > maxDimension || header.width * header.height > maxPixels) throw new MobileImageError("dimensions", "Dimensões da imagem excedem o limite seguro.");
  throwIfAborted(options.signal);
  const maxWidth = options.maxWidth ?? MOBILE_IMAGE_LIMITS.maxWidth; const maxHeight = options.maxHeight ?? MOBILE_IMAGE_LIMITS.maxHeight;
  let drawable: Drawable;
  try { drawable = await (options.decode ? options.decode(file) : decodeBrowserImage(file, header, maxWidth, maxHeight)); }
  catch (error) { if (error instanceof MobileImageError) throw error; throw new MobileImageError("decode", "Não foi possível abrir a imagem."); }
  try {
    if (!drawable.width || !drawable.height) throw new MobileImageError("decode", "A imagem não possui dimensões válidas.");
    let { width, height } = targetSize(drawable.width, drawable.height, maxWidth, maxHeight);
    const mime = options.mimeType ?? "image/jpeg"; let quality = Math.min(0.92, Math.max(0.45, options.quality ?? (mime === "image/webp" ? 0.82 : 0.8))); const encode = options.encode ?? encodeCanvas; let blob: Blob | undefined;
    for (let attempt = 0; attempt < 9; attempt += 1) { throwIfAborted(options.signal); blob = await encode(drawable, width, height, mime, quality); if (blob.size <= maxOutputBytes) break; if (quality > 0.5) quality = Math.max(0.5, quality - 0.1); else { width = Math.max(1, Math.round(width * 0.85)); height = Math.max(1, Math.round(height * 0.85)); } }
    if (!blob || blob.size > maxOutputBytes) throw new MobileImageError("output-size", "A imagem não pôde ser reduzida ao limite seguro de armazenamento.");
    throwIfAborted(options.signal);
    // Canvas re-encoding intentionally strips EXIF/GPS/device metadata.
    const processedFile = new File([blob], outputName(file.name, mime), { type: mime, lastModified: file.lastModified || Date.now() });
    return { file: processedFile, sourceFile: file, width, height, originalName: file.name, originalBytes: file.size, outputBytes: processedFile.size, mimeType: mime, processedAt: new Date().toISOString() };
  } finally { drawable.close?.(); }
}
export async function processMobileImages(files: readonly File[], options: ProcessOptions & { maxFiles?: number; concurrency?: number; onProgress?: (completed: number, total: number, file: File) => void } = {}): Promise<{ processed: ProcessedMobileImage[]; rejected: MobileImageFailure[] }> {
  const maxFiles = options.maxFiles ?? MOBILE_IMAGE_LIMITS.maxFiles; const accepted = files.slice(0, maxFiles);
  const overflow = files.slice(maxFiles).map((file) => ({ file, code: "input-size" as const, message: `Limite de ${maxFiles} imagens por seleção excedido.` }));
  const slots: Array<{ processed?: ProcessedMobileImage; rejected?: MobileImageFailure }> = Array.from({ length: accepted.length }, () => ({})); let cursor = 0; let completed = 0;
  const worker = async () => { while (cursor < accepted.length) { const index = cursor++; const file = accepted[index]; if (!file) return; try { slots[index]!.processed = await processMobileImage(file, options); } catch (error) { slots[index]!.rejected = { file, code: error instanceof MobileImageError ? error.code : "unknown", message: error instanceof Error ? error.message : "Falha ao processar imagem." }; } finally { completed += 1; options.onProgress?.(completed, accepted.length, file); } } };
  const concurrency = Math.max(1, Math.min(options.concurrency ?? MOBILE_IMAGE_LIMITS.concurrency, accepted.length || 1)); await Promise.all(Array.from({ length: concurrency }, worker));
  return { processed: slots.flatMap((slot) => slot.processed ? [slot.processed] : []), rejected: [...slots.flatMap((slot) => slot.rejected ? [slot.rejected] : []), ...overflow] };
}
export function dataUrlStorageBytes(dataUrl: string) { return new Blob([dataUrl]).size; }
export function blobToBoundedDataUrl(blob: Blob, maxDataUrlBytes = MOBILE_IMAGE_LIMITS.maxDataUrlBytes): Promise<string> {
  const estimatedBase64Bytes = Math.ceil(blob.size / 3) * 4 + 64;
  if (estimatedBase64Bytes > maxDataUrlBytes) return Promise.reject(new MobileImageError("quota", "Imagem acima da quota offline após codificação base64."));
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => { const value = String(reader.result); if (dataUrlStorageBytes(value) > maxDataUrlBytes) reject(new MobileImageError("quota", "Imagem acima da quota offline após codificação base64.")); else resolve(value); }; reader.onerror = () => reject(new MobileImageError("unknown", "Falha ao preparar imagem offline.")); reader.readAsDataURL(blob); });
}
export async function blobsToBoundedDataUrls(blobs: readonly Blob[], options: { maxEachBytes?: number; maxAggregateBytes?: number; existingDataUrls?: readonly string[] } = {}) {
  const maxAggregate = options.maxAggregateBytes ?? MOBILE_IMAGE_LIMITS.maxAggregateDataUrlBytes;
  let used = (options.existingDataUrls ?? []).reduce((sum, value) => sum + dataUrlStorageBytes(value), 0); const values: string[] = []; const rejected: Blob[] = [];
  for (const blob of blobs) { try { const value = await blobToBoundedDataUrl(blob, options.maxEachBytes); const size = dataUrlStorageBytes(value); if (used + size > maxAggregate) throw new MobileImageError("quota", "Limite agregado de fotos offline excedido."); used += size; values.push(value); } catch { rejected.push(blob); } }
  return { values, rejected, totalBytes: used };
}

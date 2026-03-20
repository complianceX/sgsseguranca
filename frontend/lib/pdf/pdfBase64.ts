export type PdfOutputType = "arraybuffer" | "datauri" | "dataurl";

export type PdfOutputDoc = {
  output: (type: PdfOutputType) => string | ArrayBuffer;
};

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  if (typeof btoa === "function") {
    return btoa(binary);
  }

  throw new Error(
    "Nao foi possivel converter o PDF para base64: ambiente sem Buffer ou btoa.",
  );
}

export function pdfDocToBase64(doc: PdfOutputDoc): string {
  try {
    const raw = doc.output("arraybuffer");
    if (raw instanceof ArrayBuffer) {
      return bytesToBase64(new Uint8Array(raw));
    }
  } catch {
    // fallback below for environments where arraybuffer is unavailable
  }

  const dataUri = String(doc.output("datauri"));
  const marker = "base64,";
  const idx = dataUri.indexOf(marker);
  return idx >= 0 ? dataUri.slice(idx + marker.length) : dataUri;
}

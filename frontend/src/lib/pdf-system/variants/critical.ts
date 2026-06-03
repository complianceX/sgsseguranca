import type { PdfVariant } from "./types";

export const criticalVariant: PdfVariant = {
  name: "critical",
  label: "Documento Critico",
  tone: {
    brand: [123, 20, 20],
    brandStrong: [79, 18, 18],
    danger: [153, 27, 27],
    warning: [180, 83, 9],
  },
};


import { drawEvidenceGallery } from "./EvidenceGallery";
import { baseTone, spacing, typography } from "../tokens/visualTokens";
import type { PdfContext } from "../core/types";

function createMockContext(): {
  ctx: PdfContext;
  doc: {
    splitTextToSize: jest.Mock;
    setFillColor: jest.Mock;
    setDrawColor: jest.Mock;
    setLineWidth: jest.Mock;
    roundedRect: jest.Mock;
    rect: jest.Mock;
    setFont: jest.Mock;
    setFontSize: jest.Mock;
    setTextColor: jest.Mock;
    text: jest.Mock;
    addImage: jest.Mock;
    getImageProperties: jest.Mock;
    line: jest.Mock;
  };
} {
  const doc = {
    splitTextToSize: jest.fn((value: string) => [value]),
    setFillColor: jest.fn(),
    setDrawColor: jest.fn(),
    setLineWidth: jest.fn(),
    roundedRect: jest.fn(),
    rect: jest.fn(),
    setFont: jest.fn(),
    setFontSize: jest.fn(),
    setTextColor: jest.fn(),
    text: jest.fn(),
    addImage: jest.fn(),
    getImageProperties: jest.fn(() => ({ width: 120, height: 90, fileType: "PNG" })),
    line: jest.fn(),
  };

  return {
    doc,
    ctx: {
      doc: doc as unknown as PdfContext["doc"],
      pageWidth: 210,
      pageHeight: 297,
      margin: 16,
      contentWidth: 178,
      y: 24,
      theme: {
        variant: "photographic",
        tone: baseTone,
        typography,
        spacing,
      },
    },
  };
}

describe("drawEvidenceGallery", () => {
  it("keeps textual evidence visible when image is missing", async () => {
    const { ctx, doc } = createMockContext();

    await drawEvidenceGallery(ctx, {
      title: "Galeria",
      items: [
        {
          title: "Registro 1",
          description: "Descricao da evidencia",
          meta: "Meta da evidencia",
        },
      ],
      resolveImageDataUrl: jest.fn().mockResolvedValue(null),
    });

    expect(doc.text).toHaveBeenCalledWith(
      "SEM FOTO",
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: "center" }),
    );
    expect(doc.addImage).not.toHaveBeenCalled();
    expect(ctx.y).toBeGreaterThan(24);
  });

  it("shows unavailable state when image loading fails", async () => {
    const { ctx, doc } = createMockContext();

    await drawEvidenceGallery(ctx, {
      title: "Galeria",
      items: [
        {
          title: "Registro 2",
          description: "Descricao da evidencia",
          meta: "Meta da evidencia",
        },
      ],
      resolveImageDataUrl: jest.fn().mockRejectedValue(new Error("falha")),
    });

    expect(doc.text).toHaveBeenCalledWith(
      "FOTO INDISPONIVEL",
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: "center" }),
    );
  });
});

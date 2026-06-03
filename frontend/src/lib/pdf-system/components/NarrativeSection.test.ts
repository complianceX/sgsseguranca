import { drawNarrativeSection } from "./NarrativeSection";
import { baseTone, spacing, typography } from "../tokens/visualTokens";
import type { PdfContext } from "../core/types";

function createMockContext(): {
  ctx: PdfContext;
  doc: {
    splitTextToSize: jest.Mock;
    addPage: jest.Mock;
    setFillColor: jest.Mock;
    setDrawColor: jest.Mock;
    setLineWidth: jest.Mock;
    roundedRect: jest.Mock;
    rect: jest.Mock;
    setFont: jest.Mock;
    setFontSize: jest.Mock;
    setTextColor: jest.Mock;
    text: jest.Mock;
  };
} {
  const doc = {
    splitTextToSize: jest.fn((value: string) =>
      String(value)
        .split("\n")
        .filter(Boolean),
    ),
    addPage: jest.fn(),
    setFillColor: jest.fn(),
    setDrawColor: jest.fn(),
    setLineWidth: jest.fn(),
    roundedRect: jest.fn(),
    rect: jest.fn(),
    setFont: jest.fn(),
    setFontSize: jest.fn(),
    setTextColor: jest.fn(),
    text: jest.fn(),
  };

  return {
    doc,
    ctx: {
      doc: doc as unknown as PdfContext["doc"],
      pageWidth: 210,
      pageHeight: 297,
      margin: 16,
      contentWidth: 178,
      y: 220,
      theme: {
        variant: "operational",
        tone: baseTone,
        typography,
        spacing,
      },
    },
  };
}

describe("drawNarrativeSection", () => {
  it("quebra o texto em multiplas paginas quando a narrativa e longa", () => {
    const { ctx, doc } = createMockContext();
    const longContent = Array.from({ length: 80 }, (_, index) => `Linha narrativa ${index + 1}`).join("\n");

    drawNarrativeSection(ctx, {
      title: "Contexto tecnico",
      content: longContent,
    });

    expect(doc.addPage).toHaveBeenCalled();
    expect(doc.text).toHaveBeenCalledWith(
      "Contexto tecnico (continuação)",
      expect.any(Number),
      expect.any(Number),
    );
    expect(ctx.y).toBeGreaterThan(22);
  });
});

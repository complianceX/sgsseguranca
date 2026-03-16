import { drawMetadataGrid } from "./MetadataGrid";
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
    line: jest.Mock;
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
      y: 240,
      theme: {
        variant: "operational",
        tone: baseTone,
        typography,
        spacing,
      },
    },
  };
}

describe("drawMetadataGrid", () => {
  it("abre nova pagina quando a proxima linha nao cabe mais na area restante", () => {
    const { ctx, doc } = createMockContext();
    const longValue = Array.from({ length: 14 }, (_, index) => `Linha ${index + 1}`).join("\n");

    drawMetadataGrid(ctx, {
      title: "Identificacao estendida",
      columns: 2,
      fields: [
        { label: "Campo 1", value: longValue },
        { label: "Campo 2", value: "Valor curto" },
      ],
    });

    expect(doc.addPage).toHaveBeenCalled();
    expect(ctx.y).toBeGreaterThanOrEqual(22);
  });
});

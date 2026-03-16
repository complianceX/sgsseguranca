import { drawSemanticTable } from "./SemanticTable";
import { baseTone, spacing, typography } from "../tokens/visualTokens";
import type { AutoTableFn, PdfContext } from "../core/types";

function createMockContext(): {
  ctx: PdfContext;
  doc: {
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
    lastAutoTable?: { finalY?: number };
  };
  autoTable: jest.Mock;
} {
  const doc = {
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

  const autoTable = jest.fn((targetDoc: typeof doc, options: { startY?: number }) => {
    targetDoc.lastAutoTable = { finalY: (options.startY || 0) + 18 };
  });

  return {
    doc,
    autoTable,
    ctx: {
      doc: doc as unknown as PdfContext["doc"],
      pageWidth: 210,
      pageHeight: 297,
      margin: 16,
      contentWidth: 178,
      y: 252,
      theme: {
        variant: "operational",
        tone: baseTone,
        typography,
        spacing,
      },
    },
  };
}

describe("drawSemanticTable", () => {
  it("abre nova pagina antes do titulo quando nao ha espaco para cabecalho e primeira linha", () => {
    const { ctx, doc, autoTable } = createMockContext();

    drawSemanticTable(ctx, {
      title: "Tabela critica",
      head: [["Coluna A", "Status"]],
      body: [["Texto importante", "Conforme"]],
      autoTable: autoTable as unknown as AutoTableFn,
    });

    expect(doc.addPage).toHaveBeenCalled();
    expect(autoTable).toHaveBeenCalled();
    expect(ctx.y).toBeGreaterThanOrEqual(22);
  });
});

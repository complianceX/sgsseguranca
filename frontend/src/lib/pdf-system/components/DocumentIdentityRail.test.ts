import { drawDocumentIdentityRail } from "./DocumentIdentityRail";
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
    splitTextToSize: jest.fn((value: string) => [String(value)]),
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
      y: 24,
      theme: {
        variant: "operational",
        tone: baseTone,
        typography,
        spacing,
      },
    },
  };
}

describe("drawDocumentIdentityRail", () => {
  it("omite o campo de validade quando ele nao e informado", () => {
    const { ctx, doc } = createMockContext();

    drawDocumentIdentityRail(ctx, {
      documentType: "DDS",
      criticality: "moderate",
      documentClass: "operational",
    });

    expect(doc.text).not.toHaveBeenCalledWith(
      "VALIDADE",
      expect.any(Number),
      expect.any(Number),
    );
    expect(ctx.y).toBeGreaterThan(24);
  });
});

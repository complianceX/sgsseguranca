import QRCode from "qrcode";
import { drawGovernanceClosingBlock } from "./GovernanceClosingBlock";
import { baseTone, spacing, typography } from "../tokens/visualTokens";
import type { PdfContext } from "../core/types";

jest.mock("qrcode", () => ({
  __esModule: true,
  default: {
    toDataURL: jest.fn(),
  },
}));

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
    circle: jest.Mock;
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
    circle: jest.fn(),
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

describe("drawGovernanceClosingBlock", () => {
  beforeEach(() => {
    (QRCode.toDataURL as jest.Mock).mockResolvedValue("data:image/png;base64,qr-code");
  });

  it("renders unified governance closing with qr and signatures", async () => {
    const { ctx, doc } = createMockContext();

    await drawGovernanceClosingBlock(ctx, {
      code: "APR-2026-ABC123",
      url: "https://gst.example/validar/APR-2026-ABC123",
      hash: "a".repeat(64),
      signatures: [
        {
          label: "TST",
          name: "Maria Silva",
          role: "Tecnica de Seguranca",
          date: "2026-03-14T10:00:00.000Z",
        },
      ],
    });

    expect(QRCode.toDataURL).toHaveBeenCalledWith(
      "https://gst.example/validar/APR-2026-ABC123",
      expect.any(Object),
    );
    expect(doc.addImage).toHaveBeenCalledWith(
      "data:image/png;base64,qr-code",
      "PNG",
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
    expect(doc.text).toHaveBeenCalledWith(
      "Governanca, autenticidade e rastreabilidade",
      expect.any(Number),
      expect.any(Number),
    );
    expect(ctx.y).toBeGreaterThan(24);
  });
});

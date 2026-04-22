import { createPdfContext, decorateCurrentPage, startNewPage } from "./grid";

describe("pdf grid page decoration", () => {
  it("reaplica decoracao da pagina e atualiza o topo reservado ao abrir nova folha", () => {
    const doc = {
      internal: {
        pageSize: {
          getWidth: jest.fn(() => 210),
          getHeight: jest.fn(() => 297),
        },
      },
      addPage: jest.fn(),
      setFillColor: jest.fn(),
      rect: jest.fn(),
    };

    const ctx = createPdfContext(doc as never, "operational");
    ctx.decoratePage = jest.fn((currentCtx) => {
      currentCtx.y = 52;
      return currentCtx.y;
    });

    const top = decorateCurrentPage(ctx);

    expect(top).toBe(52);
    expect(doc.rect).toHaveBeenCalled();

    startNewPage(ctx);

    expect(doc.addPage).toHaveBeenCalled();
    expect(ctx.y).toBe(52);
    expect(ctx.pageTop).toBe(52);
  });
});

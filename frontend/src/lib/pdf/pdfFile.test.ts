import { fetchImageAsDataUrl } from "./pdfFile";

describe("fetchImageAsDataUrl", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      value: jest.fn(),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalFetch) {
      Object.defineProperty(globalThis, "fetch", {
        value: originalFetch,
        configurable: true,
        writable: true,
      });
    } else {
      delete (globalThis as { fetch?: unknown }).fetch;
    }
  });

  it("rejeita esquemas nao permitidos sem acionar fetch", async () => {
    const fetchSpy = globalThis.fetch as jest.Mock;

    await expect(fetchImageAsDataUrl("ftp://example.com/photo.png")).resolves.toBeNull();
    await expect(fetchImageAsDataUrl("javascript:alert(1)")).resolves.toBeNull();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("preserva data urls", async () => {
    await expect(
      fetchImageAsDataUrl("data:image/png;base64,AAAA"),
    ).resolves.toBe("data:image/png;base64,AAAA");
  });
});

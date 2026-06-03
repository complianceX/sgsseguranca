import { safeInternalHref } from "./safe-internal-href";

describe("safeInternalHref", () => {
  it("permite somente rotas internas conhecidas", () => {
    expect(safeInternalHref("/dashboard/aprs/edit/123?tab=docs")).toBe(
      "/dashboard/aprs/edit/123?tab=docs",
    );
    expect(safeInternalHref("/dashboard")).toBe("/dashboard");
  });

  it("bloqueia protocolos e origens externas", () => {
    expect(safeInternalHref("javascript:alert(1)")).toBeNull();
    expect(
      safeInternalHref("data:text/html,<script>alert(1)</script>"),
    ).toBeNull();
    expect(safeInternalHref("https://evil.example/dashboard")).toBeNull();
    expect(safeInternalHref("//evil.example/dashboard")).toBeNull();
  });

  it("bloqueia paths fora da allowlist ou suspeitos", () => {
    expect(safeInternalHref("/login")).toBeNull();
    expect(safeInternalHref("/api/private")).toBeNull();
    expect(safeInternalHref("/dashboard\\evil")).toBeNull();
    expect(safeInternalHref("/dashboard/%5c%5c")).toBeNull();
  });
});

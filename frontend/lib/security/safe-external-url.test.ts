import { safeExternalArtifactUrl } from "./safe-external-url";

describe("safeExternalArtifactUrl", () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.sgsseguranca.com.br";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.sgsseguranca.com.br";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  });

  it("permite URLs do app, API configurada, R2 e blob local", () => {
    expect(safeExternalArtifactUrl("/validar/DDS-1?token=abc")).toMatch(
      /\/validar\/DDS-1\?token=abc$/,
    );
    expect(
      safeExternalArtifactUrl("https://api.sgsseguranca.com.br/storage/download/token"),
    ).toBe("https://api.sgsseguranca.com.br/storage/download/token");
    expect(
      safeExternalArtifactUrl("https://bucket.r2.cloudflarestorage.com/file.pdf"),
    ).toBe("https://bucket.r2.cloudflarestorage.com/file.pdf");
    expect(safeExternalArtifactUrl("blob:https://app.sgsseguranca.com.br/123")).toBe(
      "blob:https://app.sgsseguranca.com.br/123",
    );
  });

  it("bloqueia protocolos, origens externas e paths suspeitos", () => {
    expect(safeExternalArtifactUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalArtifactUrl("data:text/html,<script>x</script>")).toBeNull();
    expect(safeExternalArtifactUrl("https://evil.example/file.pdf")).toBeNull();
    expect(safeExternalArtifactUrl("//evil.example/file.pdf")).toBeNull();
    expect(safeExternalArtifactUrl("blob:https://evil.example/123")).toBeNull();
    expect(safeExternalArtifactUrl("/storage/%5c%5c/private.pdf")).toBeNull();
  });
});

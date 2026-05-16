import {
  buildDdsValidationApiPath,
  buildGenericVerifyRedirect,
  formatValidationSecurityReason,
  isDdsValidationCode,
} from "./validation-utils";

describe("validation-utils", () => {
  it("detecta códigos DDS pela rota ou query module", () => {
    expect(isDdsValidationCode("DDS-2026-ABCD1234")).toBe(true);
    expect(isDdsValidationCode("PT-2026-ABCD1234", "dds")).toBe(true);
    expect(isDdsValidationCode("PT-2026-ABCD1234")).toBe(false);
  });

  it("monta a rota pública dedicada do DDS preservando o token", () => {
    expect(buildDdsValidationApiPath("DDS-2026-ABCD1234", "token-123")).toBe(
      "/public/dds/validate?code=DDS-2026-ABCD1234&token=token-123",
    );
  });

  it("mantém o redirect genérico para módulos não DDS", () => {
    expect(buildGenericVerifyRedirect("PT-2026-ABCD1234", "token-123")).toBe(
      "/verify?code=PT-2026-ABCD1234&token=token-123",
    );
  });

  it("traduz os motivos antifraude para o portal público", () => {
    expect(formatValidationSecurityReason("legacy_without_token")).toBe(
      "Consulta pública sem token",
    );
  });
});

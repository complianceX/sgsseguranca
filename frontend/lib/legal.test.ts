import { getPublicLegalConfig } from "./legal";

const LEGAL_ENV_KEYS = [
  "NEXT_PUBLIC_LEGAL_COMPANY_NAME",
  "NEXT_PUBLIC_LEGAL_COMPANY_DOCUMENT",
  "NEXT_PUBLIC_LEGAL_COMPANY_ADDRESS",
  "NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL",
  "NEXT_PUBLIC_LEGAL_SUPPORT_EMAIL",
  "NEXT_PUBLIC_LEGAL_CONTACT_EMAIL",
  "NEXT_PUBLIC_LEGAL_DPO_NAME",
  "NEXT_PUBLIC_LEGAL_DPO_EMAIL",
  "NEXT_PUBLIC_LEGAL_DPO_PHONE",
  "NEXT_PUBLIC_LEGAL_FORUM_CITY_STATE",
  "NEXT_PUBLIC_LEGAL_POLICY_VERSION",
  "NEXT_PUBLIC_LEGAL_TERMS_VERSION",
  "NEXT_PUBLIC_APP_ENV",
] as const;

function clearLegalEnv() {
  for (const key of LEGAL_ENV_KEYS) {
    delete process.env[key];
  }
}

function fillCompleteLegalEnv() {
  process.env.NEXT_PUBLIC_LEGAL_COMPANY_NAME = "SGS Ltda";
  process.env.NEXT_PUBLIC_LEGAL_COMPANY_DOCUMENT = "00.000.000/0001-00";
  process.env.NEXT_PUBLIC_LEGAL_COMPANY_ADDRESS = "Rua X, 123";
  process.env.NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL = "privacidade@sgs.test";
  process.env.NEXT_PUBLIC_LEGAL_SUPPORT_EMAIL = "suporte@sgs.test";
  process.env.NEXT_PUBLIC_LEGAL_DPO_NAME = "Maria Silva";
  process.env.NEXT_PUBLIC_LEGAL_DPO_EMAIL = "dpo@sgs.test";
  process.env.NEXT_PUBLIC_LEGAL_FORUM_CITY_STATE = "Sao Paulo/SP";
  process.env.NEXT_PUBLIC_LEGAL_POLICY_VERSION = "2026-05-01";
  process.env.NEXT_PUBLIC_LEGAL_TERMS_VERSION = "2026-05-01";
}

describe("getPublicLegalConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearLegalEnv();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("uses the dedicated support email when available", () => {
    process.env.NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL = "privacidade@sgs.test";
    process.env.NEXT_PUBLIC_LEGAL_SUPPORT_EMAIL = "suporte@sgs.test";
    process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL = "contato-legado@sgs.test";

    const config = getPublicLegalConfig();

    expect(config.supportEmail).toBe("suporte@sgs.test");
    expect(config.contactEmail).toBe("contato-legado@sgs.test");
    expect(config.missingRequiredFields).not.toEqual(
      expect.arrayContaining([
        {
          envName: "NEXT_PUBLIC_LEGAL_SUPPORT_EMAIL",
          label: "canal oficial de suporte",
        },
      ]),
    );
  });

  it("falls back to the privacy email while still flagging support as missing", () => {
    process.env.NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL = "privacidade@sgs.test";

    const config = getPublicLegalConfig();

    expect(config.supportEmail).toBe("privacidade@sgs.test");
    expect(config.missingRequiredFields).toEqual(
      expect.arrayContaining([
        {
          envName: "NEXT_PUBLIC_LEGAL_SUPPORT_EMAIL",
          label: "canal oficial de suporte",
        },
      ]),
    );
  });

  it("expõe DPO, versões e telefone quando configurados", () => {
    fillCompleteLegalEnv();
    process.env.NEXT_PUBLIC_LEGAL_DPO_PHONE = "+55 11 99999-9999";

    const config = getPublicLegalConfig();

    expect(config.dpoName).toBe("Maria Silva");
    expect(config.dpoEmail).toBe("dpo@sgs.test");
    expect(config.dpoPhone).toBe("+55 11 99999-9999");
    expect(config.policyVersion).toBe("2026-05-01");
    expect(config.termsVersion).toBe("2026-05-01");
    expect(config.missingRequiredFields).toEqual([]);
  });

  describe("fail-fast em produção", () => {
    it("lança quando campos obrigatórios faltam em NODE_ENV=production", () => {
      process.env.NEXT_PUBLIC_APP_ENV = "production";

      expect(() => getPublicLegalConfig()).toThrow(
        /LGPD\/Legal config inválida/,
      );
    });

    it("lança quando NEXT_PUBLIC_APP_ENV=production mesmo com NODE_ENV=test", () => {
      process.env.NEXT_PUBLIC_APP_ENV = "production";

      expect(() => getPublicLegalConfig()).toThrow(
        /LGPD\/Legal config inválida/,
      );
    });

    it("não lança em produção quando todas as envs obrigatórias estão preenchidas", () => {
      process.env.NEXT_PUBLIC_APP_ENV = "production";
      fillCompleteLegalEnv();

      expect(() => getPublicLegalConfig()).not.toThrow();
    });

    it("apenas sinaliza campos faltantes em desenvolvimento (não lança)", () => {
      // NEXT_PUBLIC_APP_ENV unset (development/test default)
      delete process.env.NEXT_PUBLIC_APP_ENV;

      const config = getPublicLegalConfig();
      expect(config.missingRequiredFields.length).toBeGreaterThan(0);
    });
  });
});

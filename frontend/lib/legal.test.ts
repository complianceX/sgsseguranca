import { getPublicLegalConfig } from "./legal";

describe("getPublicLegalConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL;
    delete process.env.NEXT_PUBLIC_LEGAL_SUPPORT_EMAIL;
    delete process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL;
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
});

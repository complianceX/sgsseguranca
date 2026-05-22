import { buildApiUrl } from "@/lib/api";
import { publicDdsSignatureService } from "./publicDdsSignatureService";

jest.mock("@/lib/api", () => ({
  buildApiUrl: jest.fn((path: string) => `https://api.sgs.test${path}`),
}));

describe("publicDdsSignatureService", () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const buildApiUrlMock = buildApiUrl as jest.MockedFunction<
    typeof buildApiUrl
  >;

  beforeEach(() => {
    fetchMock.mockReset();
    buildApiUrlMock.mockImplementation(
      (path: string) => `https://api.sgs.test${path}`,
    );
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("busca o contexto publico do DDS pelo token", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        inviteId: "invite-1",
        status: "pending",
        expiresAt: "2026-05-29T00:00:00.000Z",
        signedAt: null,
        signer: { name: "Ana TST", role: "Tecnica" },
        dds: {
          id: "dds-1",
          tema: "DDS seguro",
          data: "2026-05-22",
          status: "publicado",
          companyName: "Cliente SGS",
          siteName: "Geral",
          facilitatorName: "Instrutor",
          version: 1,
        },
      }),
    });

    await expect(
      publicDdsSignatureService.getContext("token-1"),
    ).resolves.toMatchObject({
      inviteId: "invite-1",
      signer: { name: "Ana TST" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.sgs.test/public/dds/signature/token-1",
      {
        method: "GET",
        cache: "no-store",
      },
    );
  });

  it("envia assinatura publica sem depender de cookie ou header CSRF", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        signed: true,
        signatureId: "signature-1",
        signatureHash: "hash-1",
        signedAt: "2026-05-22T12:00:00.000Z",
      }),
    });

    await expect(
      publicDdsSignatureService.submit("token-1", {
        accepted_terms: true,
        signature_data: "data:image/png;base64,abc",
      }),
    ).resolves.toMatchObject({
      signed: true,
      signatureId: "signature-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.sgs.test/public/dds/signature/token-1",
      {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accepted_terms: true,
          signature_data: "data:image/png;base64,abc",
        }),
      },
    );
  });

  it("propaga mensagens detalhadas de validacao da API", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({
        message: "Dados inválidos",
        errors: [
          {
            field: "signature_data",
            errors: ["Assinatura pública deve ser uma imagem PNG em base64."],
          },
        ],
      }),
    });

    await expect(
      publicDdsSignatureService.submit("token-1", {
        accepted_terms: true,
        signature_data: "invalid",
      }),
    ).rejects.toThrow(
      "signature_data: Assinatura pública deve ser uma imagem PNG em base64.",
    );
  });
});

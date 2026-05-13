import {
  getSensitiveDraftExpiresAt,
  isSensitiveDraftExpired,
  sanitizeSensitiveDraftValue,
} from "./sensitive-draft-sanitizer";

describe("sanitizeSensitiveDraftValue", () => {
  it("remove PII, anexos, URLs assinadas e data URLs de rascunhos locais", () => {
    const sanitized = sanitizeSensitiveDraftValue({
      titulo: "APR",
      trabalhador: {
        nome: "Operador",
        cpf: "12345678900",
      },
      assinatura: "base64",
      evidencia: {
        descricao: "Queda de material",
        imageDataUrl: "data:image/png;base64,abc",
      },
      itens: [
        {
          atividade: "Corte",
          presignedUrl: "https://storage.local/private",
          observacao: "Usar bloqueio",
        },
      ],
    });

    expect(sanitized).toEqual({
      titulo: "APR",
      trabalhador: {
        nome: "Operador",
      },
      itens: [
        {
          atividade: "Corte",
          observacao: "Usar bloqueio",
        },
      ],
    });
  });

  it("expira rascunhos locais sensiveis apos a janela definida", () => {
    const savedAt = new Date("2026-05-12T10:00:00.000Z").getTime();
    const expiresAt = getSensitiveDraftExpiresAt(savedAt);

    expect(
      isSensitiveDraftExpired({
        savedAt,
        expiresAt,
        now: new Date("2026-05-12T15:59:59.000Z").getTime(),
      }),
    ).toBe(false);
    expect(
      isSensitiveDraftExpired({
        savedAt,
        expiresAt,
        now: new Date("2026-05-12T16:00:00.000Z").getTime(),
      }),
    ).toBe(true);
  });
});

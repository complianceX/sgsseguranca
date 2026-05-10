import { sanitizeSensitiveDraftValue } from "./sensitive-draft-sanitizer";

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
});

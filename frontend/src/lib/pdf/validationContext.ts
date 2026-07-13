import api from "../api";

export type PdfValidationContext = {
  documentCode: string | null;
  token: string | null;
};

const EMPTY: PdfValidationContext = { documentCode: null, token: null };

/**
 * Busca o contexto de validação pública (código documental + token de grant)
 * do backend antes de gerar o PDF. O código retornado é o canônico (o mesmo
 * gravado no document_registry na emissão), e o token permite que o QR do
 * documento valide no portal público (/public/documents/validate).
 *
 * Falha de rede/permissão não pode impedir a emissão do PDF — retorna vazio
 * e o gerador usa o código local como fallback (QR sem token).
 * Sem cache: o token tem TTL e a emissão de PDF é um evento raro.
 */
export async function resolveValidationContext(
  modulePath: string,
  id: string | undefined | null,
): Promise<PdfValidationContext> {
  if (!id) return EMPTY;

  try {
    const { data } = await api.get<{
      documentCode?: string | null;
      token?: string | null;
    }>(`/${modulePath}/${id}/validation-context`);

    return {
      documentCode:
        typeof data?.documentCode === "string" && data.documentCode
          ? data.documentCode
          : null,
      token: typeof data?.token === "string" && data.token ? data.token : null,
    };
  } catch {
    return EMPTY;
  }
}

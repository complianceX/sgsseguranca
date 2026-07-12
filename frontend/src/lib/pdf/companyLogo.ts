import api from "../api";
import { fetchImageAsDataUrl } from "./pdfFile";

/**
 * A logo da empresa mora no storage governado (B2) e o bucket não expõe CORS
 * para fetch no navegador. O endpoint /companies/current/logo entrega a logo
 * como data URL pela própria API, pronta para o jsPDF.
 *
 * Cache em memória por sessão: a logo muda raramente e cada emissão de PDF
 * não deve custar uma chamada extra.
 */
let cachedLogoDataUrl: string | null | undefined;

export function clearCompanyLogoCache(): void {
  cachedLogoDataUrl = undefined;
}

export async function resolveCompanyLogoDataUrl(
  company?: { logo_url?: string | null } | null,
): Promise<string | null> {
  // Compatibilidade: se o documento já trouxe uma logo utilizável
  // (data URL legada ou URL http acessível), usa direto.
  if (company?.logo_url) {
    const fromUrl = await fetchImageAsDataUrl(company.logo_url);
    if (fromUrl) return fromUrl;
  }

  if (cachedLogoDataUrl !== undefined) {
    return cachedLogoDataUrl;
  }

  try {
    const { data } = await api.get<{ logo_data_url?: string | null }>(
      "/companies/current/logo",
    );
    const value =
      typeof data?.logo_data_url === "string" && data.logo_data_url
        ? data.logo_data_url
        : null;
    cachedLogoDataUrl = value;
    return value;
  } catch {
    // Falha de rede/permissão não pode impedir a emissão do PDF —
    // não cacheia para tentar de novo na próxima emissão.
    return null;
  }
}

import { buildApiUrl } from "@/lib/api";
import type { DdsStatus } from "./ddsService";

export type PublicDdsSignatureContext = {
  inviteId: string;
  status: "pending" | "signed";
  expiresAt: string;
  signedAt: string | null;
  signer: {
    name: string;
    role: string | null;
  };
  dds: {
    id: string;
    tema: string;
    data: string | null;
    status: DdsStatus;
    companyName: string | null;
    siteName: string | null;
    facilitatorName: string | null;
    version: number;
  };
};

export type PublicDdsSignatureSubmitResult = {
  signed: true;
  signatureId: string;
  signatureHash: string | null;
  signedAt: string | null;
};

function buildPublicSignatureUrl(token: string): string {
  const url = buildApiUrl(`/public/dds/signature/${encodeURIComponent(token)}`);
  if (!url) {
    throw new Error(
      "API pública não configurada. Defina NEXT_PUBLIC_API_URL.",
    );
  }
  return url;
}

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      message?: string | string[];
      error?: string;
    };
    if (Array.isArray(payload.message)) {
      return payload.message.join(" ");
    }
    return payload.message || payload.error || "Falha na assinatura pública.";
  } catch {
    return "Falha na assinatura pública.";
  }
}

export const publicDdsSignatureService = {
  getContext: async (token: string): Promise<PublicDdsSignatureContext> => {
    const response = await fetch(buildPublicSignatureUrl(token), {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(await readApiError(response));
    }
    return (await response.json()) as PublicDdsSignatureContext;
  },

  submit: async (
    token: string,
    payload: {
      accepted_terms: boolean;
      signature_data: string;
    },
  ): Promise<PublicDdsSignatureSubmitResult> => {
    const response = await fetch(buildPublicSignatureUrl(token), {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(await readApiError(response));
    }
    return (await response.json()) as PublicDdsSignatureSubmitResult;
  },
};

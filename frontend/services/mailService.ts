import axios from 'axios';
import api from '@/lib/api';
import { extractApiErrorMessage } from '@/lib/error-handler';
import type {
  DocumentMailDispatchResponse as GeneratedMailDispatchResponse,
  DocumentMailArtifactType as GeneratedMailArtifactType,
  DocumentMailDeliveryMode as GeneratedMailDeliveryMode,
} from '@/lib/api/generated/governed-contracts.client';

export type DocumentMailArtifactType = GeneratedMailArtifactType;
export type DocumentMailDeliveryMode = GeneratedMailDeliveryMode;
export type DocumentMailDispatchResponse = GeneratedMailDispatchResponse;

type MailDispatchErrorPayload = {
  message?: unknown;
  code?: unknown;
  blockedIp?: unknown;
  retryAfterSeconds?: unknown;
};

export const mailService = {
  async sendStoredDocument(
    documentId: string,
    documentType: string,
    email: string,
  ): Promise<DocumentMailDispatchResponse> {
    const response = await api.post('/mail/send-stored-document', {
      documentId,
      documentType,
      email,
    });
    return response.data as DocumentMailDispatchResponse;
  },

  async sendUploadedDocument(
    file: Blob,
    filename: string,
    email: string,
    docName: string,
    subject?: string,
  ): Promise<DocumentMailDispatchResponse> {
    const formData = new FormData();
    formData.append('file', file, filename);
    formData.append('email', email);
    formData.append('docName', docName);
    if (subject?.trim()) {
      formData.append('subject', subject.trim());
    }

    const response = await api.post('/mail/send-uploaded-document', formData);
    return response.data as DocumentMailDispatchResponse;
  },
};

export async function extractMailDispatchErrorMessage(
  error: unknown,
): Promise<string> {
  const fallback =
    'Nao foi possivel enviar o e-mail agora. Tente novamente em instantes.';
  const message = await extractApiErrorMessage(error, fallback);

  if (!axios.isAxiosError(error)) {
    return message;
  }

  const data = (error.response?.data ?? null) as MailDispatchErrorPayload | null;
  const code = typeof data?.code === 'string' ? data.code : undefined;
  const blockedIp =
    typeof data?.blockedIp === 'string' ? data.blockedIp : undefined;
  const retryAfterSeconds =
    typeof data?.retryAfterSeconds === 'number'
      ? data.retryAfterSeconds
      : undefined;

  if (code === 'BREVO_IP_NOT_AUTHORIZED') {
    return blockedIp
      ? `O provedor Brevo bloqueou o IP de saida atual do servidor (${blockedIp}). Autorize esse IP em Brevo > Security > Authorised IPs e tente novamente.`
      : message;
  }

  if (code === 'MAIL_PROVIDER_CIRCUIT_OPEN') {
    return retryAfterSeconds
      ? `O envio de e-mail esta temporariamente pausado apos falhas recentes na Brevo. Aguarde cerca de ${retryAfterSeconds}s e tente novamente.`
      : message;
  }

  return message;
}

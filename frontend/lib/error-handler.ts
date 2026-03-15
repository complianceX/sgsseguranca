import axios from 'axios';
import { toast } from 'sonner';

export interface FormErrorMessages {
  badRequest?: string;
  unauthorized?: string;
  forbidden?: string;
  server?: string;
  fallback?: string;
}

function normalizeValidationDetails(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const entry = item as Record<string, unknown>;
    const field =
      typeof entry.field === 'string' && entry.field.trim().length > 0
        ? entry.field.trim()
        : undefined;
    const errors = Array.isArray(entry.errors)
      ? entry.errors.filter(
          (error): error is string =>
            typeof error === 'string' && error.trim().length > 0,
        )
      : [];

    if (errors.length > 0) {
      return field ? `${field}: ${errors[0]}` : errors[0];
    }
  }

  return undefined;
}

function normalizeUnknownMessage(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeUnknownMessage(item);
      if (normalized) {
        return normalized;
      }
    }
    return undefined;
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;

    if ('details' in obj) {
      const normalizedDetails = normalizeValidationDetails(obj.details);
      if (normalizedDetails) {
        return normalizedDetails;
      }

      const normalized = normalizeUnknownMessage(obj.details);
      if (normalized) {
        return normalized;
      }
    }

    if ('errors' in obj) {
      const normalizedErrors = normalizeValidationDetails(obj.errors);
      if (normalizedErrors) {
        return normalizedErrors;
      }
    }

    if ('message' in obj) {
      const normalized = normalizeUnknownMessage(obj.message);
      if (normalized) {
        return normalized;
      }
    }

    if ('error' in obj) {
      const normalized = normalizeUnknownMessage(obj.error);
      if (normalized) {
        return normalized;
      }
    }
  }

  return undefined;
}

export function getFormErrorMessage(
  error: unknown,
  messages: FormErrorMessages,
): string {
  if (!axios.isAxiosError(error)) {
    return messages.fallback || 'Erro inesperado. Tente novamente.';
  }

  const status = error.response?.status;
  const normalizedMessage = normalizeUnknownMessage(error.response?.data);

  switch (status) {
    case 400:
    case 422:
      return normalizedMessage || messages.badRequest || messages.fallback || 'Dados inválidos.';
    case 401:
      return messages.unauthorized || messages.fallback || 'Sessão expirada.';
    case 403:
      return messages.forbidden || messages.fallback || 'Sem permissão para esta operação.';
    case 500:
      return messages.server || messages.fallback || 'Erro interno do servidor.';
    default:
      return messages.fallback || 'Falha na operação. Tente novamente.';
  }
}

/**
 * Centralizador de tratamento de erros de API.
 * Fornece mensagens amigáveis ao usuário baseadas no status code e contexto.
 */
export function handleApiError(error: unknown, context: string) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data;
    const message = normalizeUnknownMessage(data);

    console.error(
      `[API Error] ${context}: status=${status ?? 'unknown'} message=${message || 'sem mensagem legível'}`,
      {
        status,
        message,
        data,
        url: error.config?.url,
      },
    );

    switch (status) {
      case 401:
        toast.error('Sessão expirada. Faça login novamente.');
        if (typeof window !== 'undefined') {
          // Pequeno delay para o usuário ler o toast antes do redirecionamento
          setTimeout(() => {
            window.location.href = '/login';
          }, 1500);
        }
        break;
      case 403:
        toast.error('Você não tem permissão para realizar esta ação.');
        break;
      case 404:
        toast.error(`${context} não encontrado(a).`);
        break;
      case 422:
      case 400:
        toast.error(message || 'Dados inválidos. Verifique os campos.');
        break;
      case 429:
        toast.error('Muitas requisições. Tente novamente em alguns instantes.');
        break;
      case 500:
        toast.error('Erro interno no servidor. Nossa equipe já foi notificada.');
        break;
      default:
        toast.error(`Erro ao processar ${context.toLowerCase()}. Tente novamente.`);
    }
  } else {
    console.error(`[Unexpected Error] ${context}:`, error);
    toast.error('Erro de conexão ou erro inesperado. Verifique sua internet.');
  }
}

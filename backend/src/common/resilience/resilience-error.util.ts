type LooseRecord = Record<string, unknown>;

type ResilienceErrorLike = {
  message?: string;
  code?: string;
  status?: number;
  statusCode?: number;
  response?: {
    status?: number;
  } | null;
  cause?: {
    code?: string;
  } | null;
};

const isLooseRecord = (value: unknown): value is LooseRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function toResilienceErrorLike(
  error: unknown,
): ResilienceErrorLike | null {
  if (!isLooseRecord(error)) {
    return null;
  }

  const response = isLooseRecord(error.response)
    ? {
        status:
          typeof error.response.status === 'number'
            ? error.response.status
            : undefined,
      }
    : null;

  const cause = isLooseRecord(error.cause)
    ? {
        code:
          typeof error.cause.code === 'string' ? error.cause.code : undefined,
      }
    : null;

  return {
    message: typeof error.message === 'string' ? error.message : undefined,
    code: typeof error.code === 'string' ? error.code : undefined,
    status: typeof error.status === 'number' ? error.status : undefined,
    statusCode:
      typeof error.statusCode === 'number' ? error.statusCode : undefined,
    response,
    cause,
  };
}

export function extractResilienceErrorCode(error: unknown): string | undefined {
  const normalized = toResilienceErrorLike(error);
  return normalized?.code ?? normalized?.cause?.code;
}

export function extractResilienceErrorStatus(
  error: unknown,
): number | undefined {
  const normalized = toResilienceErrorLike(error);
  return (
    normalized?.status ?? normalized?.statusCode ?? normalized?.response?.status
  );
}

export function extractResilienceErrorMessage(
  error: unknown,
): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return toResilienceErrorLike(error)?.message;
}

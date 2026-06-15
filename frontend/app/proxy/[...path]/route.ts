function normalizeBaseUrl(rawValue: string | undefined): string | null {
  const value = rawValue?.trim();
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    const normalized = parsed.toString();
    return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  } catch {
    return value.endsWith('/') ? value.slice(0, -1) : value;
  }
}

const DEV_FALLBACK = 'http://localhost:3011';

function resolveBackendOrigin(): string {
  const explicitProxyTarget = normalizeBaseUrl(
    process.env.BACKEND_PROXY_URL ||
      (process.env.NODE_ENV !== 'production'
        ? process.env.API_URL || process.env.NEXT_PUBLIC_API_URL
        : undefined),
  );

  if (explicitProxyTarget) {
    return explicitProxyTarget;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'BACKEND_PROXY_URL não configurado. ' +
        'Defina esta variável de ambiente para o proxy do backend funcionar em produção.',
    );
  }

  return DEV_FALLBACK;
}

async function proxyRequest(
  request: Request,
  params: { path?: string[] },
): Promise<Response> {
  const backendOrigin = resolveBackendOrigin();
  const targetPath = `/${(params.path ?? []).join('/')}`;
  const targetUrl = new URL(targetPath, backendOrigin);
  targetUrl.search = new URL(request.url).search;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');

  const method = request.method.toUpperCase();
  const hasBody = !['GET', 'HEAD'].includes(method);
  const body = hasBody ? await request.arrayBuffer() : undefined;

  const upstream = await fetch(targetUrl, {
    method,
    headers,
    body,
    cache: 'no-store',
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('transfer-encoding');
  responseHeaders.delete('connection');

  const upstreamHeaders = upstream.headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof upstreamHeaders.getSetCookie === 'function') {
    responseHeaders.delete('set-cookie');
    for (const cookie of upstreamHeaders.getSetCookie()) {
      responseHeaders.append('set-cookie', cookie);
    }
  }

  const responseBody = method === 'HEAD' ? null : await upstream.arrayBuffer();
  return new Response(responseBody, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const runtime = 'nodejs';

type ProxyRouteContext = {
  params: Promise<{ path: string[] }>;
};

export async function GET(request: Request, context: ProxyRouteContext) {
  const params = await context.params;
  return proxyRequest(request, params);
}

export async function POST(request: Request, context: ProxyRouteContext) {
  const params = await context.params;
  return proxyRequest(request, params);
}

export async function PUT(request: Request, context: ProxyRouteContext) {
  const params = await context.params;
  return proxyRequest(request, params);
}

export async function PATCH(request: Request, context: ProxyRouteContext) {
  const params = await context.params;
  return proxyRequest(request, params);
}

export async function DELETE(request: Request, context: ProxyRouteContext) {
  const params = await context.params;
  return proxyRequest(request, params);
}

export async function OPTIONS(request: Request, context: ProxyRouteContext) {
  const params = await context.params;
  return proxyRequest(request, params);
}

export async function HEAD(request: Request, context: ProxyRouteContext) {
  const params = await context.params;
  return proxyRequest(request, params);
}

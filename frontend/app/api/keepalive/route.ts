import { NextResponse } from 'next/server';

const DEFAULT_KEEPALIVE_TARGET = 'https://api.sgsseguranca.com.br';

function resolveKeepaliveTarget(): string {
  const raw =
    process.env.BACKEND_KEEPALIVE_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    DEFAULT_KEEPALIVE_TARGET;

  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return true;
  }

  const header = request.headers.get('authorization')?.trim();
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const target = resolveKeepaliveTarget();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const startedAt = Date.now();
    const health = await fetch(`${target}/health/public?keepalive=1&t=${startedAt}`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });

    const elapsedMs = Date.now() - startedAt;
    return NextResponse.json(
      {
        ok: health.ok,
        status: health.status,
        target,
        elapsedMs,
      },
      { status: health.ok ? 200 : 503 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    return NextResponse.json(
      {
        ok: false,
        status: 503,
        target,
        error: message,
      },
      { status: 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}


import { NextResponse } from "next/server";

export const runtime = "nodejs";

function resolveTunnelTarget(): string | null {
  const dsn =
    process.env.SENTRY_DSN?.trim() ??
    process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

  if (!dsn) {
    return null;
  }

  try {
    const parsed = new URL(dsn);
    const publicKey = parsed.username.trim();
    const projectId = parsed.pathname.replace(/^\//, "").trim();

    if (!publicKey || !projectId) {
      return null;
    }

    return `${parsed.origin}/api/${projectId}/envelope/?sentry_key=${encodeURIComponent(publicKey)}&sentry_version=7`;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const target = resolveTunnelTarget();
  if (!target) {
    return NextResponse.json(
      { error: "Sentry tunnel not configured" },
      { status: 503 },
    );
  }

  const body = await request.arrayBuffer();
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const contentEncoding = request.headers.get("content-encoding");

  if (contentType) {
    headers.set("content-type", contentType);
  }

  if (contentEncoding) {
    headers.set("content-encoding", contentEncoding);
  }

  const sentryResponse = await fetch(target, {
    method: "POST",
    headers,
    body,
  });

  return new NextResponse(sentryResponse.body, {
    status: sentryResponse.status,
    headers: sentryResponse.headers,
  });
}


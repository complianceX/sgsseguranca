import { AwsClient } from 'aws4fetch';

export interface Env {
  DOCS_BUCKET: R2Bucket;
  CLAMAV: DurableObjectNamespace;
  R2_ACCOUNT_ID: string;
  R2_BUCKET_NAME: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  UPLOAD_TICKET_SECRET: string;
  BACKEND_INTERNAL_BASE_URL: string;
  BACKEND_INTERNAL_SERVICE_TOKEN: string;
  PRESIGNED_PUT_TTL_SECONDS: string;
  MAX_PDF_BYTES: string;
  CLAMAV_SCAN_TIMEOUT_MS: string;
  CLAMAV_RETRY_COUNT: string;
}

type UploadTicket = {
  sub: string;
  tenantId: string;
  fileName: string;
  contentType: 'application/pdf';
  maxBytes: number;
  exp: number;
  nonce: string;
};

type ScanResult =
  | { status: 'clean'; engine: string }
  | { status: 'infected'; engine: string; threat: string }
  | { status: 'blocked'; reason: 'scanner_unavailable' };

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });

function b64urlToBytes(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function verifyUploadTicket(
  token: string,
  secret: string,
): Promise<UploadTicket> {
  const [payloadPart, signaturePart] = token.split('.');
  if (!payloadPart || !signaturePart) {
    throw new Error('invalid_ticket_format');
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const expectedSignature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadPart)),
  );
  const actualSignature = b64urlToBytes(signaturePart);

  if (expectedSignature.length !== actualSignature.length) {
    throw new Error('invalid_ticket_signature');
  }

  let diff = 0;
  for (let index = 0; index < expectedSignature.length; index += 1) {
    diff |= expectedSignature[index] ^ actualSignature[index];
  }

  if (diff !== 0) {
    throw new Error('invalid_ticket_signature');
  }

  const payload = JSON.parse(
    new TextDecoder().decode(b64urlToBytes(payloadPart)),
  ) as UploadTicket;

  if (payload.exp * 1000 < Date.now()) {
    throw new Error('ticket_expired');
  }

  if (payload.contentType !== 'application/pdf') {
    throw new Error('invalid_content_type');
  }

  return payload;
}

function sanitizePdfName(name: string): string {
  const normalized = name.trim().replace(/[^\w.\- ]+/g, '_');
  if (!normalized.toLowerCase().endsWith('.pdf')) {
    throw new Error('file_must_be_pdf');
  }
  return normalized;
}

function isPdfMagic(buffer: Uint8Array): boolean {
  return new TextDecoder().decode(buffer.slice(0, 5)) === '%PDF-';
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function callBackend(
  env: Env,
  path: string,
  body: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(
    `${env.BACKEND_INTERNAL_BASE_URL.replace(/\/+$/, '')}${path}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.BACKEND_INTERNAL_SERVICE_TOKEN}`,
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new Error(`backend_call_failed:${response.status}`);
  }
}

async function createPutUrl(env: Env, key: string, ttlSeconds: number) {
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  });

  const url = new URL(
    `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${key}`,
  );

  const signed = await client.sign(
    new Request(url.toString(), {
      method: 'PUT',
      headers: { 'content-type': 'application/pdf' },
    }),
    {
      aws: {
        signQuery: true,
      },
    },
  );

  const signedUrl = new URL(signed.url);
  signedUrl.searchParams.set('X-Amz-Expires', String(ttlSeconds));
  return signedUrl.toString();
}

async function scanWithRetry(
  env: Env,
  payload: ArrayBuffer,
  metadata: Record<string, string>,
): Promise<ScanResult> {
  const attempts = Math.max(1, Number(env.CLAMAV_RETRY_COUNT || '1') + 1);
  const containerId = env.CLAMAV.idFromName('clamav-primary');
  const container = env.CLAMAV.get(containerId);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort('scanner_timeout'),
      Number(env.CLAMAV_SCAN_TIMEOUT_MS || '30000'),
    );

    try {
      const response = await container.fetch('http://container/ready');
      if (!response.ok) {
        throw new Error('scanner_not_ready');
      }

      const scanResponse = await container.fetch('http://container/scan', {
        method: 'POST',
        headers: metadata,
        body: payload,
        signal: controller.signal,
      });

      if (scanResponse.ok) {
        return (await scanResponse.json()) as ScanResult;
      }

      if (scanResponse.status === 409) {
        return (await scanResponse.json()) as ScanResult;
      }

      throw new Error(`scanner_status_${scanResponse.status}`);
    } catch (error) {
      if (attempt >= attempts - 1) {
        return { status: 'blocked', reason: 'scanner_unavailable' };
      }

      const jitter = Math.floor(Math.random() * 200);
      await new Promise((resolve) => setTimeout(resolve, 300 + jitter));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return { status: 'blocked', reason: 'scanner_unavailable' };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/storage/presigned-url') {
      const { ticket } = (await request.json()) as { ticket: string };
      const claims = await verifyUploadTicket(ticket, env.UPLOAD_TICKET_SECRET);
      const uploadId = crypto.randomUUID();
      const fileName = sanitizePdfName(claims.fileName);
      const key = `quarantine/${claims.tenantId}/${uploadId}.pdf`;
      const ttl = Math.min(Number(env.PRESIGNED_PUT_TTL_SECONDS || '300'), 300);

      await callBackend(env, '/internal/storage/upload-sessions/issue', {
        uploadId,
        tenantId: claims.tenantId,
        userId: claims.sub,
        fileName,
        quarantineKey: key,
        contentType: 'application/pdf',
        maxBytes: claims.maxBytes,
      });

      return json(
        {
          uploadId,
          fileKey: key,
          uploadUrl: await createPutUrl(env, key, ttl),
          expiresIn: ttl,
        },
        201,
      );
    }

    if (request.method === 'POST' && url.pathname === '/storage/complete-upload') {
      const body = (await request.json()) as {
        ticket: string;
        uploadId: string;
        fileKey: string;
      };
      const claims = await verifyUploadTicket(body.ticket, env.UPLOAD_TICKET_SECRET);
      const expectedPrefix = `quarantine/${claims.tenantId}/`;
      if (!body.fileKey.startsWith(expectedPrefix)) {
        return json({ status: 'blocked', code: 'invalid_upload' }, 403);
      }

      const object = await env.DOCS_BUCKET.get(body.fileKey);
      if (!object) {
        return json({ status: 'blocked', code: 'invalid_upload' }, 404);
      }

      if ((object.httpMetadata?.contentType || '').toLowerCase() !== 'application/pdf') {
        return json({ status: 'blocked', code: 'invalid_upload' }, 400);
      }

      if (object.size > Math.min(claims.maxBytes, Number(env.MAX_PDF_BYTES || '26214400'))) {
        return json({ status: 'blocked', code: 'invalid_upload' }, 400);
      }

      const bytes = await object.arrayBuffer();
      if (!isPdfMagic(new Uint8Array(bytes))) {
        return json({ status: 'blocked', code: 'invalid_upload' }, 400);
      }

      const sha256 = await sha256Hex(bytes);

      await callBackend(
        env,
        `/internal/storage/upload-sessions/${body.uploadId}/uploaded`,
        {
          tenantId: claims.tenantId,
          quarantineKey: body.fileKey,
          sizeBytes: object.size,
          sha256,
        },
      );

      const scan = await scanWithRetry(env, bytes, {
        'content-type': 'application/pdf',
        'x-upload-id': body.uploadId,
        'x-tenant-id': claims.tenantId,
        'x-object-key': body.fileKey,
        'x-sha256': sha256,
      });

      await callBackend(
        env,
        `/internal/storage/upload-sessions/${body.uploadId}/scan-result`,
        {
          tenantId: claims.tenantId,
          quarantineKey: body.fileKey,
          scanStatus: scan.status,
          threat: 'threat' in scan ? scan.threat : null,
          scannerReason: 'reason' in scan ? scan.reason : null,
        },
      );

      if (scan.status !== 'clean') {
        await callBackend(
          env,
          `/internal/storage/upload-sessions/${body.uploadId}/blocked`,
          {
            tenantId: claims.tenantId,
            quarantineKey: body.fileKey,
            reason:
              scan.status === 'infected'
                ? 'malware_detected'
                : 'scanner_unavailable',
          },
        );

        return json(
          {
            status: scan.status,
            code:
              scan.status === 'infected'
                ? 'malware_detected'
                : 'scanner_unavailable',
          },
          409,
        );
      }

      const documentKey = `documents/${claims.tenantId}/${body.uploadId}.pdf`;
      await env.DOCS_BUCKET.put(documentKey, bytes, {
        httpMetadata: {
          contentType: 'application/pdf',
        },
        customMetadata: {
          tenantId: claims.tenantId,
          uploadId: body.uploadId,
          sha256,
          source: body.fileKey,
          scannedBy: 'clamav',
        },
      });
      await env.DOCS_BUCKET.delete(body.fileKey);

      await callBackend(
        env,
        `/internal/storage/upload-sessions/${body.uploadId}/promoted`,
        {
          tenantId: claims.tenantId,
          quarantineKey: body.fileKey,
          documentKey,
          sha256,
          originalName: claims.fileName,
        },
      );

      return json(
        {
          status: 'clean',
          fileKey: documentKey,
          sha256Verified: true,
        },
        201,
      );
    }

    return json({ error: 'not_found' }, 404);
  },
};

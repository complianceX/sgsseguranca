import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('service worker cache policy', () => {
  const source = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');

  it('only precaches the public shell and icons', () => {
    const shell = source.match(/const APP_SHELL = \[([\s\S]*?)\];/)?.[1] ?? '';
    expect(shell).toContain("'/offline.html'");
    expect(shell).toContain("'/manifest.webmanifest'");
    expect(shell).not.toMatch(/dashboard|api|auth|login|tenant|compan(?:y|ies)/i);
  });

  it('explicitly excludes API, authentication and tenant requests', () => {
    expect(source).toContain("pathname.startsWith('/api')");
    expect(source).toContain("pathname.startsWith('/auth')");
    expect(source).toContain("pathname.startsWith('/login')");
    expect(source).toContain("pathname.startsWith('/tenant')");
    expect(source).toContain("request.headers.has('authorization')");
    expect(source).toContain("request.headers.has('x-company-id')");
    expect(source).toContain('hasSensitiveRequestContext(event.request)');
  });

  it('uses network-only navigation with the static offline fallback', () => {
    expect(source).toMatch(
      /event\.request\.mode === 'navigate'[\s\S]*fetch\(event\.request\)\.catch/,
    );
    expect(source).toContain("caches.match('/offline.html')");
    expect(source).not.toMatch(/caches\.match\(event\.request\)[\s\S]*mode === 'navigate'/);
  });

  it('versions the safe cache and deletes older SGS shell caches', () => {
    expect(source).toContain("const CACHE_PREFIX = 'sgs-shell-v2'");
    expect(source).toContain("'sgs-shell'");
    expect(source).toContain('caches.delete(key)');
  });
});

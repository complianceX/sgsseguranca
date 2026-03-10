'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Search, ShieldAlert, ShieldCheck } from 'lucide-react';

type VerifyMode = 'evidence' | 'signature';

interface EvidenceVerifyResponse {
  verified: boolean;
  matchedIn?: 'original' | 'watermarked';
  message?: string;
  evidence?: {
    apr_numero?: string;
    apr_versao?: number;
    risk_item_ordem?: number;
    uploaded_at?: string;
    original_hash?: string;
    watermarked_hash?: string;
    integrity_flags?: Record<string, unknown>;
  };
}

interface SignatureVerifyResponse {
  valid: boolean;
  message?: string;
  signature?: {
    hash: string;
    original_name?: string;
    signed_at?: string;
  };
}

export default function PublicHashVerifyPage() {
  const [mode, setMode] = useState<VerifyMode>('evidence');
  const [hash, setHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [evidenceResult, setEvidenceResult] = useState<EvidenceVerifyResponse | null>(
    null,
  );
  const [signatureResult, setSignatureResult] = useState<SignatureVerifyResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const resetResults = () => {
    setEvidenceResult(null);
    setSignatureResult(null);
    setError(null);
  };

  const runVerify = useCallback(async (rawHash: string, targetMode: VerifyMode) => {
    resetResults();

    const normalizedHash = rawHash.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalizedHash)) {
      setError('Informe um hash SHA-256 válido com 64 caracteres.');
      return;
    }

    try {
      setLoading(true);
      if (targetMode === 'evidence') {
        const response = await fetch(
          `/api/v1/public/evidence/verify?hash=${encodeURIComponent(normalizedHash)}`,
          {
            method: 'GET',
            cache: 'no-store',
          },
        );
        const data = (await response.json()) as EvidenceVerifyResponse;
        setEvidenceResult(data);
      } else {
        const response = await fetch(
          `/api/v1/public/signature/verify?hash=${encodeURIComponent(normalizedHash)}`,
          {
            method: 'GET',
            cache: 'no-store',
          },
        );
        const data = (await response.json()) as SignatureVerifyResponse;
        setSignatureResult(data);
      }
    } catch {
      setError('Falha ao consultar validação pública. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await runVerify(hash, mode);
  };

  useEffect(() => {
    const hashParam = new URLSearchParams(window.location.search).get('hash');
    if (!hashParam) return;
    setHash(hashParam);
    void runVerify(hashParam, 'evidence');
  }, [runVerify]);

  const isValid =
    mode === 'evidence' ? Boolean(evidenceResult?.verified) : Boolean(signatureResult?.valid);

  return (
    <main className="min-h-screen bg-[var(--ds-color-bg-subtle)] px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-5 shadow-[var(--ds-shadow-sm)]">
          <h1 className="text-xl font-bold text-[var(--ds-color-text-primary)]">Validação Pública por Hash</h1>
          <p className="mt-1 text-[13px] text-[var(--ds-color-text-secondary)]">
            Consulte autenticidade de evidências APR e assinaturas PDF sem login.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode('evidence');
                  resetResults();
                }}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  mode === 'evidence'
                    ? 'bg-[var(--ds-color-action-primary)] text-white'
                    : 'bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)]'
                }`}
              >
                Evidência APR
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signature');
                  resetResults();
                }}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  mode === 'signature'
                    ? 'bg-[var(--ds-color-success)] text-white'
                    : 'bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)]'
                }`}
              >
                Assinatura PDF
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={hash}
                onChange={(e) => setHash(e.target.value)}
                placeholder="Cole o hash SHA-256"
                className="w-full rounded-lg border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-[13px] text-[var(--ds-color-text-primary)]"
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--ds-color-action-secondary)] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
              >
                <Search className="h-4 w-4" />
                {loading ? 'Consultando...' : 'Validar'}
              </button>
            </div>
          </form>
        </section>

        {(error || evidenceResult || signatureResult) && (
          <section className="rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-5 shadow-[var(--ds-shadow-sm)]">
            {error ? (
              <div className="flex items-start gap-2 text-[var(--ds-color-danger)]">
                <ShieldAlert className="mt-0.5 h-5 w-5" />
                <p className="text-[13px] font-medium">{error}</p>
              </div>
            ) : isValid ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2 text-[var(--ds-color-success)]">
                  <ShieldCheck className="mt-0.5 h-5 w-5" />
                  <p className="text-[13px] font-semibold">Registro validado com sucesso.</p>
                </div>

                {mode === 'evidence' && evidenceResult?.evidence && (
                  <div className="rounded-lg bg-[color:var(--ds-color-success-subtle)] p-3 text-[13px] text-[var(--ds-color-text-secondary)]">
                    <p>APR: {evidenceResult.evidence.apr_numero || '-'}</p>
                    <p>Versão: {evidenceResult.evidence.apr_versao ?? '-'}</p>
                    <p>
                      Item de risco:{' '}
                      {typeof evidenceResult.evidence.risk_item_ordem === 'number'
                        ? `#${evidenceResult.evidence.risk_item_ordem + 1}`
                        : '-'}
                    </p>
                    <p>Upload: {evidenceResult.evidence.uploaded_at || '-'}</p>
                    <p>Tipo de hash: {evidenceResult.matchedIn || '-'}</p>
                  </div>
                )}

                {mode === 'signature' && signatureResult?.signature && (
                  <div className="rounded-lg bg-[color:var(--ds-color-success-subtle)] p-3 text-[13px] text-[var(--ds-color-text-secondary)]">
                    <p>Documento: {signatureResult.signature.original_name || '-'}</p>
                    <p>Assinado em: {signatureResult.signature.signed_at || '-'}</p>
                    <p>Hash: {signatureResult.signature.hash}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2 text-[var(--ds-color-warning)]">
                <ShieldAlert className="mt-0.5 h-5 w-5" />
                <p className="text-[13px] font-medium">
                  {mode === 'evidence'
                    ? evidenceResult?.message || 'Hash não localizado.'
                    : signatureResult?.message || 'Assinatura não localizada.'}
                </p>
              </div>
            )}
          </section>
        )}

        <p className="flex items-center gap-1 text-[11px] text-[var(--ds-color-text-muted)]">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Endpoint público de auditoria externa ativo.
        </p>
      </div>
    </main>
  );
}

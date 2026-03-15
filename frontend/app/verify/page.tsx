'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { buildApiUrl } from '@/lib/api';

type VerifyMode = 'evidence' | 'signature' | 'code';

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
    signed_at?: string;
    timestamp_authority?: string;
    document_id?: string;
    document_type?: string;
  };
}

interface CodeVerifyResponse {
  valid: boolean;
  code?: string;
  message?: string;
  inspection?: {
    id: string;
    site_id?: string;
    setor_area?: string;
    tipo_inspecao?: string;
    data_inspecao?: string;
    responsavel_id?: string;
    updated_at?: string;
  };
}

export default function PublicHashVerifyPage() {
  const [mode, setMode] = useState<VerifyMode>('code');
  const [hash, setHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [evidenceResult, setEvidenceResult] = useState<EvidenceVerifyResponse | null>(
    null,
  );
  const [signatureResult, setSignatureResult] = useState<SignatureVerifyResponse | null>(
    null,
  );
  const [codeResult, setCodeResult] = useState<CodeVerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolvePublicUrl = useCallback((path: string) => {
    const url = buildApiUrl(path);
    if (!url) {
      throw new Error(
        'API pública não configurada para este ambiente. Defina NEXT_PUBLIC_API_URL no frontend.',
      );
    }
    return url;
  }, []);

  const resetResults = () => {
    setEvidenceResult(null);
    setSignatureResult(null);
    setCodeResult(null);
    setError(null);
  };

  const runVerify = useCallback(async (rawValue: string, targetMode: VerifyMode) => {
    resetResults();

    if (targetMode === 'code') {
      const code = rawValue.trim();
      if (!code) {
        setError('Informe o código do documento (ex.: INS-2026-22D77ACC).');
        return;
      }
      try {
        setLoading(true);
        const response = await fetch(
          resolvePublicUrl(
            `/public/inspections/validate?code=${encodeURIComponent(code)}`,
          ),
          { method: 'GET', cache: 'no-store' },
        );
        const data = (await response.json()) as CodeVerifyResponse;
        setCodeResult(data);
        if (!data.valid) {
          setError(data.message || 'Documento não encontrado.');
        }
      } catch {
        setError('Falha ao consultar validação por código. Tente novamente.');
      } finally {
        setLoading(false);
      }
      return;
    }

    const normalizedHash = rawValue.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalizedHash)) {
      setError('Informe um hash SHA-256 válido com 64 caracteres.');
      return;
    }

    try {
      setLoading(true);
      if (targetMode === 'evidence') {
        const response = await fetch(
          resolvePublicUrl(
            `/public/evidence/verify?hash=${encodeURIComponent(normalizedHash)}`,
          ),
          {
            method: 'GET',
            cache: 'no-store',
          },
        );
        const data = (await response.json()) as EvidenceVerifyResponse;
        setEvidenceResult(data);
      } else {
        const response = await fetch(
          resolvePublicUrl(
            `/public/signature/verify?hash=${encodeURIComponent(normalizedHash)}`,
          ),
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
  }, [resolvePublicUrl]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await runVerify(hash, mode);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParam = params.get('hash');
    const codeParam = params.get('code');
    if (codeParam) {
      setHash(codeParam);
      setMode('code');
      void runVerify(codeParam, 'code');
      return;
    }
    if (hashParam) {
      setHash(hashParam);
      setMode('evidence');
      void runVerify(hashParam, 'evidence');
    }
  }, [runVerify]);

  const isValid =
    mode === 'evidence'
      ? Boolean(evidenceResult?.verified)
      : mode === 'signature'
        ? Boolean(signatureResult?.valid)
        : Boolean(codeResult?.valid);

  return (
    <main className="min-h-screen bg-[var(--ds-color-bg-subtle)] px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-5 shadow-[var(--ds-shadow-sm)]">
          <h1 className="text-xl font-bold text-[var(--ds-color-text-primary)]">Validação Pública por Hash</h1>
          <p className="mt-1 text-[13px] text-[var(--ds-color-text-secondary)]">
            Consulte autenticidade por código do documento ou por hash SHA-256.
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
              <button
                type="button"
                onClick={() => {
                  setMode('code');
                  resetResults();
                }}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  mode === 'code'
                    ? 'bg-[var(--ds-color-focus)] text-white'
                    : 'bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)]'
                }`}
              >
                Código do documento
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={hash}
                onChange={(e) => setHash(e.target.value)}
                placeholder={
                  mode === 'code'
                  ? 'Cole o código (ex.: INS-2026-22D77ACC)'
                    : 'Cole o hash SHA-256'
                }
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

        {(error || evidenceResult || signatureResult || codeResult) && (
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

                {mode === 'code' && codeResult?.inspection && (
                  <div className="rounded-lg bg-[color:var(--ds-color-success-subtle)] p-3 text-[13px] text-[var(--ds-color-text-secondary)]">
                    <p>Código: {codeResult.code}</p>
                    <p>Inspeção: {codeResult.inspection.id}</p>
                    <p>Tipo: {codeResult.inspection.tipo_inspecao || '-'}</p>
                    <p>Setor/Área: {codeResult.inspection.setor_area || '-'}</p>
                    <p>Data: {codeResult.inspection.data_inspecao || '-'}</p>
                    <p>Última atualização: {codeResult.inspection.updated_at || '-'}</p>
                  </div>
                )}

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
                    <p>Documento: {signatureResult.signature.document_type || '-'}</p>
                    <p>ID do documento: {signatureResult.signature.document_id || '-'}</p>
                    <p>Assinado em: {signatureResult.signature.signed_at || '-'}</p>
                    <p>Autoridade: {signatureResult.signature.timestamp_authority || '-'}</p>
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
                    : mode === 'signature'
                      ? signatureResult?.message || 'Assinatura não localizada.'
                      : codeResult?.message || 'Documento não localizado.'}
                </p>
              </div>
            )}
          </section>
        )}

        <p className="flex items-center gap-1 text-[11px] text-[var(--ds-color-text-muted)]">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Validação pública alinhada com os endpoints reais do backend.
        </p>
      </div>
    </main>
  );
}

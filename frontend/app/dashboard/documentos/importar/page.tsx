'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileCheck,
  FileText,
  Info,
  Loader2,
  Search,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { PageHeader } from '@/components/layout';
import { StatusPill } from '@/components/ui/status-pill';
import {
  documentImportService,
  type DocumentImportDomainStatus,
  type DocumentImportEnqueueResponse,
  type DocumentImportJobSnapshot,
  type DocumentImportStatusResponse,
} from '@/services/documentImportService';
import { safeToLocaleDateString } from '@/lib/date/safeFormat';

const DOCUMENT_LABELS: Record<string, string> = {
  apr: 'APR',
  pt: 'PT',
  checklist: 'Checklist',
  dds: 'DDS',
  inspection: 'Relatório de Inspeção',
  nc: 'Não Conformidade',
};

const DOCUMENT_TYPE_UPLOAD_MAP: Record<string, string> = {
  apr: 'APR',
  pt: 'PT',
  checklist: 'CHECKLIST',
  dds: 'DDS',
  inspection: 'INSPECTION',
  nc: 'NC',
};

const TERMINAL_STATUSES = new Set<DocumentImportDomainStatus>([
  'COMPLETED',
  'FAILED',
  'DEAD_LETTER',
]);

function generateIdempotencyKey() {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `import-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function getProgressFromImportStatus(
  status: DocumentImportDomainStatus,
  queueState?: string | null,
) {
  if (status === 'QUEUED') {
    return queueState === 'delayed' ? 15 : 20;
  }

  switch (status) {
    case 'UPLOADED':
      return 10;
    case 'PROCESSING':
      return 45;
    case 'INTERPRETING':
      return 65;
    case 'VALIDATING':
      return 85;
    case 'COMPLETED':
      return 100;
    case 'FAILED':
    case 'DEAD_LETTER':
      return 100;
    default:
      return 10;
  }
}

function getStatusLabel(status: DocumentImportDomainStatus) {
  switch (status) {
    case 'UPLOADED':
      return 'Recebido';
    case 'QUEUED':
      return 'Na fila';
    case 'PROCESSING':
      return 'Extraindo conteúdo';
    case 'INTERPRETING':
      return 'Interpretando';
    case 'VALIDATING':
      return 'Validando';
    case 'COMPLETED':
      return 'Concluído';
    case 'FAILED':
      return 'Falhou';
    case 'DEAD_LETTER':
      return 'Falha permanente';
    default:
      return status;
  }
}

function getQueueStateLabel(queueState?: string | null) {
  switch (queueState) {
    case 'waiting':
      return 'Aguardando worker';
    case 'delayed':
      return 'Aguardando retry';
    case 'active':
      return 'Em processamento';
    case 'completed':
      return 'Processado';
    case 'failed':
      return 'Falhou';
    case 'retry_pending':
      return 'Retry pendente';
    case 'dead_letter':
      return 'Direcionado ao DLQ';
    case 'enqueue_failed':
      return 'Falha ao enfileirar';
    case 'unknown':
      return 'Estado indefinido';
    case 'uploaded':
      return 'Recebido';
    default:
      return queueState || 'Aguardando atualização';
  }
}

function extractErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'data' in error.response &&
    error.response.data &&
    typeof error.response.data === 'object' &&
    'message' in error.response.data &&
    typeof error.response.data.message === 'string'
  ) {
    return error.response.data.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Erro ao processar documento.';
}

export default function DocumentImportPage() {
  const { user, hasPermission } = useAuth();
  const searchParams = useSearchParams();
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [enqueueResponse, setEnqueueResponse] =
    useState<DocumentImportEnqueueResponse | null>(null);
  const [statusResponse, setStatusResponse] =
    useState<DocumentImportStatusResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const terminalToastRef = useRef<string | null>(null);
  const operationKeyRef = useRef<string | null>(null);
  const requestedDocumentType = searchParams.get('documentType') || '';
  const requestedDocumentLabel = DOCUMENT_LABELS[requestedDocumentType] || null;
  const canImportDocuments = hasPermission('can_import_documents');

  const currentStatus = statusResponse?.status ?? enqueueResponse?.status ?? null;
  const currentJob: DocumentImportJobSnapshot | null =
    statusResponse?.job ?? enqueueResponse?.job ?? null;
  const currentMessage =
    statusResponse?.message ??
    enqueueResponse?.message ??
    'Documento recebido para processamento.';
  const showCompletedResult = Boolean(
    statusResponse?.completed && statusResponse.analysis && statusResponse.validation,
  );

  useEffect(() => {
    const documentId = enqueueResponse?.documentId;
    if (!documentId) {
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let reachedTerminal = TERMINAL_STATUSES.has(enqueueResponse.status);
    let timeoutRef: ReturnType<typeof setTimeout> | null = null;

    const stopPolling = () => {
      if (timeoutRef) {
        clearTimeout(timeoutRef);
        timeoutRef = null;
      }
    };

    const isPageVisible = () =>
      typeof document === 'undefined' || document.visibilityState === 'visible';

    const syncStatus = async () => {
      if (cancelled || inFlight || !isPageVisible()) {
        return;
      }

      inFlight = true;
      try {
        const response =
          await documentImportService.getImportStatus(documentId);

        if (cancelled) {
          return;
        }

        setStatusResponse(response);
        setProgress(
          getProgressFromImportStatus(response.status, response.job.queueState),
        );

        if (TERMINAL_STATUSES.has(response.status)) {
          reachedTerminal = true;
          setPolling(false);
          stopPolling();

          if (terminalToastRef.current !== documentId) {
            terminalToastRef.current = documentId;

            if (response.completed) {
              toast.success(response.message || 'Documento processado com sucesso.');
            } else {
              toast.error(
                response.message ||
                  'A importação falhou e precisa de intervenção manual.',
              );
            }
          }
        } else {
          setPolling(true);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        reachedTerminal = true;
        stopPolling();
        setPolling(false);
        setUploading(false);
        toast.error(extractErrorMessage(error));
      } finally {
        inFlight = false;
        if (!cancelled) {
          setUploading(false);
        }
      }
    };

    const scheduleNext = () => {
      stopPolling();
      if (cancelled || reachedTerminal) {
        return;
      }

      timeoutRef = setTimeout(async () => {
        if (cancelled) {
          return;
        }

        if (!isPageVisible()) {
          scheduleNext();
          return;
        }

        await syncStatus();
        scheduleNext();
      }, 2500);
    };

    const handleVisibilityChange = () => {
      if (cancelled) {
        return;
      }

      if (document.visibilityState === 'visible') {
        void syncStatus();
        scheduleNext();
        return;
      }

      stopPolling();
    };

    void syncStatus();
    if (!reachedTerminal) {
      setPolling(true);
      scheduleNext();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopPolling();
    };
  }, [enqueueResponse?.documentId, enqueueResponse?.status]);

  const resetFlowState = () => {
    setUploading(false);
    setPolling(false);
    setProgress(0);
    setEnqueueResponse(null);
    setStatusResponse(null);
  };

  const reset = () => {
    setFile(null);
    resetFlowState();
    terminalToastRef.current = null;
    operationKeyRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileSelection = (selectedFile?: File) => {
    if (!selectedFile) {
      return;
    }

    if (selectedFile.type !== 'application/pdf') {
      toast.error('Por favor, envie apenas arquivos PDF.');
      return;
    }

    setFile(selectedFile);
    resetFlowState();
    terminalToastRef.current = null;
    operationKeyRef.current = generateIdempotencyKey();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();

    if (!canImportDocuments) {
      toast.error('Você não possui permissão para importar documentos.');
      return;
    }

    setIsDragging(false);
    handleFileSelection(e.dataTransfer.files[0]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canImportDocuments) {
      toast.error('Você não possui permissão para importar documentos.');
      return;
    }

    handleFileSelection(e.target.files?.[0]);
  };

  const handleUpload = async () => {
    if (!canImportDocuments) {
      toast.error('Você não possui permissão para importar documentos.');
      return;
    }

    if (!file) {
      return;
    }

    setUploading(true);
    setPolling(false);
    setProgress(10);
    setEnqueueResponse(null);
    setStatusResponse(null);

    const idempotencyKey =
      operationKeyRef.current || generateIdempotencyKey();
    operationKeyRef.current = idempotencyKey;

    try {
      const response = await documentImportService.importDocument({
        file,
        empresaId: user?.company_id,
        tipoDocumento:
          requestedDocumentType && DOCUMENT_TYPE_UPLOAD_MAP[requestedDocumentType]
            ? DOCUMENT_TYPE_UPLOAD_MAP[requestedDocumentType]
            : undefined,
        idempotencyKey,
      });

      setEnqueueResponse(response);
      setProgress(
        getProgressFromImportStatus(response.status, response.job.queueState),
      );
      if (response.reused) {
        toast.info(
          response.message || 'Operação reutilizada sem criar nova importação.',
        );
      } else {
        toast.success(
          response.message || 'Documento recebido e enviado para processamento.',
        );
      }
    } catch (error) {
      toast.error(extractErrorMessage(error));
      setUploading(false);
      setPolling(false);
      setProgress(0);
    }
  };

  const analysis = statusResponse?.analysis;
  const validation = statusResponse?.validation;

  return (
    <div className="ds-form-page mx-auto max-w-6xl space-y-8 p-6">
      <PageHeader
        eyebrow="Importação assistida"
        title="Importação Inteligente de PDF"
        description={
          requestedDocumentLabel
            ? `Fluxo preparado para anexar um PDF de ${requestedDocumentLabel} já emitido, sem refazer o preenchimento no sistema.`
            : 'Faça upload de documentos SST para extração automática, validação técnica e acompanhamento assíncrono.'
        }
        icon={
          <div className="rounded-full bg-[color:var(--ds-color-primary-subtle)] p-2.5 text-[var(--ds-color-text-primary)]">
            <Upload className="h-5 w-5" />
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusPill tone="info">
              {requestedDocumentLabel || 'Fluxo multiformato'}
            </StatusPill>
            <StatusPill tone={canImportDocuments ? 'success' : 'warning'}>
              {canImportDocuments ? 'Importação liberada' : 'Sem permissão'}
            </StatusPill>
            {currentStatus ? (
              <StatusPill
                tone={
                  currentStatus === 'COMPLETED'
                    ? 'success'
                    : currentStatus === 'FAILED' || currentStatus === 'DEAD_LETTER'
                      ? 'danger'
                      : 'primary'
                }
              >
                {getStatusLabel(currentStatus)}
              </StatusPill>
            ) : null}
          </div>
        }
      />

      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/22 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
          Fluxo guiado
        </p>
        <p className="mt-2 text-sm font-semibold text-[var(--ds-color-text-primary)]">
          Envie o PDF, acompanhe o progresso da fila e valide o resultado sem prender o operador em uma tela de request longa.
        </p>
        <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
          O objetivo aqui é acelerar entrada documental com rastreabilidade, não substituir revisão técnica quando houver pendências.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-6 text-center transition-all duration-200
              ${isDragging ? 'border-primary bg-primary/5' : 'border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)] hover:border-[var(--ds-color-border-strong)]'}
              ${file ? 'border-[var(--ds-color-success)] bg-[var(--ds-color-success-subtle)]' : ''}
            `}
            onClick={() => {
              if (canImportDocuments && !uploading && !polling) {
                fileInputRef.current?.click();
              }
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf"
              disabled={!canImportDocuments || uploading || polling}
              className="hidden"
              title="Upload de arquivo PDF"
              aria-label="Upload de arquivo PDF"
            />

            <div
              className={`rounded-full p-3.5 ${file ? 'bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)]' : 'bg-[var(--ds-color-primary-subtle)] text-[var(--ds-color-text-primary)]'}`}
            >
              {file ? <FileCheck size={28} /> : <Upload size={28} />}
            </div>

            <div className="space-y-1">
              <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                {file ? file.name : 'Clique ou arraste o PDF aqui'}
              </p>
              <p className="text-[13px] text-[var(--ds-color-text-secondary)]">
                Apenas arquivos PDF até 10MB
              </p>
            </div>

            {file && !uploading && !polling && !enqueueResponse && canImportDocuments && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleUpload();
                }}
                className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--ds-color-action-primary)] px-4 py-2 text-[13px] font-medium text-[var(--ds-color-action-primary-foreground)] transition-colors hover:bg-[var(--ds-color-action-primary-hover)]"
              >
                Enviar para fila <ChevronRight size={18} />
              </button>
            )}

            {!canImportDocuments && (
              <div
                role="alert"
                className="mt-3.5 w-full rounded-lg border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] px-3 py-2"
              >
                <p className="text-[13px] font-semibold text-[var(--ds-color-warning-fg)]">
                  Importação bloqueada para este usuário
                </p>
                <p className="mt-1 text-[13px] text-[var(--ds-color-warning-fg)]">
                  Você não possui permissão <code>can_import_documents</code> para
                  este fluxo.
                </p>
              </div>
            )}

            {(uploading || polling || currentStatus) && (
              <div className="mt-4 w-full space-y-3">
                <div className="flex justify-between text-sm font-medium text-[var(--ds-color-text-secondary)]">
                  <span>
                    {currentStatus
                      ? getStatusLabel(currentStatus)
                      : 'Recebendo documento...'}
                  </span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--ds-color-surface-muted)]">
                  <div
                    className="h-2 rounded-full bg-[var(--ds-color-action-primary)] transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-[var(--ds-color-text-primary)]">
                  {(uploading || polling) && (
                    <Loader2 size={16} className="animate-spin" />
                  )}
                  <span>{currentMessage}</span>
                </div>
              </div>
            )}

            {(enqueueResponse || statusResponse) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  reset();
                }}
                className="mt-3.5 w-full rounded-lg border border-[var(--ds-color-border-default)] px-4 py-2 text-[13px] font-medium text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[var(--ds-color-surface-muted)]"
              >
                Importar outro arquivo
              </button>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-[var(--ds-color-info-border)] bg-[var(--ds-color-info-subtle)] p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--ds-color-info-fg)]">
              <Info size={16} /> Como funciona?
            </h3>
            <ul className="list-disc space-y-2 pl-4 text-xs text-[var(--ds-color-info-fg)]">
              <li>O request apenas recebe e valida o upload inicial.</li>
              <li>
                O documento segue para fila com retries automáticos e timeout
                controlado.
              </li>
              <li>
                Você pode consultar o status a qualquer momento usando o ID da
                importação.
              </li>
              <li>
                Em falha permanente, o processamento é marcado de forma auditável
                e não fica preso em request longa.
              </li>
            </ul>
          </div>
        </div>

        <div className="lg:col-span-2">
          {showCompletedResult && analysis && validation ? (
            <div className="animate-in slide-in-from-bottom-4 space-y-6 duration-500 fade-in">
              <div className="flex items-center justify-between rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-5 shadow-sm">
                <div className="flex items-center gap-4">
                  <div
                    className={`rounded-xl p-2.5 ${
                      validation.status === 'VALIDO'
                        ? 'bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)]'
                        : validation.status === 'INCOMPLETO'
                          ? 'bg-[var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)]'
                          : 'bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)]'
                    }`}
                  >
                    {validation.status === 'VALIDO' ? (
                      <CheckCircle2 size={22} />
                    ) : (
                      <AlertCircle size={22} />
                    )}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[var(--ds-color-text-primary)]">
                      {statusResponse?.tipoDocumentoDescricao}
                    </h2>
                    <p className="text-[13px] text-[var(--ds-color-text-secondary)]">
                      Status da validação:{' '}
                      <span className="font-semibold">{validation.status}</span>
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="mb-1 text-[13px] text-[var(--ds-color-text-secondary)]">
                    Score de confiança
                  </div>
                  <div
                    className={`text-[1.5rem] font-black ${
                      validation.scoreConfianca > 0.8
                        ? 'text-[var(--ds-color-success)]'
                        : validation.scoreConfianca > 0.5
                          ? 'text-[var(--ds-color-text-primary)]'
                          : 'text-[var(--ds-color-danger)]'
                    }`}
                  >
                    {(validation.scoreConfianca * 100).toFixed(0)}%
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-4 rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-5 shadow-sm">
                  <h3 className="flex items-center gap-2 font-semibold text-[var(--ds-color-text-primary)]">
                    <Search size={18} className="text-[var(--ds-color-text-primary)]" /> Informações
                    extraídas
                  </h3>
                  <div className="space-y-3">
                    <DetailItem label="Empresa" value={analysis.empresa} />
                    <DetailItem label="CNPJ" value={analysis.cnpj} />
                    <DetailItem
                      label="Data"
                      value={
                        analysis.data
                          ? safeToLocaleDateString(analysis.data, 'pt-BR', undefined, 'Não encontrada')
                          : 'Não encontrada'
                      }
                    />
                    <DetailItem
                      label="Resp. Técnico"
                      value={analysis.responsavelTecnico}
                    />
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-5 shadow-sm">
                  <h3 className="flex items-center gap-2 font-semibold text-[var(--ds-color-text-primary)]">
                    <ShieldCheck size={18} className="text-[var(--ds-color-text-primary)]" /> Validação
                    técnica
                  </h3>
                  {validation.pendencias.length > 0 ? (
                    <div className="space-y-2">
                      {validation.pendencias.map((pendencia, index) => (
                        <div
                          key={index}
                          className="flex gap-2 rounded-lg bg-[var(--ds-color-warning-subtle)] p-2 text-[13px] text-[var(--ds-color-warning)]"
                        >
                          <AlertCircle size={16} className="mt-0.5 shrink-0" />
                          {pendencia}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                      <CheckCircle2 size={32} className="mb-2 text-[var(--ds-color-success)]" />
                      <p className="text-[13px] font-medium text-[var(--ds-color-success)]">
                        Nenhuma pendência crítica identificada.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6 rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-5 shadow-sm">
                <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                  <div>
                    <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--ds-color-text-secondary)]">
                      Riscos identificados
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {analysis.riscos.length > 0 ? (
                        analysis.riscos.map((risco, index) => (
                          <span
                            key={index}
                            className="rounded-md border border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] px-2 py-1 text-xs font-medium text-[var(--ds-color-danger)]"
                          >
                            {risco}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-[var(--ds-color-text-secondary)]">
                          Nenhum risco detectado
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--ds-color-text-secondary)]">
                      EPIs citados
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {analysis.epis.length > 0 ? (
                        analysis.epis.map((epi, index) => (
                          <span
                            key={index}
                            className="rounded-md border border-[var(--ds-color-success-border)] bg-[var(--ds-color-success-subtle)] px-2 py-1 text-xs font-medium text-[var(--ds-color-success)]"
                          >
                            {epi}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-[var(--ds-color-text-secondary)]">
                          Nenhum EPI detectado
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t border-[var(--ds-color-border-subtle)] pt-4">
                  <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--ds-color-text-secondary)]">
                    Normas Regulamentadoras (NRs)
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {analysis.nrsCitadas.length > 0 ? (
                      analysis.nrsCitadas.map((nr, index) => (
                        <span
                          key={index}
                          className="rounded-md border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] px-2 py-1 text-xs font-medium text-[var(--ds-color-warning)]"
                        >
                          {nr}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-[var(--ds-color-text-secondary)]">
                        Nenhuma NR identificada
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : enqueueResponse || statusResponse ? (
            <div className="space-y-6">
              <div className="rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div
                        className={`rounded-xl p-2.5 ${
                          currentStatus === 'COMPLETED'
                            ? 'bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)]'
                            : currentStatus === 'FAILED' ||
                                currentStatus === 'DEAD_LETTER'
                              ? 'bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)]'
                              : 'bg-[var(--ds-color-primary-subtle)] text-[var(--ds-color-text-primary)]'
                        }`}
                      >
                        {currentStatus === 'FAILED' ||
                        currentStatus === 'DEAD_LETTER' ? (
                          <AlertCircle size={22} />
                        ) : currentStatus === 'COMPLETED' ? (
                          <CheckCircle2 size={22} />
                        ) : (
                          <Loader2 size={22} className="animate-spin" />
                        )}
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-[var(--ds-color-text-primary)]">
                          {currentStatus
                            ? getStatusLabel(currentStatus)
                            : 'Documento recebido'}
                        </h2>
                        <p className="text-[13px] text-[var(--ds-color-text-secondary)]">
                          {currentMessage}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 pt-2 text-[13px] text-[var(--ds-color-text-secondary)] md:grid-cols-2">
                      <StatusItem
                        label="ID da importação"
                        value={enqueueResponse?.documentId || statusResponse?.documentId}
                      />
                      <StatusItem
                        label="Queue state"
                        value={getQueueStateLabel(currentJob?.queueState)}
                      />
                      <StatusItem
                        label="Tentativas"
                        value={
                          currentJob?.maxAttempts
                            ? `${currentJob.attemptsMade || 0}/${currentJob.maxAttempts}`
                            : String(currentJob?.attemptsMade || 0)
                        }
                      />
                      <StatusItem
                        label="Status consultável"
                        value={statusResponse?.statusUrl || enqueueResponse?.statusUrl}
                      />
                      <StatusItem
                        label="Idempotência"
                        value={
                          enqueueResponse?.reused
                            ? enqueueResponse.dedupeSource === 'idempotency_key'
                              ? 'Reutilizado por chave'
                              : 'Reutilizado por hash'
                            : 'Nova operação'
                        }
                      />
                    </div>
                  </div>

                  <div className="min-w-[160px] rounded-lg border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)] px-4 py-3 text-right">
                    <div className="text-[12px] uppercase tracking-wider text-[var(--ds-color-text-secondary)]">
                      Progresso
                    </div>
                    <div className="text-2xl font-black text-[var(--ds-color-text-primary)]">
                      {progress}%
                    </div>
                  </div>
                </div>
              </div>

              {currentStatus === 'DEAD_LETTER' && (
                <div
                  role="alert"
                  className="rounded-xl border border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] p-4"
                >
                  <p className="text-sm font-semibold text-[var(--ds-color-danger-fg)]">
                    Importação movida para falha permanente
                  </p>
                  <p className="mt-1 text-sm text-[var(--ds-color-danger-fg)]">
                    A importação esgotou as tentativas automáticas e foi marcada
                    como falha permanente. O documento permanece auditável para
                    investigação e reprocessamento controlado.
                  </p>
                </div>
              )}

              {currentStatus === 'FAILED' && (
                <div
                  role="alert"
                  className="rounded-xl border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] p-4"
                >
                  <p className="text-sm font-semibold text-[var(--ds-color-warning-fg)]">
                    Processamento interrompido antes da conclusão
                  </p>
                  <p className="mt-1 text-sm text-[var(--ds-color-warning-fg)]">
                    O processamento falhou antes da conclusão. Acompanhe o status
                    novamente pelo endpoint informado ou reenvie o documento após
                    corrigir a causa.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] p-10 text-[var(--ds-color-text-secondary)]">
              <FileText size={64} className="mb-4 opacity-20" />
              <p className="text-base font-medium">
                Aguardando envio de arquivo para análise
              </p>
              <p className="text-[13px]">
                O documento será recebido, enviado para a fila e o status ficará
                consultável até a conclusão.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs font-medium uppercase tracking-wider text-[var(--ds-color-text-secondary)]">
        {label}
      </span>
      <span className="text-sm font-semibold text-[var(--ds-color-text-secondary)]">
        {value || '---'}
      </span>
    </div>
  );
}

function StatusItem({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--ds-color-text-secondary)]">
        {label}
      </div>
      <div className="truncate text-sm font-semibold text-[var(--ds-color-text-secondary)]">
        {value || '---'}
      </div>
    </div>
  );
}

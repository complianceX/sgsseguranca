'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, ClipboardList, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { safeToLocaleString } from '@/lib/date/safeFormat';
import {
  privacyRequestsService,
  privacyRequestEventTypeLabels,
  privacyRequestStatusLabels,
  privacyRequestTypeLabels,
  PrivacyRequest,
  PrivacyRequestEvent,
  PrivacyRequestStatus,
} from '@/services/privacyRequestsService';

const adminRoles = new Set([
  'Administrador Geral',
  'Administrador da Empresa',
]);

const editableStatuses: PrivacyRequestStatus[] = [
  'open',
  'in_review',
  'waiting_controller',
  'fulfilled',
  'rejected',
  'cancelled',
];

function isClosed(status: PrivacyRequestStatus): boolean {
  return status === 'fulfilled' || status === 'rejected' || status === 'cancelled';
}

function getStatusTone(status: PrivacyRequestStatus): string {
  if (status === 'fulfilled') {
    return 'border-[var(--ds-color-success-border)] bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)]';
  }
  if (status === 'rejected' || status === 'cancelled') {
    return 'border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)]';
  }
  return 'border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)]';
}

export default function PrivacyRequestsAdminPage() {
  const { user, roles, isAdminGeral } = useAuth();
  const isAdmin =
    isAdminGeral ||
    roles.some((role) => adminRoles.has(role)) ||
    (typeof user?.role === 'string' && adminRoles.has(user.role));
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<
    Record<string, PrivacyRequestStatus>
  >({});
  const [responseSummary, setResponseSummary] = useState<Record<string, string>>(
    {},
  );
  const [eventsByRequest, setEventsByRequest] = useState<
    Record<string, PrivacyRequestEvent[]>
  >({});
  const [loadingEventsId, setLoadingEventsId] = useState<string | null>(null);

  const metrics = useMemo(() => {
    const open = requests.filter((request) => !isClosed(request.status)).length;
    const overdue = requests.filter((request) => {
      if (isClosed(request.status)) return false;
      const due = new Date(request.due_at).getTime();
      return Number.isFinite(due) && due < Date.now();
    }).length;

    return {
      total: requests.length,
      open,
      overdue,
    };
  }, [requests]);

  const loadRequests = async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await privacyRequestsService.listTenant();
      setRequests(data);
      setSelectedStatus(
        Object.fromEntries(data.map((request) => [request.id, request.status])),
      );
      setResponseSummary(
        Object.fromEntries(
          data.map((request) => [request.id, request.response_summary ?? '']),
        ),
      );
    } catch (error) {
      console.error('Erro ao carregar protocolos LGPD do tenant:', error);
      toast.error('Não foi possível carregar os protocolos LGPD.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const handleSave = async (request: PrivacyRequest) => {
    const nextStatus = selectedStatus[request.id] ?? request.status;
    const summary = responseSummary[request.id] ?? '';

    if (
      (nextStatus === 'fulfilled' || nextStatus === 'rejected') &&
      summary.trim().length === 0
    ) {
      toast.error('Resumo de resposta é obrigatório para atender ou rejeitar.');
      return;
    }

    try {
      setSavingId(request.id);
      const updated = await privacyRequestsService.updateStatus(request.id, {
        status: nextStatus,
        response_summary: summary,
      });
      setRequests((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      toast.success('Protocolo LGPD atualizado.');
    } catch (error) {
      console.error('Erro ao atualizar protocolo LGPD:', error);
      toast.error('Não foi possível atualizar o protocolo.');
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleEvents = async (requestId: string) => {
    if (eventsByRequest[requestId]) {
      setEventsByRequest((current) => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });
      return;
    }

    try {
      setLoadingEventsId(requestId);
      const events = await privacyRequestsService.listEvents(requestId);
      setEventsByRequest((current) => ({
        ...current,
        [requestId]: events,
      }));
    } catch (error) {
      console.error('Erro ao carregar eventos do protocolo LGPD:', error);
      toast.error('Não foi possível carregar o histórico do protocolo.');
    } finally {
      setLoadingEventsId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="ds-system-scope space-y-6">
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--ds-color-action-primary)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <div className="rounded-xl border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] p-6 text-[var(--ds-color-warning)]">
          <h1 className="text-lg font-semibold">Acesso restrito</h1>
          <p className="mt-1 text-sm">
            Apenas administradores do tenant podem triar e responder requisições LGPD.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ds-system-scope space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Link
            href="/dashboard/settings"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--ds-color-action-primary)] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Configurações
          </Link>
          <div className="mt-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--ds-color-action-primary)] text-white">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">
                Requisições LGPD
              </h1>
              <p className="text-sm text-[var(--ds-color-text-secondary)]">
                Triagem, SLA e resposta operacional dos direitos do titular no tenant atual.
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadRequests()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] px-4 py-2 text-sm font-semibold text-[var(--ds-color-text-primary)] motion-safe:transition hover:border-[var(--ds-color-action-primary)] hover:text-[var(--ds-color-action-primary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" />
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-text-muted)]">
            Total
          </p>
          <p className="mt-2 text-2xl font-bold text-[var(--ds-color-text-primary)]">
            {metrics.total}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-text-muted)]">
            Em aberto
          </p>
          <p className="mt-2 text-2xl font-bold text-[var(--ds-color-text-primary)]">
            {metrics.open}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-text-muted)]">
            Vencidas
          </p>
          <p className="mt-2 text-2xl font-bold text-[var(--ds-color-danger)]">
            {metrics.overdue}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-[var(--ds-color-action-primary)]" />
          <h2 className="text-lg font-semibold text-[var(--ds-color-text-primary)]">
            Protocolos do tenant
          </h2>
        </div>

        <div className="mt-5 space-y-4">
          {loading ? (
            <p className="text-sm text-[var(--ds-color-text-secondary)]">
              Carregando protocolos...
            </p>
          ) : requests.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--ds-color-border-subtle)] px-4 py-4 text-sm text-[var(--ds-color-text-secondary)]">
              Nenhuma requisição LGPD registrada no tenant atual.
            </p>
          ) : (
            requests.map((request) => (
              <article
                key={request.id}
                className="rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)]/20 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                        {privacyRequestTypeLabels[request.type]}
                      </h3>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${getStatusTone(request.status)}`}>
                        {privacyRequestStatusLabels[request.status]}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--ds-color-text-secondary)]">
                      Protocolo {request.id} · titular {request.requester_user_id}
                    </p>
                    <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
                      Aberto em{' '}
                      {safeToLocaleString(request.created_at, 'pt-BR', undefined, 'data indisponível')}
                      {' '}· prazo interno{' '}
                      {safeToLocaleString(request.due_at, 'pt-BR', undefined, 'prazo indisponível')}
                    </p>
                    {request.description ? (
                      <p className="mt-3 text-sm text-[var(--ds-color-text-secondary)]">
                        {request.description}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[240px_1fr_auto]">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-text-muted)]">
                      Status
                    </label>
                    <select
                      value={selectedStatus[request.id] ?? request.status}
                      onChange={(event) =>
                        setSelectedStatus((current) => ({
                          ...current,
                          [request.id]: event.target.value as PrivacyRequestStatus,
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)]"
                    >
                      {editableStatuses.map((status) => (
                        <option key={status} value={status}>
                          {privacyRequestStatusLabels[status]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-text-muted)]">
                      Resposta ao titular
                    </label>
                    <textarea
                      value={responseSummary[request.id] ?? ''}
                      onChange={(event) =>
                        setResponseSummary((current) => ({
                          ...current,
                          [request.id]: event.target.value.slice(0, 4000),
                        }))
                      }
                      rows={3}
                      className="mt-1 w-full resize-none rounded-md border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)]"
                      placeholder="Resumo da análise, providência adotada ou motivo de rejeição."
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => void handleSave(request)}
                      disabled={savingId === request.id}
                      className="w-full rounded-[var(--ds-radius-md)] bg-[var(--ds-color-action-primary)] px-4 py-2 text-sm font-semibold text-white motion-safe:transition hover:bg-[var(--ds-color-action-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto"
                    >
                      {savingId === request.id ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </div>

                <div className="mt-4 border-t border-[var(--ds-color-border-subtle)] pt-4">
                  <button
                    type="button"
                    onClick={() => void handleToggleEvents(request.id)}
                    disabled={loadingEventsId === request.id}
                    className="text-xs font-semibold text-[var(--ds-color-action-primary)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {eventsByRequest[request.id]
                      ? 'Ocultar histórico'
                      : loadingEventsId === request.id
                        ? 'Carregando histórico...'
                        : 'Ver histórico'}
                  </button>

                  {eventsByRequest[request.id] ? (
                    <div className="mt-3 space-y-2">
                      {eventsByRequest[request.id].length === 0 ? (
                        <p className="text-xs text-[var(--ds-color-text-secondary)]">
                          Nenhum evento registrado para este protocolo.
                        </p>
                      ) : (
                        eventsByRequest[request.id].map((event) => (
                          <div
                            key={event.id}
                            className="rounded-md border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-xs text-[var(--ds-color-text-secondary)]"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold text-[var(--ds-color-text-primary)]">
                                {privacyRequestEventTypeLabels[event.event_type]}
                              </span>
                              <span>
                                {safeToLocaleString(event.created_at, 'pt-BR', undefined, 'data indisponível')}
                              </span>
                            </div>
                            <p className="mt-1">
                              {event.from_status
                                ? `${privacyRequestStatusLabels[event.from_status]} -> `
                                : ''}
                              {event.to_status
                                ? privacyRequestStatusLabels[event.to_status]
                                : 'Sem mudança de status'}
                              {event.actor_user_id
                                ? ` · responsável ${event.actor_user_id}`
                                : ''}
                            </p>
                            {event.notes ? (
                              <p className="mt-1 whitespace-pre-wrap">{event.notes}</p>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

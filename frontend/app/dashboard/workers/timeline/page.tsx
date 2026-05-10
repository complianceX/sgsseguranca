'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Archive,
  ArrowRight,
  BadgeAlert,
  Building2,
  CalendarDays,
  FileText,
  HardHat,
  MapPin,
  Search,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, InlineLoadingState } from '@/components/ui/state';
import { usersService, WorkerTimelineResponse } from '@/services/usersService';
import { safeToLocaleDateString, safeToLocaleString } from '@/lib/date/safeFormat';

const inputClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-4 py-3 text-sm text-[var(--ds-color-text-primary)] motion-safe:transition-all motion-safe:duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';

export default function WorkerTimelinePage() {
  const searchParams = useSearchParams();
  const initialUserId = searchParams.get('userId') || '';
  const [cpf, setCpf] = useState(searchParams.get('cpf') || '');
  const [timeline, setTimeline] = useState<WorkerTimelineResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(initialUserId || searchParams.get('cpf')));
  const [error, setError] = useState<string | null>(null);

  const loadTimelineByCpf = async (targetCpf: string) => {
    try {
      setLoading(true);
      setError(null);
      const response = await usersService.getWorkerTimelineByCpf(targetCpf);
      setTimeline(response);
    } catch (loadError) {
      console.error('Erro ao carregar timeline do trabalhador:', loadError);
      setTimeline(null);
      setError('Não foi possível carregar a timeline operacional para este CPF.');
      toast.error('Erro ao carregar timeline do trabalhador.');
    } finally {
      setLoading(false);
    }
  };

  const loadTimelineByUserId = async (userId: string) => {
    try {
      setLoading(true);
      setError(null);
      const response = await usersService.getWorkerTimelineById(userId);
      setTimeline(response);
    } catch (loadError) {
      console.error('Erro ao carregar timeline do trabalhador:', loadError);
      setTimeline(null);
      setError('Não foi possível carregar a timeline operacional para este trabalhador.');
      toast.error('Erro ao carregar timeline do trabalhador.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const userId = searchParams.get('userId');
    const initialCpf = searchParams.get('cpf');
    if (userId) {
      void loadTimelineByUserId(userId);
      return;
    }
    if (initialCpf) {
      void loadTimelineByCpf(initialCpf);
    }
  }, [searchParams]);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (cpf.trim().length < 11) {
      toast.error('Informe um CPF válido para consultar a timeline.');
      return;
    }
    await loadTimelineByCpf(cpf);
  };

  const summaryCards = useMemo(
    () =>
      timeline
        ? [
            {
              label: 'Treinamentos',
              value: timeline.summary.trainingsTotal,
              icon: HardHat,
            },
            {
              label: 'Treinamentos vencidos',
              value: timeline.summary.expiredTrainings,
              icon: BadgeAlert,
            },
            {
              label: 'EPIs ativos',
              value: timeline.summary.activeEpis,
              icon: ShieldCheck,
            },
            {
              label: 'Docs relacionados',
              value: timeline.summary.relatedDocuments,
              icon: Archive,
            },
          ]
        : [],
    [timeline],
  );

  return (
    <div className="space-y-6">
      <Card tone="elevated" padding="lg">
        <CardHeader className="gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-3xl">Timeline do trabalhador</CardTitle>
            <CardDescription>
              Consolide prontidão operacional, ASO, treinamentos, EPIs e documentos vinculados por CPF.
            </CardDescription>
          </div>
          <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-overlay)]/55 px-4 py-3 text-sm text-[var(--ds-color-text-secondary)]">
            Use esta visão para decidir mobilização, bloqueios e pendências críticas sem navegar por vários módulos.
          </div>
        </CardHeader>
      </Card>

      <Card tone="default" padding="none">
        <CardHeader className="border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[color:var(--ds-color-action-primary)]/12 text-[var(--ds-color-action-primary)]">
              <UserRound className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Consulta operacional</CardTitle>
              <CardDescription>
                Pesquise por CPF para abrir a linha do tempo operacional do colaborador.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-secondary)]" />
              <input
                type="text"
                value={cpf}
                onChange={(event) => setCpf(event.target.value)}
                placeholder="Digite o CPF do trabalhador"
                aria-label="Pesquisar timeline do trabalhador por CPF"
                className={`${inputClassName} pl-10`}
              />
            </div>
            <Button type="submit" className="justify-center">
              Consultar timeline
            </Button>
          </form>
        </CardContent>
      </Card>

      {loading ? <InlineLoadingState label="Montando timeline operacional do trabalhador" /> : null}

      {error && !loading ? (
        <ErrorState
          title="Falha ao carregar timeline"
          description={error}
          action={
            <Button
              type="button"
              onClick={() => {
                const userId = searchParams.get('userId');
                if (userId) {
                  void loadTimelineByUserId(userId);
                  return;
                }
                void loadTimelineByCpf(cpf);
              }}
            >
              Tentar novamente
            </Button>
          }
        />
      ) : null}

      {!timeline && !loading && !error ? (
        <EmptyState
          title="Timeline pronta para consulta"
          description="Busque um colaborador para consolidar dados operacionais, vencimentos e documentos."
        />
      ) : null}

      {timeline ? (
        <>
          <Card tone="default" padding="md">
            <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[color:var(--ds-color-action-primary)]/12 text-[var(--ds-color-action-primary)]">
                    <UserRound className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">{timeline.worker.nome}</CardTitle>
                    <CardDescription>
                      {timeline.worker.funcao || 'Função não informada'} · CPF {timeline.worker.cpf || 'não informado'}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-sm text-[var(--ds-color-text-secondary)]">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/20 px-3 py-1.5">
                    <Building2 className="h-4 w-4" />
                    {timeline.worker.companyName || 'Empresa não informada'}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/20 px-3 py-1.5">
                    <MapPin className="h-4 w-4" />
                    {timeline.worker.siteName || 'Sem obra vinculada'}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/20 px-3 py-1.5">
                    <CalendarDays className="h-4 w-4" />
                    Cadastro em {safeToLocaleDateString(timeline.worker.createdAt, 'pt-BR', undefined, '—')}
                  </span>
                </div>
              </div>
              <div
                className={`rounded-[var(--ds-radius-lg)] border px-4 py-3 text-sm ${
                  timeline.status.blocked
                    ? 'border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)]'
                    : 'border-[var(--ds-color-success-border)] bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)]'
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-80">Status operacional</p>
                <p className="mt-2 text-lg font-semibold">{timeline.status.operationalStatus}</p>
                <p className="mt-1 text-sm opacity-80">
                  ASO {timeline.summary.medicalExamStatus} · {timeline.summary.expiredTrainings} treinamento(s) vencido(s)
                </p>
              </div>
            </CardHeader>
            {timeline.status.reasons.length > 0 ? (
              <CardContent className="mt-0">
                <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] p-4">
                  <p className="text-sm font-semibold text-[var(--ds-color-danger)]">Motivos de bloqueio</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--ds-color-danger)]">
                    {timeline.status.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            ) : null}
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((item) => (
              <Card key={item.label} interactive padding="md">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardDescription>{item.label}</CardDescription>
                    <item.icon className="h-4.5 w-4.5 text-[var(--ds-color-action-primary)]" />
                  </div>
                  <CardTitle className="text-3xl">{item.value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.45fr_1fr]">
            <Card tone="default" padding="none">
              <CardHeader className="border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-5 py-4">
                <CardTitle>Eventos recentes</CardTitle>
                <CardDescription>
                  Linha do tempo operacional do colaborador, incluindo ASO, treinamentos, EPIs e documentos.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {timeline.timeline.length === 0 ? (
                  <EmptyState
                    title="Sem eventos para exibir"
                    description="Ainda não há movimentações suficientes para esta linha do tempo."
                    compact
                  />
                ) : (
                  timeline.timeline.map((event) => (
                    <div
                      key={event.id}
                      className="relative rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <EventIcon type={event.type} />
                            <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                              {event.title}
                            </p>
                          </div>
                          <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
                            {event.description}
                          </p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${eventToneClass(event.status)}`}>
                          {event.status}
                        </span>
                      </div>
                      <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
                        {safeToLocaleString(event.date, 'pt-BR', undefined, '—')}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card tone="default" padding="none">
                <CardHeader className="border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-5 py-4">
                  <CardTitle>Documentos relacionados</CardTitle>
                  <CardDescription>
                    Arquivos indexados no registry a partir de exames e treinamentos vinculados.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {timeline.documents.length === 0 ? (
                    <EmptyState
                      title="Sem documentos indexados"
                      description="Nenhum arquivo relacionado foi consolidado para este trabalhador ainda."
                      compact
                    />
                  ) : (
                    timeline.documents.map((document) => (
                      <div
                        key={document.id}
                        className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                              {document.title}
                            </p>
                            <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
                              {document.documentCode || document.originalName || 'Documento indexado'}
                            </p>
                          </div>
                          <span className="rounded-full bg-[var(--ds-color-surface-muted)]/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
                            {document.module}
                          </span>
                        </div>
                        <p className="mt-3 text-xs text-[var(--ds-color-text-secondary)]">
                          {document.documentDate
                            ? safeToLocaleDateString(document.documentDate, 'pt-BR', undefined, '—')
                            : 'Sem data documental'}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card tone="muted" padding="md">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-base">Ações rápidas</CardTitle>
                  <CardDescription>
                    Use a timeline para decidir o próximo movimento operacional do colaborador.
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-0 space-y-3">
                  <QuickAction href="/dashboard/tst" label="Voltar para TST em campo" />
                  <QuickAction href="/dashboard/document-registry" label="Abrir pacote documental" />
                  <QuickAction href={`/dashboard/employees/${timeline.worker.id}`} label="Editar cadastro do trabalhador" />
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function EventIcon({ type }: { type: WorkerTimelineResponse['timeline'][number]['type'] }) {
  const className = 'h-4 w-4 text-[var(--ds-color-action-primary)]';

  switch (type) {
    case 'medical_exam':
      return <Stethoscope className={className} />;
    case 'training':
      return <HardHat className={className} />;
    case 'epi_assignment':
      return <ShieldCheck className={className} />;
    case 'document':
      return <FileText className={className} />;
    default:
      return <UserRound className={className} />;
  }
}

function eventToneClass(status: WorkerTimelineResponse['timeline'][number]['status']) {
  switch (status) {
    case 'danger':
      return 'bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)]';
    case 'warning':
      return 'bg-[var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)]';
    case 'success':
      return 'bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)]';
    default:
      return 'bg-[var(--ds-color-info-subtle)] text-[var(--ds-color-info)]';
  }
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-4 py-3 text-sm font-medium text-[var(--ds-color-text-primary)] motion-safe:transition-colors hover:border-[var(--ds-color-action-primary)] hover:text-[var(--ds-color-action-primary)]"
    >
      <span>{label}</span>
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

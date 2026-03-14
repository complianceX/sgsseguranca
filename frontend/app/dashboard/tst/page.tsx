'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  ClipboardCheck,
  FileCheck2,
  FileText,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UserRoundSearch,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { dashboardService, TstDayDashboard } from '@/services/dashboardService';
import { usersService, WorkerOperationalStatus } from '@/services/usersService';
import {
  flushOfflineQueue,
  getOfflineQueueCount,
  getOfflineQueueSnapshot,
  removeOfflineQueueItem,
  retryOfflineQueueItem,
  type OfflineQueueItem,
} from '@/lib/offline-sync';
import { useApiStatus } from '@/hooks/useApiStatus';
import { useApiReconnect } from '@/hooks/useApiReconnect';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, InlineLoadingState, PageLoadingState } from '@/components/ui/state';
import { toast } from 'sonner';

const fieldActionCards = [
  {
    title: 'Checklist rápido',
    description: 'Fluxo mobile com foto do equipamento, autosave e fila offline.',
    href: '/dashboard/checklists/new?field=1',
    icon: ClipboardCheck,
    badge: 'offline pronto',
  },
  {
    title: 'Relatório fotográfico',
    description: 'Captura por celular com foco em evidência visual e conclusão técnica.',
    href: '/dashboard/inspections/new?field=1&kind=photographic',
    icon: Camera,
    badge: 'foto primeiro',
  },
  {
    title: 'Inspeção guiada',
    description: 'Riscos, plano de ação e evidências com botões grandes para obra.',
    href: '/dashboard/inspections/new?field=1',
    icon: ShieldAlert,
    badge: 'uso em campo',
  },
  {
    title: 'APR em campo',
    description: 'Abertura rápida da APR com rascunho local e contexto operacional.',
    href: '/dashboard/aprs/new?field=1',
    icon: FileText,
    badge: 'aprovacao guiada',
  },
  {
    title: 'PT em campo',
    description: 'Liberação operacional com wizard reduzido e retomada automática.',
    href: '/dashboard/pts/new?field=1',
    icon: FileCheck2,
    badge: 'liberacao',
  },
];

export default function TstFieldPage() {
  const [dashboard, setDashboard] = useState<TstDayDashboard | null>(null);
  const [workerStatus, setWorkerStatus] = useState<WorkerOperationalStatus | null>(null);
  const [cpf, setCpf] = useState('');
  const [loading, setLoading] = useState(true);
  const [workerLoading, setWorkerLoading] = useState(false);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [offlineCount, setOfflineCount] = useState(0);
  const [offlineQueueItems, setOfflineQueueItems] = useState<OfflineQueueItem[]>([]);
  const [syncingOfflineQueue, setSyncingOfflineQueue] = useState(false);
  const [retryingQueueItemId, setRetryingQueueItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isOffline, apiBaseUrl } = useApiStatus();
  const { isReconnecting, reconnect } = useApiReconnect(apiBaseUrl);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await dashboardService.getTstDay();
      setDashboard(data);
    } catch {
      setError('Não foi possível carregar a operação do dia.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
    setOfflineCount(getOfflineQueueCount());
    setOfflineQueueItems(getOfflineQueueSnapshot().slice().reverse());

    const onQueueUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: number }>).detail;
      setOfflineCount(detail?.count ?? getOfflineQueueCount());
      setOfflineQueueItems(getOfflineQueueSnapshot().slice().reverse());
    };
    const onSyncStarted = () => setSyncingOfflineQueue(true);
    const onSyncCompleted = () => {
      setSyncingOfflineQueue(false);
      setOfflineCount(getOfflineQueueCount());
      setOfflineQueueItems(getOfflineQueueSnapshot().slice().reverse());
    };

    window.addEventListener('app:offline-queue-updated', onQueueUpdate as EventListener);
    window.addEventListener('app:offline-sync-started', onSyncStarted as EventListener);
    window.addEventListener('app:offline-sync-completed', onSyncCompleted as EventListener);

    return () => {
      window.removeEventListener('app:offline-queue-updated', onQueueUpdate as EventListener);
      window.removeEventListener('app:offline-sync-started', onSyncStarted as EventListener);
      window.removeEventListener('app:offline-sync-completed', onSyncCompleted as EventListener);
    };
  }, []);

  const summaryCards = useMemo(
    () => [
      {
        label: 'PTs para liberar',
        value: dashboard?.summary.pendingPtApprovals ?? 0,
        icon: FileText,
        href: '/dashboard/pts',
        tone: 'text-amber-300',
      },
      {
        label: 'NCs críticas',
        value: dashboard?.summary.criticalNonConformities ?? 0,
        icon: ShieldAlert,
        href: '/dashboard/nonconformities',
        tone: 'text-rose-300',
      },
      {
        label: 'Inspeções atrasadas',
        value: dashboard?.summary.overdueInspections ?? 0,
        icon: ClipboardCheck,
        href: '/dashboard/inspections',
        tone: 'text-[var(--ds-color-success)]',
      },
      {
        label: 'Docs vencendo',
        value: dashboard?.summary.expiringDocuments ?? 0,
        icon: AlertTriangle,
        href: '/dashboard/medical-exams',
        tone: 'text-orange-300',
      },
    ],
    [dashboard],
  );

  const recentOfflineQueueItems = useMemo(
    () => offlineQueueItems.slice(0, 4),
    [offlineQueueItems],
  );

  const workerQuickFacts = useMemo(
    () => [
      {
        label: 'ASO',
        value: workerStatus?.medicalExam.status ?? 'Sem consulta',
      },
      {
        label: 'Treinamentos bloqueantes',
        value:
          workerStatus && workerStatus.trainings.expiredBlocking.length > 0
            ? String(workerStatus.trainings.expiredBlocking.length)
            : '0',
      },
      {
        label: 'EPIs ativos',
        value: workerStatus ? String(workerStatus.epis.totalActive) : '0',
      },
    ],
    [workerStatus],
  );

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    setWorkerLoading(true);
    setWorkerError(null);

    try {
      const result = await usersService.getWorkerStatusByCpf(cpf);
      setWorkerStatus(result);
    } catch {
      setWorkerStatus(null);
      setWorkerError('Trabalhador não encontrado ou sem dados operacionais.');
    } finally {
      setWorkerLoading(false);
    }
  };

  const handleRetryQueueItem = async (itemId: string) => {
    try {
      setRetryingQueueItemId(itemId);
      const result = await retryOfflineQueueItem(itemId);

      if (result.status === 'sent') {
        return;
      }
      if (result.status === 'offline') {
        toast.info('Você ainda está offline. Assim que a conexão voltar, o item poderá ser sincronizado.');
        return;
      }
      if (result.status === 'pending') {
        toast.info('O item continua na fila e será tentado novamente.');
        return;
      }
      toast.error('Não foi possível localizar este item na fila offline.');
    } catch {
      toast.error('Falha ao reenviar o item da fila offline.');
    } finally {
      setRetryingQueueItemId(null);
      setOfflineCount(getOfflineQueueCount());
      setOfflineQueueItems(getOfflineQueueSnapshot().slice().reverse());
    }
  };

  const handleRemoveQueueItem = (itemId: string) => {
    removeOfflineQueueItem(itemId);
    setOfflineCount(getOfflineQueueCount());
    setOfflineQueueItems(getOfflineQueueSnapshot().slice().reverse());
  };

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando cockpit de campo"
        description="Preparando bloqueios, pendências e status operacional do dia."
        cards={4}
        tableRows={6}
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Falha ao carregar operação de campo"
        description={error}
        action={
          <Button type="button" onClick={() => void loadDashboard()}>
            Recarregar
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card tone="elevated" padding="lg">
        <CardHeader className="gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-success)]">
              {isOffline ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
              operação de campo
            </div>
            <div>
              <CardTitle className="text-2xl">TST em campo</CardTitle>
              <CardDescription className="mt-2 max-w-2xl">
                Pendências do dia, decisão operacional por CPF, fila offline e atalhos de execução
                para APR, PT e documentos semanais.
              </CardDescription>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <OperationalChip
              label="Fila offline"
              value={String(offlineCount)}
              tone={offlineCount > 0 ? 'warning' : 'default'}
            />
            <OperationalChip
              label="API"
              value={isOffline ? 'Offline' : 'Online'}
              tone={isOffline ? 'danger' : 'success'}
            />
            <OperationalChip
              label="Sincronização"
              value={syncingOfflineQueue ? 'Em curso' : 'Estável'}
              tone={syncingOfflineQueue ? 'info' : 'default'}
            />
          </div>
        </CardHeader>
        <CardContent className="mt-0 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-[var(--ds-radius-lg)] border border-white/10 bg-black/10 p-3.5">
            <p className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
              Próximas ações de maior impacto
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {fieldActionCards.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-[var(--ds-radius-lg)] border border-white/10 bg-white/5 p-4 transition-colors hover:border-[color:var(--ds-color-success-border)] hover:bg-white/10"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--ds-color-success-subtle)] text-[var(--ds-color-success-fg)]">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <span className="rounded-full border border-[color:var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-success-fg)]">
                      {item.badge}
                    </span>
                  </div>
                  <p className="mt-4 text-[15px] font-semibold text-white">{item.title}</p>
                  <p className="mt-2 text-[13px] text-[var(--ds-color-text-secondary)]">{item.description}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--ds-color-success)]">
                    Abrir fluxo
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-[var(--ds-radius-lg)] border border-white/10 bg-black/10 p-3.5">
            <p className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
              Modo operacional
            </p>
            <div className="mt-3 space-y-3">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center"
                onClick={() => void flushOfflineQueue()}
                disabled={syncingOfflineQueue || offlineCount === 0}
                leftIcon={syncingOfflineQueue ? <RefreshCw className="h-4 w-4 animate-spin" /> : <WifiOff className="h-4 w-4" />}
              >
                {syncingOfflineQueue ? 'Sincronizando fila offline' : 'Sincronizar dados locais'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-center"
                onClick={reconnect}
                disabled={isReconnecting || !isOffline}
                leftIcon={<RefreshCw className={`h-4 w-4 ${isReconnecting ? 'animate-spin' : ''}`} />}
              >
                {isReconnecting ? 'Reconectando API' : 'Testar conectividade'}
              </Button>
              <p className="text-xs text-[var(--ds-color-text-muted)]">
                {isOffline
                  ? `API indisponível${apiBaseUrl ? ` em ${apiBaseUrl}` : ''}. Continue no modo offline e sincronize quando voltar.`
                  : 'Conectividade estável. A fila offline será enviada automaticamente quando necessário.'}
              </p>
              {getOfflineQueueSnapshot().length > 0 ? (
                <p className="text-xs text-amber-200">
                  Há itens aguardando envio. Priorize sincronização antes de encerrar o turno.
                </p>
              ) : null}
              {recentOfflineQueueItems.length > 0 ? (
                <div className="rounded-[var(--ds-radius-lg)] border border-amber-300/20 bg-amber-500/8 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-100">
                    Últimos itens na fila
                  </p>
                  <div className="mt-3 space-y-2">
                    {recentOfflineQueueItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-3 rounded-[var(--ds-radius-md)] border border-white/8 bg-black/10 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium text-white">{item.label}</p>
                          <p className="text-[11px] text-[var(--ds-color-text-muted)]">
                            {item.method.toUpperCase()} {item.url}
                          </p>
                        </div>
                        <span className="text-[11px] font-medium text-amber-100">
                          {new Date(item.createdAt).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <Link key={card.label} href={card.href}>
            <Card interactive padding="md">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <CardDescription>{card.label}</CardDescription>
                  <card.icon className={`h-5 w-5 ${card.tone}`} />
                </div>
                <CardTitle className="text-2xl">{card.value}</CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_1.35fr]">
        <Card tone="default" padding="none">
          <CardHeader className="border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-4 py-3.5">
            <div className="flex items-center gap-2">
              <UserRoundSearch className="h-5 w-5 text-[var(--ds-color-action-primary)]" />
              <div>
                <CardTitle>Consulta do trabalhador</CardTitle>
                <CardDescription>
                  Verifique prontidão operacional por CPF antes da mobilização ou liberação.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <form className="space-y-4" onSubmit={handleSearch}>
              <div>
                <label htmlFor="tst-worker-cpf" className="mb-2 block text-[13px] font-medium text-[var(--ds-color-text-secondary)]">
                  CPF
                </label>
                <input
                  id="tst-worker-cpf"
                  value={cpf}
                  onChange={(event) => setCpf(event.target.value)}
                  className="w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-[13px] text-[var(--ds-color-text-primary)] outline-none transition focus:border-[var(--ds-color-focus)] focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]"
                  placeholder="Digite o CPF"
                />
              </div>
              <Button
                type="submit"
                className="w-full justify-center"
                leftIcon={<Search className="h-4 w-4" />}
                disabled={workerLoading || cpf.trim().length < 11}
              >
                {workerLoading ? 'Consultando status operacional' : 'Consultar status operacional'}
              </Button>
            </form>

            {workerLoading ? <InlineLoadingState label="Buscando dados do trabalhador" /> : null}

            {workerError ? (
              <div className="rounded-[var(--ds-radius-lg)] border border-red-300/35 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {workerError}
              </div>
            ) : null}

            {!workerStatus && !workerError && !workerLoading ? (
              <EmptyState
                title="Consulta pronta"
                description="Digite um CPF para validar ASO, treinamentos, EPIs e bloqueios operacionais."
                compact
              />
            ) : null}

            {workerStatus ? (
              <div className="space-y-4">
                <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/18 p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                        {workerStatus.user.nome}
                      </p>
                      <p className="text-xs text-[var(--ds-color-text-muted)]">
                        {workerStatus.user.funcao || 'Função não informada'}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        workerStatus.blocked
                          ? 'bg-red-500/15 text-red-200'
                          : 'bg-emerald-500/15 text-emerald-200'
                      }`}
                    >
                      {workerStatus.operationalStatus}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {workerQuickFacts.map((fact) => (
                    <div
                      key={fact.label}
                      className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-3.5"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                        {fact.label}
                      </p>
                      <p className="mt-2 text-sm font-medium text-[var(--ds-color-text-primary)]">
                        {fact.value}
                      </p>
                    </div>
                  ))}
                </div>

                {workerStatus.reasons.length > 0 ? (
                  <div className="rounded-[var(--ds-radius-lg)] border border-red-300/35 bg-red-500/10 p-3.5">
                    <p className="text-sm font-semibold text-red-100">Motivos de bloqueio</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-200">
                      {workerStatus.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <Link href={`/dashboard/workers/timeline?cpf=${workerStatus.user.cpf || cpf}`}>
                  <Button type="button" variant="outline" className="w-full justify-center">
                    Abrir timeline completa do trabalhador
                  </Button>
                </Link>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card tone="default" padding="none">
            <CardHeader className="border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-4 py-3.5">
              <div className="flex items-center gap-2">
                <WifiOff className="h-5 w-5 text-[var(--ds-color-warning)]" />
                <div>
                  <CardTitle>Fila de sincronização</CardTitle>
                  <CardDescription>
                    Gerencie cada item salvo offline e envie novamente quando a conexão estiver estável.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {offlineQueueItems.length === 0 ? (
                <EmptyState
                  title="Fila offline vazia"
                  description="Nenhum item aguardando sincronização no momento."
                  compact
                />
              ) : (
                offlineQueueItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-3.5"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                          {item.label}
                        </p>
                        <p className="mt-1 text-xs text-[var(--ds-color-text-muted)]">
                          {item.method.toUpperCase()} {item.url}
                        </p>
                        <p className="mt-2 text-xs text-[var(--ds-color-text-secondary)]">
                          Criado em {new Date(item.createdAt).toLocaleString('pt-BR')}
                        </p>
                        {item.lastError ? (
                          <p className="mt-2 text-xs text-amber-200">
                            Último erro: {item.lastError}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleRetryQueueItem(item.id)}
                          disabled={retryingQueueItemId === item.id || syncingOfflineQueue}
                          leftIcon={
                            retryingQueueItemId === item.id ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )
                          }
                        >
                          Reenviar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => handleRemoveQueueItem(item.id)}
                          leftIcon={<Trash2 className="h-4 w-4" />}
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <OperationalListCard
            title="PTs pendentes de liberação"
            description="Permissões com bloqueio ou validação pendente antes da execução."
            href="/dashboard/pts"
            emptyLabel="Nenhuma PT pendente."
            items={(dashboard?.pendingPtApprovals || []).map((pt) => ({
              id: pt.id,
              title: `${pt.numero} - ${pt.titulo}`,
              subtitle: `${pt.site || 'Sem obra'} · ${pt.responsavel || 'Sem responsável'}`,
              badge: pt.residual_risk || 'Sem risco',
            }))}
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <OperationalListCard
              title="NCs críticas"
              description="Desvios críticos que exigem contenção imediata."
              href="/dashboard/nonconformities"
              emptyLabel="Nenhuma NC crítica aberta."
              items={(dashboard?.criticalNonConformities || []).map((item) => ({
                id: item.id,
                title: item.codigo_nc,
                subtitle: `${item.local_setor_area} · ${item.site || 'Sem obra'}`,
                badge: item.risco_nivel,
              }))}
              compact
            />

            <OperationalListCard
              title="Documentos vencendo"
              description="Vencimentos próximos de ASO e treinamento."
              href="/dashboard/trainings"
              emptyLabel="Nenhum documento vencendo nos próximos 7 dias."
              items={[
                ...((dashboard?.expiringDocuments.medicalExams || []).map((item) => ({
                  id: item.id,
                  title: item.workerName || 'Colaborador',
                  subtitle: `ASO ${item.tipo_exame} · ${
                    item.data_vencimento
                      ? new Date(item.data_vencimento).toLocaleDateString('pt-BR')
                      : 'sem vencimento'
                  }`,
                })) ?? []),
                ...((dashboard?.expiringDocuments.trainings || []).map((item) => ({
                  id: item.id,
                  title: item.workerName || 'Colaborador',
                  subtitle: `${item.nome} · ${new Date(item.data_vencimento).toLocaleDateString('pt-BR')}`,
                })) ?? []),
              ]}
              compact
            />

            <OperationalListCard
              title="Inspeções atrasadas"
              description="Ações de campo com plano pendente ou em atraso."
              href="/dashboard/inspections"
              emptyLabel="Nenhuma inspeção com plano em atraso."
              items={(dashboard?.overdueInspections || []).map((item) => ({
                id: item.id,
                title: item.setor_area,
                subtitle: `${item.site || 'Sem obra'} · ${new Date(item.data_inspecao).toLocaleDateString('pt-BR')}`,
                extra: item.responsavel || 'Responsável não informado',
              }))}
              compact
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function OperationalChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'default' | 'warning' | 'danger' | 'success' | 'info';
}) {
  const tones = {
    default: 'border-white/10 bg-white/5 text-white',
    warning: 'border-amber-300/35 bg-amber-500/10 text-amber-100',
    danger: 'border-red-300/35 bg-red-500/10 text-red-100',
    success: 'border-emerald-300/35 bg-emerald-500/10 text-emerald-100',
    info: 'border-[color:var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] text-[var(--ds-color-success-fg)]',
  };

  return (
    <div className={`rounded-[var(--ds-radius-lg)] border px-3.5 py-2.5 ${tones[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80">{label}</p>
      <p className="mt-1.5 text-base font-semibold">{value}</p>
    </div>
  );
}

function OperationalListCard({
  title,
  description,
  href,
  emptyLabel,
  items,
  compact = false,
}: {
  title: string;
  description: string;
  href: string;
  emptyLabel: string;
  items: Array<{ id: string; title: string; subtitle: string; badge?: string; extra?: string }>;
  compact?: boolean;
}) {
  return (
    <Card tone="default" padding="none">
      <CardHeader className="border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          <Link href={href} className="text-[13px] font-semibold text-[var(--ds-color-action-primary)]">
            Ver lista
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <EmptyState title={emptyLabel} description="Sem pendências para o recorte atual." compact />
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`font-semibold text-[var(--ds-color-text-primary)] ${compact ? 'text-sm' : 'text-base'}`}>
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-[var(--ds-color-text-muted)]">{item.subtitle}</p>
                  {item.extra ? (
                    <p className="mt-2 text-xs text-[var(--ds-color-text-secondary)]">{item.extra}</p>
                  ) : null}
                </div>
                {item.badge ? (
                  <span className="rounded-full bg-amber-500/12 px-3 py-1 text-xs font-semibold text-amber-100">
                    {item.badge}
                  </span>
                ) : null}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

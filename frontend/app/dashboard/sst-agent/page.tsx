'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  Bot,
  FileText,
  ClipboardCheck,
  ListChecks,
  MessageSquareText,
  Sparkles,
  Loader2,
  Wand2,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
} from 'lucide-react';
import { SophieStatusCard } from '@/components/SophieStatusCard';
import { isAiEnabled, isSophieAutomationPhase1Enabled } from '@/lib/featureFlags';
import {
  sophieService,
  SophieHistoryItem,
  CreateChecklistAutomationResponse,
  CreateDdsAutomationResponse,
  CreateNonConformityAutomationResponse,
  QueueMonthlyReportAutomationResponse,
} from '@/services/sophieService';
import { useAuth } from '@/context/AuthContext';
import { sitesService, Site } from '@/services/sitesService';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const quickActions = [
  {
    title: 'APR Assistida',
    description: 'SOPHIE sugere riscos e EPIs para acelerar emissão da APR.',
    href: '/dashboard/aprs/new',
    icon: FileText,
  },
  {
    title: 'PT Assistida',
    description: 'SOPHIE analisa criticidade e recomenda controles de liberação.',
    href: '/dashboard/pts/new',
    icon: ClipboardCheck,
  },
  {
    title: 'Checklist Assistido',
    description: 'SOPHIE gera checklist técnico baseado no contexto da atividade.',
    href: '/dashboard/checklists/new',
    icon: ListChecks,
  },
  {
    title: 'DDS Assistido',
    description: 'SOPHIE cria conteúdo prático de DDS para uso em campo.',
    href: '/dashboard/dds/new',
    icon: MessageSquareText,
  },
] as const;

export default function SstAgentPage() {
  const searchParams = useSearchParams();
  const aiEnabled = isAiEnabled();
  const phase1Enabled = isSophieAutomationPhase1Enabled();
  const { user, loading: authLoading, hasPermission } = useAuth();
  const [history, setHistory] = useState<SophieHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [checklistSiteId, setChecklistSiteId] = useState('');
  const [ddsSiteId, setDdsSiteId] = useState('');
  const [checklistTitle, setChecklistTitle] = useState('');
  const [checklistDescription, setChecklistDescription] = useState('');
  const [checklistEquipment, setChecklistEquipment] = useState('');
  const [checklistMachine, setChecklistMachine] = useState('');
  const [ddsTheme, setDdsTheme] = useState('');
  const [ddsContext, setDdsContext] = useState('');
  const [ncSiteId, setNcSiteId] = useState('');
  const [ncTitle, setNcTitle] = useState('');
  const [ncDescription, setNcDescription] = useState('');
  const [reportMonth, setReportMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [reportYear, setReportYear] = useState(String(new Date().getFullYear()));
  const [creatingChecklist, setCreatingChecklist] = useState(false);
  const [creatingDds, setCreatingDds] = useState(false);
  const [creatingNc, setCreatingNc] = useState(false);
  const [queueingReport, setQueueingReport] = useState(false);
  const [createdChecklist, setCreatedChecklist] = useState<CreateChecklistAutomationResponse | null>(null);
  const [createdDds, setCreatedDds] = useState<CreateDdsAutomationResponse | null>(null);
  const [createdNc, setCreatedNc] = useState<CreateNonConformityAutomationResponse | null>(null);
  const [queuedReport, setQueuedReport] = useState<QueueMonthlyReportAutomationResponse | null>(null);
  const canUseAi = hasPermission('can_use_ai');
  const prefilledDocumentType = searchParams.get('documentType') || '';
  const prefilledTitle = searchParams.get('title') || '';
  const prefilledDescription = searchParams.get('description') || '';
  const prefilledSiteId = searchParams.get('site_id') || '';

  useEffect(() => {
    let active = true;

    async function loadSites() {
      if (!aiEnabled || authLoading || !canUseAi) return;
      try {
        setLoadingSites(true);
        const data = await sitesService.findAll();
        if (!active) return;
        setSites(data);

        const preferredSiteId =
          user?.site_id ||
          data[0]?.id ||
          '';

        setChecklistSiteId((current) => current || preferredSiteId);
        setDdsSiteId((current) => current || preferredSiteId);
        setNcSiteId((current) => current || preferredSiteId);
      } catch (error) {
        console.error('Erro ao carregar sites para SOPHIE:', error);
        if (active) setSites([]);
      } finally {
        if (active) setLoadingSites(false);
      }
    }

    void loadSites();
    return () => {
      active = false;
    };
  }, [aiEnabled, authLoading, canUseAi, user?.site_id]);

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      if (!aiEnabled || !phase1Enabled || authLoading || !canUseAi) return;
      try {
        setLoadingHistory(true);
        const data = await sophieService.getHistory(12);
        if (!active) return;
        setHistory(Array.isArray(data) ? data : []);
      } catch {
        if (active) setHistory([]);
      } finally {
        if (active) setLoadingHistory(false);
      }
    }

    void loadHistory();
    return () => {
      active = false;
    };
  }, [aiEnabled, phase1Enabled, authLoading, canUseAi]);

  useEffect(() => {
    if (!prefilledSiteId && !prefilledTitle && !prefilledDescription) {
      return;
    }

    if (prefilledSiteId) {
      setChecklistSiteId((current) => current || prefilledSiteId);
      setDdsSiteId((current) => current || prefilledSiteId);
      setNcSiteId((current) => current || prefilledSiteId);
    }

    if (prefilledDocumentType === 'checklist') {
      setChecklistTitle((current) => current || prefilledTitle);
      setChecklistDescription((current) => current || prefilledDescription);
    }

    if (prefilledDocumentType === 'dds') {
      setDdsTheme((current) => current || prefilledTitle);
      setDdsContext((current) => current || prefilledDescription);
    }

    if (prefilledDocumentType === 'nc') {
      setNcTitle((current) => current || prefilledTitle);
      setNcDescription((current) => current || prefilledDescription);
    }
  }, [
    prefilledDescription,
    prefilledDocumentType,
    prefilledSiteId,
    prefilledTitle,
  ]);

  const sortedHistory = useMemo(
    () =>
      [...history].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [history],
  );

  const currentUserId = user?.id || '';
  const canRunAutomation = aiEnabled && canUseAi && Boolean(currentUserId);
  const hasSites = sites.length > 0;
  const automationPrefillLabel =
    {
      checklist: 'Checklist',
      dds: 'DDS',
      nc: 'Não Conformidade',
    }[prefilledDocumentType] || null;

  async function handleCreateChecklist() {
    if (!currentUserId) {
      toast.error('Usuário atual não identificado para criar checklist assistido.');
      return;
    }
    if (!checklistSiteId) {
      toast.error('Selecione um site para o checklist assistido.');
      return;
    }

    try {
      setCreatingChecklist(true);
      const response = await sophieService.createChecklist({
        titulo: checklistTitle || undefined,
        descricao: checklistDescription || undefined,
        equipamento: checklistEquipment || undefined,
        maquina: checklistMachine || undefined,
        site_id: checklistSiteId,
        inspetor_id: currentUserId,
      });
      setCreatedChecklist(response);
      toast.success('Checklist criado pela SOPHIE com sucesso.');
    } catch (error) {
      console.error('Erro ao criar checklist assistido:', error);
      toast.error('Não foi possível criar o checklist assistido agora.');
    } finally {
      setCreatingChecklist(false);
    }
  }

  async function handleCreateDds() {
    if (!currentUserId) {
      toast.error('Usuário atual não identificado para criar DDS assistido.');
      return;
    }
    if (!ddsSiteId) {
      toast.error('Selecione um site para o DDS assistido.');
      return;
    }

    try {
      setCreatingDds(true);
      const response = await sophieService.createDds({
        tema: ddsTheme || undefined,
        contexto: ddsContext || undefined,
        site_id: ddsSiteId,
        facilitador_id: currentUserId,
      });
      setCreatedDds(response);
      toast.success('DDS criado pela SOPHIE com sucesso.');
    } catch (error) {
      console.error('Erro ao criar DDS assistido:', error);
      toast.error('Não foi possível criar o DDS assistido agora.');
    } finally {
      setCreatingDds(false);
    }
  }

  async function handleCreateNc() {
    if (!ncSiteId) {
      toast.error('Selecione um site para a não conformidade assistida.');
      return;
    }

    try {
      setCreatingNc(true);
      const selectedSiteName = sites.find((site) => site.id === ncSiteId)?.nome;
      const response = await sophieService.createNonConformity({
        title: ncTitle || undefined,
        description: ncDescription || undefined,
        site_id: ncSiteId,
        local_setor_area: selectedSiteName || undefined,
        responsavel_area: user?.nome || undefined,
      });
      setCreatedNc(response);
      toast.success('Não conformidade criada pela SOPHIE com sucesso.');
    } catch (error) {
      console.error('Erro ao criar NC assistida:', error);
      toast.error('Não foi possível criar a não conformidade assistida agora.');
    } finally {
      setCreatingNc(false);
    }
  }

  async function handleQueueMonthlyReport() {
    const month = Number.parseInt(reportMonth, 10);
    const year = Number.parseInt(reportYear, 10);

    if (!Number.isFinite(month) || month < 1 || month > 12) {
      toast.error('Informe um mês válido para o relatório mensal.');
      return;
    }

    if (!Number.isFinite(year) || year < 2000) {
      toast.error('Informe um ano válido para o relatório mensal.');
      return;
    }

    try {
      setQueueingReport(true);
      const response = await sophieService.queueMonthlyReport({
        mes: month,
        ano: year,
      });
      setQueuedReport(response);
      toast.success('Relatório mensal enfileirado pela SOPHIE.');
    } catch (error) {
      console.error('Erro ao enfileirar relatório mensal:', error);
      toast.error('Não foi possível enfileirar o relatório mensal agora.');
    } finally {
      setQueueingReport(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-gradient-surface)] p-6 shadow-[var(--ds-shadow-sm)]">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[image:var(--ds-gradient-brand)] text-white shadow-[var(--ds-shadow-sm)]">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--ds-color-text-primary)]">SOPHIE</h1>
            <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
              Apoio operacional de SST para conformidade, analise tecnica e decisoes com prudencia.
            </p>
          </div>
        </div>
      </section>

      {automationPrefillLabel ? (
        <section className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-info)]/20 bg-[var(--ds-color-info-subtle)] p-4 shadow-[var(--ds-shadow-sm)]">
          <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
            Fluxo iniciado pelo hub documental para {automationPrefillLabel}.
          </p>
          <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
            O contexto foi pré-carregado. Revise os campos abaixo e execute a ação da SOPHIE quando estiver pronto.
          </p>
        </section>
      ) : null}

      {phase1Enabled ? (
        <section className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-gradient-surface)] p-5 shadow-[var(--ds-shadow-sm)]">
          <h2 className="text-base font-bold text-[var(--ds-color-text-primary)]">Automação Assistida Fase 1</h2>
          <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
            Rascunhos automáticos com validação humana antes da decisão final.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {quickActions.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-4 transition-all hover:-translate-y-px hover:border-[var(--ds-color-action-primary)]/40 hover:shadow-[var(--ds-shadow-sm)]"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--ds-color-primary-subtle)] text-[var(--ds-color-action-primary)]">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">{item.title}</p>
                      <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">{item.description}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {aiEnabled ? (
        <section className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-gradient-surface)] p-5 shadow-[var(--ds-shadow-sm)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[var(--ds-color-text-primary)]">
                Ações Operacionais da SOPHIE
              </h2>
              <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
                A SOPHIE agora consegue criar documentos assistidos e enfileirar relatório mensal usando o usuário atual como responsável.
              </p>
            </div>
            <div className="inline-flex items-center gap-1 rounded-full border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-primary-subtle)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-action-primary)]">
              <Wand2 className="h-3.5 w-3.5" />
              automação assistida
            </div>
          </div>

          {authLoading ? (
            <div className="mt-4 rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-4 text-sm text-[var(--ds-color-text-secondary)]">
              Validando permissões e contexto operacional para liberar as ações da SOPHIE...
            </div>
          ) : !canUseAi ? (
            <div className="mt-4 rounded-xl border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] p-4">
              <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                Seu perfil ainda não possui a permissão <code>can_use_ai</code>.
              </p>
              <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
                A SOPHIE fica visivel, mas a criacao assistida de documentos e os relatorios automaticos exigem liberacao no backend.
              </p>
            </div>
          ) : (
          <div className="mt-4 grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
            <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-4">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4.5 w-4.5 text-[var(--ds-color-action-primary)]" />
                <h3 className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                  Criar Checklist
                </h3>
              </div>
              <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
                Gere e salve checklist técnico com itens iniciais de inspeção SST.
              </p>
              <div className="mt-3 space-y-2.5">
                <input
                  value={checklistTitle}
                  onChange={(event) => setChecklistTitle(event.target.value)}
                  placeholder="Título opcional"
                  className="w-full rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/25 px-3 py-2 text-sm text-[var(--ds-color-text-primary)] outline-none focus:border-[var(--ds-color-action-primary)]"
                />
                <textarea
                  value={checklistDescription}
                  onChange={(event) => setChecklistDescription(event.target.value)}
                  placeholder="Descreva a atividade ou frente de serviço"
                  rows={3}
                  className="w-full rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/25 px-3 py-2 text-sm text-[var(--ds-color-text-primary)] outline-none focus:border-[var(--ds-color-action-primary)]"
                />
                <input
                  value={checklistEquipment}
                  onChange={(event) => setChecklistEquipment(event.target.value)}
                  placeholder="Equipamento opcional"
                  className="w-full rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/25 px-3 py-2 text-sm text-[var(--ds-color-text-primary)] outline-none focus:border-[var(--ds-color-action-primary)]"
                />
                <input
                  value={checklistMachine}
                  onChange={(event) => setChecklistMachine(event.target.value)}
                  placeholder="Máquina opcional"
                  className="w-full rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/25 px-3 py-2 text-sm text-[var(--ds-color-text-primary)] outline-none focus:border-[var(--ds-color-action-primary)]"
                />
                <select
                  value={checklistSiteId}
                  onChange={(event) => setChecklistSiteId(event.target.value)}
                  disabled={loadingSites || !hasSites}
                  className="w-full rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/25 px-3 py-2 text-sm text-[var(--ds-color-text-primary)] outline-none focus:border-[var(--ds-color-action-primary)]"
                >
                  <option value="">
                    {loadingSites ? 'Carregando sites...' : 'Selecione um site'}
                  </option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.nome}
                    </option>
                  ))}
                </select>
                <Button
                  onClick={handleCreateChecklist}
                  loading={creatingChecklist}
                  disabled={!canRunAutomation || !hasSites}
                  className="w-full"
                  leftIcon={<Wand2 className="h-4 w-4" />}
                >
                  Criar checklist pela SOPHIE
                </Button>
                {createdChecklist ? (
                  <div className="rounded-xl border border-[var(--ds-color-success)]/20 bg-[var(--ds-color-success-subtle)] p-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                      <CheckCircle2 className="h-4 w-4 text-[var(--ds-color-success)]" />
                      {createdChecklist.generation.titulo}
                    </p>
                    <Link
                      href={`/dashboard/checklists/edit/${createdChecklist.checklist.id}`}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--ds-color-action-primary)] hover:underline"
                    >
                      Abrir checklist <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-4">
              <div className="flex items-center gap-2">
                <MessageSquareText className="h-4.5 w-4.5 text-[var(--ds-color-accent)]" />
                <h3 className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                  Criar DDS
                </h3>
              </div>
              <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
                Gere e salve um DDS prático para condução em campo.
              </p>
              <div className="mt-3 space-y-2.5">
                <input
                  value={ddsTheme}
                  onChange={(event) => setDdsTheme(event.target.value)}
                  placeholder="Tema do DDS"
                  className="w-full rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/25 px-3 py-2 text-sm text-[var(--ds-color-text-primary)] outline-none focus:border-[var(--ds-color-action-primary)]"
                />
                <textarea
                  value={ddsContext}
                  onChange={(event) => setDdsContext(event.target.value)}
                  placeholder="Contexto operacional, tarefa ou risco dominante"
                  rows={4}
                  className="w-full rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/25 px-3 py-2 text-sm text-[var(--ds-color-text-primary)] outline-none focus:border-[var(--ds-color-action-primary)]"
                />
                <select
                  value={ddsSiteId}
                  onChange={(event) => setDdsSiteId(event.target.value)}
                  disabled={loadingSites || !hasSites}
                  className="w-full rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/25 px-3 py-2 text-sm text-[var(--ds-color-text-primary)] outline-none focus:border-[var(--ds-color-action-primary)]"
                >
                  <option value="">
                    {loadingSites ? 'Carregando sites...' : 'Selecione um site'}
                  </option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.nome}
                    </option>
                  ))}
                </select>
                <Button
                  onClick={handleCreateDds}
                  loading={creatingDds}
                  disabled={!canRunAutomation || !hasSites}
                  variant="success"
                  className="w-full"
                  leftIcon={<MessageSquareText className="h-4 w-4" />}
                >
                  Criar DDS pela SOPHIE
                </Button>
                {createdDds ? (
                  <div className="rounded-xl border border-[var(--ds-color-success)]/20 bg-[var(--ds-color-success-subtle)] p-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                      <CheckCircle2 className="h-4 w-4 text-[var(--ds-color-success)]" />
                      {createdDds.generation.tema}
                    </p>
                    <Link
                      href={`/dashboard/dds/edit/${createdDds.dds.id}`}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--ds-color-action-primary)] hover:underline"
                    >
                      Abrir DDS <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4.5 w-4.5 text-[var(--ds-color-warning)]" />
                <h3 className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                  Criar NC
                </h3>
              </div>
              <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
                Gere uma não conformidade inicial com desvio, risco e ações para revisão humana.
              </p>
              <div className="mt-3 space-y-2.5">
                <input
                  value={ncTitle}
                  onChange={(event) => setNcTitle(event.target.value)}
                  placeholder="Título do desvio ou achado"
                  className="w-full rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/25 px-3 py-2 text-sm text-[var(--ds-color-text-primary)] outline-none focus:border-[var(--ds-color-action-primary)]"
                />
                <textarea
                  value={ncDescription}
                  onChange={(event) => setNcDescription(event.target.value)}
                  placeholder="Descreva a evidência observada, condição insegura ou desvio identificado"
                  rows={4}
                  className="w-full rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/25 px-3 py-2 text-sm text-[var(--ds-color-text-primary)] outline-none focus:border-[var(--ds-color-action-primary)]"
                />
                <select
                  value={ncSiteId}
                  onChange={(event) => setNcSiteId(event.target.value)}
                  disabled={loadingSites || !hasSites}
                  className="w-full rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/25 px-3 py-2 text-sm text-[var(--ds-color-text-primary)] outline-none focus:border-[var(--ds-color-action-primary)]"
                >
                  <option value="">
                    {loadingSites ? 'Carregando sites...' : 'Selecione um site'}
                  </option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.nome}
                    </option>
                  ))}
                </select>
                <Button
                  onClick={handleCreateNc}
                  loading={creatingNc}
                  disabled={!aiEnabled || !canUseAi || !hasSites}
                  variant="warning"
                  className="w-full"
                  leftIcon={<AlertTriangle className="h-4 w-4" />}
                >
                  Criar NC pela SOPHIE
                </Button>
                {createdNc ? (
                  <div className="rounded-xl border border-[var(--ds-color-success)]/20 bg-[var(--ds-color-success-subtle)] p-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                      <CheckCircle2 className="h-4 w-4 text-[var(--ds-color-success)]" />
                      {createdNc.nonConformity.codigo_nc || createdNc.generation.title}
                    </p>
                    <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
                      Nível de risco sugerido: {createdNc.generation.riskLevel}
                    </p>
                    <Link
                      href={`/dashboard/nonconformities/edit/${createdNc.nonConformity.id}`}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--ds-color-action-primary)] hover:underline"
                    >
                      Abrir NC <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-4">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4.5 w-4.5 text-[var(--ds-color-warning)]" />
                <h3 className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                  Relatório Mensal
                </h3>
              </div>
              <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
                Enfileire o relatório mensal consolidado do tenant atual pela SOPHIE.
              </p>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                <input
                  value={reportMonth}
                  onChange={(event) => setReportMonth(event.target.value)}
                  placeholder="Mês"
                  className="w-full rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/25 px-3 py-2 text-sm text-[var(--ds-color-text-primary)] outline-none focus:border-[var(--ds-color-action-primary)]"
                />
                <input
                  value={reportYear}
                  onChange={(event) => setReportYear(event.target.value)}
                  placeholder="Ano"
                  className="w-full rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/25 px-3 py-2 text-sm text-[var(--ds-color-text-primary)] outline-none focus:border-[var(--ds-color-action-primary)]"
                />
              </div>
              <div className="mt-3">
                <Button
                  onClick={handleQueueMonthlyReport}
                  loading={queueingReport}
                  disabled={!canRunAutomation}
                  variant="warning"
                  className="w-full"
                  leftIcon={<CalendarDays className="h-4 w-4" />}
                >
                  Enfileirar relatório mensal
                </Button>
              </div>
              {queuedReport ? (
                <div className="mt-3 rounded-xl border border-[var(--ds-color-success)]/20 bg-[var(--ds-color-success-subtle)] p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                    <CheckCircle2 className="h-4 w-4 text-[var(--ds-color-success)]" />
                    Relatório {String(queuedReport.month).padStart(2, '0')}/{queuedReport.year} na fila
                  </p>
                  <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
                    Job ID: {String(queuedReport.jobId || 'n/a')}
                  </p>
                  <Link
                    href="/dashboard/reports"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--ds-color-action-primary)] hover:underline"
                  >
                    Abrir relatórios <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
          )}
        </section>
      ) : null}

      {!aiEnabled ? (
        <section className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] p-5 text-[var(--ds-color-warning)] shadow-[var(--ds-shadow-sm)]">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4.5 w-4.5" />
            <div>
              <p className="text-sm font-semibold">SOPHIE está desativada neste ambiente.</p>
              <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
                Defina <code>NEXT_PUBLIC_FEATURE_AI_ENABLED=true</code> no frontend para habilitar a experiência completa.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {aiEnabled && phase1Enabled && canUseAi ? (
        <section className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-gradient-surface)] p-5 shadow-[var(--ds-shadow-sm)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-[var(--ds-color-text-primary)]">Trilha de Auditoria da SOPHIE</h2>
            {loadingHistory ? (
              <span className="inline-flex items-center gap-1 text-xs text-[var(--ds-color-text-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Atualizando
              </span>
            ) : null}
          </div>
          {sortedHistory.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--ds-color-text-secondary)]">
              Ainda não há interações registradas para este usuário/tenant.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {sortedHistory.slice(0, 10).map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-[var(--ds-color-text-primary)]">
                      {item.question || 'Interação SOPHIE'}
                    </p>
                    <span className="text-[11px] text-[var(--ds-color-text-muted)]">
                      {new Date(item.created_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[var(--ds-color-text-secondary)]">
                    <span>Status: {item.status}</span>
                    <span>Confiança: {item.confidence || 'n/a'}</span>
                    <span>Latência: {item.latency_ms ?? 0}ms</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <SophieStatusCard />
    </div>
  );
}

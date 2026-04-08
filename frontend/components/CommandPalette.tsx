'use client';

import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Archive, ClipboardCheck, ClipboardList, Command, FileText, GraduationCap, PlusCircle, Radio, Search, Settings, Shield, ShieldCheck, Stethoscope, UserRound, Users, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { isTemporarilyVisibleDashboardRoute } from '@/lib/temporarilyHiddenModules';

type CommandItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  keywords: string[];
  permission?: string;
};

const baseCommands: CommandItem[] = [
  {
    id: 'dashboard',
    title: 'Abrir Dashboard',
    subtitle: 'Cockpit executivo e visão geral do tenant',
    href: '/dashboard',
    keywords: ['dashboard', 'home', 'cockpit'],
  },
  {
    id: 'tst',
    title: 'Abrir TST em Campo',
    subtitle: 'Pendências do dia, CPF e fila offline',
    href: '/dashboard/tst',
    keywords: ['tst', 'campo', 'offline', 'cpf'],
  },
  {
    id: 'apr',
    title: 'Abrir APRs',
    subtitle: 'Análise preliminar de risco e controles',
    href: '/dashboard/aprs',
    keywords: ['apr', 'risco', 'analise', 'perigos'],
  },
  {
    id: 'pt',
    title: 'Abrir PTs',
    subtitle: 'Permissões de trabalho e bloqueios',
    href: '/dashboard/pts',
    keywords: ['pt', 'permissao', 'liberacao'],
  },
  {
    id: 'did',
    title: 'Abrir Diálogo do Início do Dia',
    subtitle: 'Planejamento operacional e atividade programada do dia',
    href: '/dashboard/dids',
    keywords: ['did', 'inicio do dia', 'atividade do dia', 'operacional'],
    permission: 'can_view_dids',
  },
  {
    id: 'arr',
    title: 'Abrir ARR',
    subtitle: 'Análise de risco rápida com tratamento imediato',
    href: '/dashboard/arrs',
    keywords: ['arr', 'analise de risco rapida', 'risco rapido', 'tratamento imediato'],
    permission: 'can_view_arrs',
  },
  {
    id: 'docs',
    title: 'Abrir Registry documental',
    subtitle: 'Pacote semanal e rastreabilidade',
    href: '/dashboard/document-registry',
    keywords: ['documentos', 'registry', 'pacote', 'semana'],
    permission: 'can_view_documents_registry',
  },
  {
    id: 'trainings',
    title: 'Abrir Treinamentos',
    subtitle: 'Normas, vencimentos e compliance',
    href: '/dashboard/trainings',
    keywords: ['treinamento', 'nr', 'curso'],
  },
  {
    id: 'medical',
    title: 'Abrir Exames médicos',
    subtitle: 'ASO, PCMSO e aptidão ocupacional',
    href: '/dashboard/medical-exams',
    keywords: ['aso', 'pcmso', 'exame'],
  },
  {
    id: 'employees',
    title: 'Abrir Funcionários',
    subtitle: 'Mobilização e prontidão operacional',
    href: '/dashboard/employees',
    keywords: ['funcionarios', 'mobilizacao', 'colaborador'],
  },
  {
    id: 'worker-timeline',
    title: 'Abrir Timeline do trabalhador',
    subtitle: 'Consulta consolidada por CPF com prontidão operacional',
    href: '/dashboard/workers/timeline',
    keywords: ['timeline', 'cpf', 'trabalhador', 'mobilizacao'],
  },
  {
    id: 'settings',
    title: 'Abrir Configurações',
    subtitle: 'Parâmetros, regras e ajustes do tenant',
    href: '/dashboard/settings',
    keywords: ['configuracoes', 'ajustes'],
  },
  {
    id: 'checklists-central',
    title: 'Abrir central de modelos de checklist',
    subtitle: 'Hub visual de checklists e modelos',
    href: '/dashboard/checklist-models',
    keywords: ['checklist', 'modelos', 'central'],
  },
  {
    id: 'checklists-normativos',
    title: 'Abrir checklists operacionais',
    subtitle: 'Modelos normativos e operacionais do sistema',
    href: '/dashboard/checklist-models/operacionais',
    keywords: ['checklists', 'operacionais', 'normativos', 'nr', 'norma'],
    permission: 'can_view_checklists',
  },
  {
    id: 'checklists-operacionais',
    title: 'Abrir execuções de checklist',
    subtitle: 'Registros preenchidos e evidências de campo',
    href: '/dashboard/checklists',
    keywords: ['checklists', 'execucoes', 'campo', 'preenchidos'],
    permission: 'can_view_checklists',
  },
  {
    id: 'checklists-equipamentos',
    title: 'Abrir checklists de equipamentos',
    subtitle: 'Inspeção e controle de ativos e ferramentas',
    href: '/dashboard/checklist-models/equipamentos',
    keywords: ['checklists', 'equipamentos', 'ferramentas'],
    permission: 'can_view_checklists',
  },
  {
    id: 'checklists-epis',
    title: 'Abrir checklists de EPIs',
    subtitle: 'Controle de uso, inspeção e conformidade de EPI',
    href: '/dashboard/checklist-models/epis',
    keywords: ['checklists', 'epis', 'epi'],
    permission: 'can_view_checklists',
  },
  {
    id: 'checklists-new',
    title: 'Novo checklist',
    subtitle: 'Abrir formulário de criação',
    href: '/dashboard/checklists/new',
    keywords: ['novo checklist', 'criar checklist', 'formulario checklist'],
    permission: 'can_manage_checklists',
  },
  {
    id: 'checklist-models-new',
    title: 'Novo modelo de checklist',
    subtitle: 'Criar template de checklist',
    href: '/dashboard/checklist-models/new',
    keywords: ['novo modelo', 'template', 'criar modelo'],
    permission: 'can_manage_checklists',
  },
  {
    id: 'checklists-new-normativos',
    title: 'Novo modelo operacional',
    subtitle: 'Criar modelo já classificado como operacional',
    href: '/dashboard/checklist-models/new?categoria=Operacional',
    keywords: ['novo modelo operacional', 'normativo', 'operacional'],
    permission: 'can_manage_checklists',
  },
  {
    id: 'checklists-new-operacionais',
    title: 'Novo checklist direto',
    subtitle: 'Abrir formulário de execução manual de checklist',
    href: '/dashboard/checklists/new',
    keywords: ['novo checklist', 'execucao', 'preenchimento'],
    permission: 'can_manage_checklists',
  },
  {
    id: 'checklists-new-equipamentos',
    title: 'Novo modelo de equipamentos',
    subtitle: 'Criar modelo para ativos, máquinas e ferramentas',
    href: '/dashboard/checklist-models/new?categoria=Equipamento',
    keywords: ['novo modelo equipamento', 'equipamentos', 'ferramentas'],
    permission: 'can_manage_checklists',
  },
  {
    id: 'checklists-new-epis',
    title: 'Novo modelo de EPI',
    subtitle: 'Criar modelo para inspeção e conformidade de EPI',
    href: '/dashboard/checklist-models/new?categoria=EPI',
    keywords: ['novo modelo epi', 'epis', 'equipamento de protecao'],
    permission: 'can_manage_checklists',
  },
];

const iconMap = {
  dashboard: ShieldCheck,
  tst: Radio,
  apr: FileText,
  pt: ClipboardCheck,
  did: ClipboardCheck,
  arr: AlertTriangle,
  docs: Archive,
  trainings: GraduationCap,
  medical: Stethoscope,
  employees: Users,
  'worker-timeline': UserRound,
  settings: Settings,
  'checklists-central': ClipboardList,
  'checklists-normativos': FileText,
  'checklists-operacionais': ClipboardCheck,
  'checklists-equipamentos': Settings,
  'checklists-epis': Shield,
  'checklists-new': PlusCircle,
  'checklist-models-new': PlusCircle,
  'checklists-new-normativos': PlusCircle,
  'checklists-new-operacionais': PlusCircle,
  'checklists-new-equipamentos': PlusCircle,
  'checklists-new-epis': PlusCircle,
} satisfies Record<string, ComponentType<{ className?: string }>>;

export function CommandPalette() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsOpen((current) => !current);
      }

      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const onToggle = () => setIsOpen((current) => !current);
    const onOpen = () => setIsOpen(true);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('app:command-palette-toggle', onToggle as EventListener);
    window.addEventListener('app:command-palette-open', onOpen as EventListener);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('app:command-palette-toggle', onToggle as EventListener);
      window.removeEventListener('app:command-palette-open', onOpen as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
    }
  }, [isOpen]);

  const commands = useMemo(() => {
    const available = baseCommands.filter(
      (command) =>
        isTemporarilyVisibleDashboardRoute(command.href) &&
        (!command.permission || hasPermission(command.permission)),
    );

    const normalized = query.trim().toLowerCase();
    if (!normalized) return available;

    return available.filter((command) =>
      [command.title, command.subtitle, ...command.keywords]
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    );
  }, [hasPermission, query]);

  const handleSelect = (href: string) => {
    setIsOpen(false);
    router.push(href);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-[color:var(--component-command-overlay)] px-4 pt-[10vh] backdrop-blur-md">
      <div className="w-full max-w-[42rem] overflow-hidden rounded-[1.5rem] border border-[var(--component-command-border)] bg-[color:var(--component-command-bg)] shadow-[var(--ds-shadow-xl)]">
        <div className="flex items-center gap-3 border-b border-[var(--color-border-subtle)] px-4 py-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--component-command-icon-bg)] text-[var(--component-command-muted)]">
            <Search className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar módulo, ação ou fluxo..."
              className="w-full border-0 bg-transparent text-[15px] text-[var(--color-text)] outline-none placeholder:text-[var(--component-command-muted)]"
              aria-label="Buscar ações rápidas"
            />
            <p className="mt-1 text-[11px] text-[var(--component-command-muted)]">
              Atalho global do produto para navegação e execução rápida.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[color:var(--component-command-icon-bg)] text-[var(--component-command-muted)] transition-colors hover:bg-[color:var(--color-card-muted)] hover:text-[var(--color-text)]"
            aria-label="Fechar palette"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[24rem] overflow-y-auto p-2.5">
          {commands.length === 0 ? (
            <div className="rounded-xl border border-[var(--component-command-border)] bg-[color:var(--component-command-icon-bg)] px-4 py-7 text-center">
              <Command className="mx-auto h-9 w-9 text-[var(--component-command-muted)]" />
              <p className="mt-3 text-[13px] font-semibold text-[var(--color-text)]">Nenhuma ação encontrada</p>
              <p className="mt-1 text-[13px] text-[var(--component-command-muted)]">
                Ajuste o termo de busca para localizar outro fluxo.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {commands.map((command) => {
                const Icon = iconMap[command.id as keyof typeof iconMap] || ShieldCheck;

                return (
                  <button
                    key={command.id}
                    type="button"
                    onClick={() => handleSelect(command.href)}
                    className={cn(
                      'flex w-full items-center gap-3.5 rounded-xl border border-transparent px-3.5 py-2.5 text-left transition-colors',
                      'bg-[color:var(--color-card-muted)]/18 hover:border-[var(--component-command-border)] hover:bg-[color:var(--color-card-muted)]/28',
                    )}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--component-command-icon-bg)] text-[var(--color-info)]">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-[var(--color-text)]">{command.title}</span>
                      <span className="block truncate text-[11px] text-[var(--component-command-muted)]">
                        {command.subtitle}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ClipboardCheck, Command, FileText, GraduationCap, Radio, Search, Settings, ShieldCheck, Stethoscope, UserRound, Users, X } from 'lucide-react';
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
];

const iconMap = {
  dashboard: ShieldCheck,
  tst: Radio,
  apr: FileText,
  pt: ClipboardCheck,
  docs: Archive,
  trainings: GraduationCap,
  medical: Stethoscope,
  employees: Users,
  'worker-timeline': UserRound,
  settings: Settings,
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
      <div className="w-full max-w-[42rem] overflow-hidden rounded-[1.5rem] border border-[var(--component-command-border)] bg-[image:var(--component-command-bg)] shadow-[var(--ds-shadow-xl)]">
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

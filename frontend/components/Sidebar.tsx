'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { isTemporarilyVisibleDashboardRoute } from '@/lib/temporarilyHiddenModules';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  ClipboardX,
  FileLock2,
  FileText,
  LayoutDashboard,
  LineChart,
  LogOut,
  Map,
  MapPin,
  MessageSquare,
  Settings,
  Shield,
  Upload,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

type MenuEntry = {
  icon?: typeof LayoutDashboard;
  label: string;
  href?: string;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
};

type MenuSection = {
  id: string;
  label: string;
  items: MenuEntry[];
  defaultOpen?: boolean;
};

const menuSections: MenuSection[] = [
  {
    id: 'estrutura',
    label: 'Estrutura',
    defaultOpen: true,
    items: [
      { icon: Building2, label: 'Empresas', href: '/dashboard/companies', adminOnly: true },
      { icon: MapPin, label: 'Obras/Setores', href: '/dashboard/sites', adminOnly: true },
      { icon: Users, label: 'Funcionários', href: '/dashboard/employees' },
      { icon: Shield, label: 'Usuários e acesso', href: '/dashboard/users', adminOnly: true },
      { icon: CalendarDays, label: 'Calendário', href: '/dashboard/calendar', adminOnly: true },
    ],
  },
  {
    id: 'operacao',
    label: 'Campo e Operação',
    defaultOpen: true,
    items: [
      { icon: MessageSquare, label: 'DDS', href: '/dashboard/dds' },
      { icon: FileLock2, label: 'PTs', href: '/dashboard/pts' },
      { icon: FileText, label: 'APRs', href: '/dashboard/aprs' },
      { icon: ClipboardList, label: 'Checklists', href: '/dashboard/checklist-models' },
      { icon: BookOpen, label: 'RDO', href: '/dashboard/rdos' },
      { icon: ClipboardCheck, label: 'Relatório de inspeção', href: '/dashboard/inspections' },
      { icon: AlertTriangle, label: 'Não conformidades', href: '/dashboard/nonconformities' },
      { icon: ClipboardX, label: 'Auditorias', href: '/dashboard/audits' },
    ],
  },
  {
    id: 'principal',
    label: 'Leitura e Gestão',
    defaultOpen: false,
    items: [
      { icon: AlertCircle, label: 'CATs', href: '/dashboard/cats' },
      {
        icon: Shield,
        label: 'Pendências documentais',
        href: '/dashboard/document-pendencies',
      },
      { icon: Map, label: 'Mapa de risco', href: '/dashboard/risk-map' },
      { icon: CheckSquare, label: 'Ações corretivas', href: '/dashboard/corrective-actions' },
      { icon: Upload, label: 'Importar com IA', href: '/dashboard/documentos/importar' },
      { icon: BarChart3, label: 'Indicadores', href: '/dashboard/kpis' },
      { icon: LineChart, label: 'Executivo', href: '/dashboard/executive' },
    ],
  },
  {
    id: 'sistema',
    label: 'Sistema',
    defaultOpen: false,
    items: [
      { icon: Settings, label: 'Configurações', href: '/dashboard/settings' },
    ],
  },
];

const SECTION_IDS = menuSections.map((section) => section.id);

export function Sidebar({
  isOpen = false,
  onClose,
}: {
  isOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const { logout, user, hasPermission, isAdminGeral } = useAuth();
  const defaultOpenSections = useMemo(
    () =>
      Object.fromEntries(
        menuSections.map((section) => [section.id, section.defaultOpen ?? true]),
      ) as Record<string, boolean>,
    [],
  );

  const visibleSections = useMemo(() => {
    return menuSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if (!isTemporarilyVisibleDashboardRoute(item.href)) return false;
          if (item.adminOnly && !isAdminGeral) return false;
          if (item.superAdminOnly && !isAdminGeral) return false;

          const href = item.href || '';
          const needsDashboardPermission = [
            '/dashboard/kpis',
            '/dashboard/executive',
            '/dashboard/reports',
            '/dashboard/document-pendencies',
          ].includes(href);

          if (needsDashboardPermission && !hasPermission('can_view_dashboard')) {
            return false;
          }

          if (href === '/dashboard/risks' && !hasPermission('can_view_risks')) {
            return false;
          }

          if (href === '/dashboard/document-registry' && !hasPermission('can_view_documents_registry')) {
            return false;
          }

          return true;
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [hasPermission, isAdminGeral]);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(defaultOpenSections);

  useEffect(() => {
    setOpenSections((current) =>
      Object.fromEntries(
        SECTION_IDS.map((sectionId) => [
          sectionId,
          current[sectionId] ?? defaultOpenSections[sectionId] ?? false,
        ]),
      ),
    );
  }, [defaultOpenSections]);

  const toggleSection = (sectionId: string) => {
    setOpenSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  };

  return (
    <>
      <button
        type="button"
        aria-label="Fechar menu lateral"
        tabIndex={-1}
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-[color:var(--component-overlay)] backdrop-blur-sm transition-opacity xl:hidden',
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-full w-60 flex-col border-r border-[color:var(--ds-color-sidebar-border)] bg-[var(--ds-color-sidebar-bg)] text-[var(--ds-color-sidebar-text)] shadow-[var(--ds-shadow-sm)] transition-transform duration-[var(--ds-motion-base)] xl:static xl:z-auto xl:translate-x-0 xl:shadow-none',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Brand panel */}
        <div className="border-b border-[color:var(--ds-color-sidebar-border)] bg-[color:var(--ds-color-sidebar-bg-soft)]/60 px-5 py-4">
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-[color:var(--component-sidebar-panel-border)] bg-[var(--component-sidebar-panel-bg)] px-3.5 py-6 text-center">
            <div className="min-w-0">
              <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-sidebar-muted)]">
                Plataforma enterprise
              </p>
              <p className="mt-2 text-[0.8rem] leading-6 text-[var(--ds-color-sidebar-text)]">
                Sistema de Gestão de Segurança
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto py-3">
          <nav>
            {visibleSections.map((section) => {
              const isSectionActive = section.items.some((item) => pathname === item.href);
              const isOpenSection = openSections[section.id] || isSectionActive;

              return (
                <section key={section.id} className="pt-5 first:pt-2">
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    className="flex w-full items-center justify-between rounded-[var(--ds-radius-sm)] px-4 pb-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-color-sidebar-bg)]"
                  >
                    <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[var(--ds-color-sidebar-muted)]">
                      {section.label}
                    </span>
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 text-[var(--ds-color-sidebar-muted)]/70 transition-transform',
                        isOpenSection ? 'rotate-180' : '',
                      )}
                    />
                  </button>

                  {isOpenSection ? (
                    <div className="space-y-0.5">
                      {section.items.map((item) => {
                        const Icon = item.icon!;
                        const active = pathname === item.href;

                        return (
                          <Link
                            key={item.href}
                            href={item.href!}
                            onClick={onClose}
                            className={cn(
                              'mx-2 flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-color-sidebar-bg)]',
                              active
                                ? 'border-[color:var(--component-sidebar-active-border)] bg-[var(--component-sidebar-active-bg)] text-[var(--ds-color-sidebar-text)]'
                                : 'border-transparent text-[var(--ds-color-sidebar-muted)] hover:border-[color:var(--ds-color-sidebar-border)] hover:bg-[color:var(--brand-sidebar-hover)] hover:text-[var(--ds-color-sidebar-text)]',
                            )}
                          >
                            <Icon
                              className={cn(
                                'h-4 w-4 shrink-0',
                                active
                                  ? 'text-[var(--component-sidebar-active-icon)]'
                                  : 'text-[var(--ds-color-sidebar-muted)]',
                              )}
                            />
                            <span className="flex-1 truncate">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </nav>
        </div>

        {/* Footer */}
        <div className="border-t border-[color:var(--ds-color-sidebar-border)] px-4 py-3.5">
          <div className="mb-2.5 px-1">
            <p className="truncate text-[13px] font-semibold text-[var(--ds-color-sidebar-text)]">{user?.nome}</p>
            <p className="truncate text-xs text-[var(--ds-color-sidebar-muted)]">{user?.profile?.nome}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-xl border border-transparent px-3.5 py-2.5 text-[13px] font-medium text-[var(--ds-color-sidebar-muted)] transition-all hover:border-[color:var(--ds-color-danger-border)] hover:bg-[var(--component-sidebar-danger-hover-bg)] hover:text-[color:var(--ds-color-sidebar-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-color-sidebar-bg)]"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}

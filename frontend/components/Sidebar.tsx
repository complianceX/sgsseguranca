'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Archive,
  AlertCircle,
  AlertOctagon,
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
  GraduationCap,
  HardHat,
  LayoutDashboard,
  LineChart,
  LogOut,
  Map,
  MapPin,
  MessageSquare,
  Paintbrush,
  Radio,
  Settings,
  Shield,
  ShieldCheck,
  Stethoscope,
  Upload,
  Users,
  Wrench,
  Activity,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { User } from '@/services/usersService';

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

type SidebarContext =
  | 'admin-geral'
  | 'admin-empresa'
  | 'tst'
  | 'supervisor'
  | 'operacional';

const menuSections: MenuSection[] = [
  {
    id: 'essenciais',
    label: 'Acesso rápido',
    defaultOpen: true,
    items: [],
  },
  {
    id: 'principal',
    label: 'Leitura e gestão',
    items: [
      { icon: Activity, label: 'Indicadores', href: '/dashboard/kpis' },
      { icon: LineChart, label: 'Executivo', href: '/dashboard/executive' },
    ],
  },
  {
    id: 'operacao',
    label: 'Campo e operação',
    defaultOpen: true,
    items: [
      { icon: CalendarDays, label: 'Calendário', href: '/dashboard/calendar', adminOnly: true },
      { icon: MapPin, label: 'Mapa de Risco', href: '/dashboard/risk-map' },
      { icon: ClipboardCheck, label: 'Inspeções', href: '/dashboard/inspections' },
      { icon: ClipboardX, label: 'Auditorias', href: '/dashboard/audits' },
      { icon: AlertTriangle, label: 'Não conformidades', href: '/dashboard/nonconformities' },
      { icon: AlertCircle, label: 'CATs', href: '/dashboard/cats' },
      { icon: CheckSquare, label: 'Ações corretivas', href: '/dashboard/corrective-actions' },
    ],
  },
  {
    id: 'documentos',
    label: 'Documentos',
    defaultOpen: true,
    items: [
      { icon: Upload, label: 'Importar com IA', href: '/dashboard/documentos/importar' },
      { icon: FileText, label: 'APRs', href: '/dashboard/aprs' },
      { icon: FileLock2, label: 'PTs', href: '/dashboard/pts' },
      { icon: MessageSquare, label: 'DDS', href: '/dashboard/dds' },
      { icon: ClipboardList, label: 'Checklists', href: '/dashboard/checklist-models' },
      { icon: BookOpen, label: 'RDO', href: '/dashboard/rdos' },
      { icon: Wrench, label: 'OS (NR-1)', href: '/dashboard/service-orders' },
      { icon: Archive, label: 'Registry', href: '/dashboard/document-registry' },
    ],
  },
  {
    id: 'estrutura',
    label: 'Estrutura',
    defaultOpen: false,
    items: [
      { icon: Building2, label: 'Empresas', href: '/dashboard/companies', adminOnly: true },
      { icon: Map, label: 'Obras e setores', href: '/dashboard/sites', adminOnly: true },
      { icon: Users, label: 'Funcionários', href: '/dashboard/employees' },
      { icon: Shield, label: 'Usuários e acesso', href: '/dashboard/users', adminOnly: true },
      { icon: GraduationCap, label: 'Treinamentos', href: '/dashboard/trainings' },
      { icon: Stethoscope, label: 'Exames médicos', href: '/dashboard/medical-exams' },
      { icon: HardHat, label: 'Atividades', href: '/dashboard/activities', adminOnly: true },
      { icon: AlertOctagon, label: 'Riscos', href: '/dashboard/risks', adminOnly: true },
      { icon: ShieldCheck, label: 'EPIs', href: '/dashboard/epis', adminOnly: true },
      { icon: HardHat, label: 'Fichas de EPI', href: '/dashboard/epi-fichas', adminOnly: true },
    ],
  },
  {
    id: 'plataforma',
    label: 'Sistema',
    defaultOpen: false,
    items: [
      { icon: Settings, label: 'Configurações', href: '/dashboard/settings' },
      { icon: Paintbrush, label: 'Tema', href: '/dashboard/system/settings/theme', superAdminOnly: true },
    ],
  },
];

const SECTION_IDS = menuSections.map((section) => section.id);

function resolveSidebarContext(user: User | null, roles: string[]): SidebarContext {
  const parts = [user?.profile?.nome, user?.role, user?.funcao, ...roles]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (parts.includes('administrador geral')) return 'admin-geral';
  if (parts.includes('administrador da empresa') || parts.includes('admin_empresa')) return 'admin-empresa';
  if (parts.includes('técnico de segurança') || parts.includes('tecnico de seguranca') || parts.includes('tst')) return 'tst';
  if (parts.includes('supervisor') || parts.includes('encarregado')) return 'supervisor';
  return 'operacional';
}

function buildQuickAccessItems(context: SidebarContext): MenuEntry[] {
  switch (context) {
    case 'admin-geral':
      return [
        { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
        { icon: Building2, label: 'Empresas', href: '/dashboard/companies', adminOnly: true },
        { icon: Users, label: 'Usuários', href: '/dashboard/users', adminOnly: true },
        { icon: BarChart3, label: 'Relatórios GST', href: '/dashboard/reports' },
      ];
    case 'admin-empresa':
      return [
        { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
        { icon: Upload, label: 'Importar com IA', href: '/dashboard/documentos/importar' },
        { icon: GraduationCap, label: 'Treinamentos', href: '/dashboard/trainings' },
        { icon: BarChart3, label: 'Relatórios GST', href: '/dashboard/reports' },
      ];
    case 'tst':
      return [
        { icon: Radio, label: 'Campo', href: '/dashboard/tst' },
        { icon: FileLock2, label: 'PTs', href: '/dashboard/pts' },
        { icon: AlertTriangle, label: 'Não conformidades', href: '/dashboard/nonconformities' },
        { icon: Upload, label: 'Importar com IA', href: '/dashboard/documentos/importar' },
      ];
    case 'supervisor':
      return [
        { icon: FileLock2, label: 'PTs', href: '/dashboard/pts' },
        { icon: ClipboardList, label: 'Checklists', href: '/dashboard/checklist-models' },
        { icon: CheckSquare, label: 'Ações corretivas', href: '/dashboard/corrective-actions' },
        { icon: Radio, label: 'Campo', href: '/dashboard/tst' },
      ];
    default:
      return [
        { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
        { icon: FileText, label: 'APRs', href: '/dashboard/aprs' },
        { icon: MessageSquare, label: 'DDS', href: '/dashboard/dds' },
        { icon: GraduationCap, label: 'Treinamentos', href: '/dashboard/trainings' },
      ];
  }
}

function shouldShowSectionForContext(sectionId: string, context: SidebarContext, pathname: string) {
  if (context === 'admin-geral' || context === 'admin-empresa') {
    return true;
  }

  if (sectionId === 'principal') {
    return pathname.startsWith('/dashboard/kpis') || pathname.startsWith('/dashboard/executive');
  }

  return true;
}

function getDefaultOpenSections(context: SidebarContext): Record<string, boolean> {
  const defaults = Object.fromEntries(SECTION_IDS.map((id) => [id, false])) as Record<string, boolean>;

  defaults.essenciais = true;

  if (context === 'admin-geral') {
    defaults.principal = true;
    defaults.documentos = true;
    return defaults;
  }

  if (context === 'admin-empresa') {
    defaults.operacao = true;
    defaults.documentos = true;
    return defaults;
  }

  if (context === 'tst' || context === 'supervisor') {
    defaults.operacao = true;
    defaults.documentos = true;
    return defaults;
  }

  defaults.documentos = true;
  return defaults;
}

export function Sidebar({
  isOpen = false,
  onClose,
}: {
  isOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const { logout, user, roles, hasPermission } = useAuth();
  const isAdmin = user?.profile?.nome === 'Administrador Geral';
  const sidebarContext = useMemo(() => resolveSidebarContext(user, roles), [roles, user]);
  const defaultOpenSections = useMemo(() => getDefaultOpenSections(sidebarContext), [sidebarContext]);

  const visibleSections = useMemo(() => {
    return menuSections
      .filter((section) => shouldShowSectionForContext(section.id, sidebarContext, pathname))
      .map((section) => ({
        ...section,
        items: (section.id === 'essenciais' ? buildQuickAccessItems(sidebarContext) : section.items).filter((item) => {
          if (item.adminOnly && !isAdmin) return false;
          if (item.superAdminOnly && !isAdmin) return false;

          const href = item.href || '';
          const needsDashboardPermission = [
            '/dashboard/kpis',
            '/dashboard/executive',
            '/dashboard/reports',
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
  }, [hasPermission, isAdmin, pathname, sidebarContext]);

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
        aria-hidden={!isOpen}
        tabIndex={isOpen ? 0 : -1}
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-[color:var(--component-overlay)] backdrop-blur-sm transition-opacity xl:hidden',
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-full w-60 flex-col border-r border-[color:var(--ds-color-sidebar-border)] bg-[var(--ds-color-sidebar-bg)] text-[var(--ds-color-sidebar-text)] transition-transform duration-[var(--ds-motion-base)] xl:static xl:z-auto xl:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="border-b border-[color:var(--ds-color-sidebar-border)] px-5 py-4">
          <div className="flex items-center gap-3">
            <Image src="/logo-gst-mark.svg" alt="Logo GST" width={26} height={26} priority />
            <div className="min-w-0">
              <h1 className="truncate text-[0.95rem] font-semibold tracking-[-0.02em] text-[var(--ds-color-sidebar-text)]">
                GST
              </h1>
              <p className="truncate text-[0.72rem] text-[var(--ds-color-sidebar-muted)]">
                Gestão de Segurança do Trabalho
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
                    className="flex w-full items-center justify-between px-4 pb-1.5 text-left"
                  >
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-[var(--ds-color-sidebar-muted)]/70">
                      {section.label}
                    </span>
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 text-[var(--ds-color-sidebar-muted)]/50 transition-transform',
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
                              'flex items-center gap-2.5 border-l-2 px-4 py-2 text-[13px] font-medium transition-colors',
                              active
                                ? 'border-[color:var(--ds-color-action-primary)] bg-[color:var(--ds-color-action-primary)]/10 text-[color:var(--ds-color-action-primary)]'
                                : 'border-transparent text-[var(--ds-color-sidebar-muted)] hover:bg-[color:var(--ds-color-sidebar-surface)] hover:text-[var(--ds-color-sidebar-text)]',
                            )}
                          >
                            <Icon
                              className={cn(
                                'h-4 w-4 shrink-0',
                                active
                                  ? 'text-[color:var(--ds-color-action-primary)]'
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
            className="flex w-full items-center gap-2.5 border-l-2 border-transparent px-4 py-2 text-[13px] font-medium text-[var(--ds-color-sidebar-muted)] transition-colors hover:border-[color:var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger-subtle)] hover:text-[var(--ds-color-danger)]"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}

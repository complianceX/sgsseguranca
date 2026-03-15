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
  PlusCircle,
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
import { useMemo, useState } from 'react';
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
    id: 'essenciais',
    label: 'Acesso rápido',
    defaultOpen: true,
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
      { icon: Radio, label: 'Campo', href: '/dashboard/tst' },
      { icon: PlusCircle, label: 'Novo documento', href: '/dashboard/documentos/novo' },
      { icon: BarChart3, label: 'Relatórios GST', href: '/dashboard/reports' },
    ],
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
      { icon: PlusCircle, label: 'Novo Documento', href: '/dashboard/documentos/novo' },
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

export function Sidebar({
  isOpen = false,
  onClose,
}: {
  isOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const { logout, user, hasPermission } = useAuth();
  const isAdmin = user?.profile?.nome === 'Administrador Geral';

  const visibleSections = useMemo(() => {
    return menuSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
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
  }, [hasPermission, isAdmin]);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      menuSections.map((section) => [section.id, Boolean(section.defaultOpen)]),
    ),
  );

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
          'fixed inset-y-0 left-0 z-50 flex h-full w-72 flex-col border-r border-[color:var(--ds-color-sidebar-border)] bg-[var(--ds-color-sidebar-bg)] text-[var(--ds-color-sidebar-text)] shadow-[var(--ds-shadow-lg)] transition-transform duration-[var(--ds-motion-base)] xl:static xl:z-auto xl:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="border-b border-[color:var(--ds-color-sidebar-border)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-[color:var(--ds-color-sidebar-border)] bg-[color:var(--ds-color-sidebar-surface)]">
              <Image src="/logo-gst-mark.svg" alt="Logo GST" width={28} height={28} priority />
            </div>
            <div className="min-w-0">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-sidebar-muted)]">
                Sistema SST
              </p>
              <h1 className="truncate text-[0.98rem] font-semibold tracking-[-0.02em] text-[var(--ds-color-sidebar-text)]">&lt;GST&gt;</h1>
              <p className="truncate text-[0.72rem] text-[var(--ds-color-sidebar-muted)]">
                Gestão de Segurança do Trabalho
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <nav className="space-y-2">
            {visibleSections.map((section) => {
              const isSectionActive = section.items.some((item) => pathname === item.href);
              const isOpenSection = openSections[section.id] || isSectionActive;

              return (
                <section key={section.id} className="rounded-xl border border-[color:var(--ds-color-sidebar-border)]/70 bg-[color:var(--ds-color-sidebar-surface)]/58">
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    className="flex w-full items-center justify-between px-3 py-3 text-left"
                  >
                    <span className="text-[0.76rem] font-semibold text-[var(--ds-color-sidebar-muted)]">
                      {section.label}
                    </span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 text-[var(--ds-color-sidebar-muted)] transition-transform',
                        isOpenSection ? 'rotate-180' : '',
                      )}
                    />
                  </button>

                  {isOpenSection ? (
                    <div className="space-y-1 px-2 pb-2">
                      {section.items.map((item) => {
                        const Icon = item.icon!;
                        const active = pathname === item.href;

                        return (
                          <Link
                            key={item.href}
                            href={item.href!}
                            onClick={onClose}
                            className={cn(
                              'group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-[13px] font-medium transition-colors',
                              active
                                ? 'border-[color:var(--ds-color-action-primary)]/30 bg-[color:var(--ds-color-primary-subtle)] text-[color:var(--ds-color-action-primary)]'
                                : 'border-transparent text-[var(--ds-color-sidebar-muted)] hover:border-[color:var(--ds-color-sidebar-border)] hover:bg-[color:var(--ds-color-sidebar-surface)] hover:text-[var(--ds-color-sidebar-text)]',
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-8 w-8 items-center justify-center rounded-lg border transition-colors',
                                active
                                  ? 'border-[color:var(--ds-color-action-primary)]/20 bg-[color:var(--ds-color-action-primary)]/10 text-[color:var(--ds-color-action-primary)]'
                                  : 'border-[color:var(--ds-color-sidebar-border)] bg-[color:var(--ds-color-sidebar-surface)]/60 text-[var(--ds-color-sidebar-muted)] group-hover:text-[var(--ds-color-sidebar-text)]',
                              )}
                            >
                              <Icon className="h-4.5 w-4.5" />
                            </span>
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

        <div className="border-t border-[color:var(--ds-color-sidebar-border)] p-3.5">
          <div className="mb-3 rounded-xl border border-[color:var(--ds-color-sidebar-border)] bg-[color:var(--ds-color-sidebar-surface)]/70 px-3.5 py-3">
            <p className="truncate text-[13px] font-semibold text-[var(--ds-color-sidebar-text)]">{user?.nome}</p>
            <p className="truncate text-xs text-[var(--ds-color-sidebar-muted)]">{user?.profile?.nome}</p>
            <p className="mt-2 text-[11px] font-medium text-[var(--ds-color-sidebar-muted)]">Ambiente multiempresa protegido</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-[13px] font-medium text-[var(--ds-color-sidebar-muted)] transition-colors hover:border-[color:var(--ds-color-danger-border)] hover:bg-[color:var(--ds-color-danger-subtle)] hover:text-[var(--ds-color-danger)]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--ds-color-sidebar-border)] bg-[color:var(--ds-color-sidebar-surface)]/70">
              <LogOut className="h-4.5 w-4.5" />
            </span>
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}

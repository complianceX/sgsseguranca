'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  Building2,
  HardHat,
  AlertTriangle,
  Shield,
  FileText,
  ClipboardCheck,
  LogOut,
  Map,
  MapPin,
  GraduationCap,
  BarChart3,
  LineChart,
  Activity,
  Settings,
  Upload,
  AlertCircle,
  AlertOctagon,
  CheckSquare,
  BookOpen,
  Stethoscope,
  ClipboardList,
  ClipboardX,
  Radio,
  Archive,
  CalendarDays,
  ShieldCheck,
  FileLock2,
  MessageSquare,
  Wrench,
  Paintbrush,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Radio, label: 'TST em Campo', href: '/dashboard/tst' },
  { icon: Building2, label: 'Empresas', href: '/dashboard/companies', adminOnly: true },
  { icon: Map, label: 'Obras/Setores', href: '/dashboard/sites', adminOnly: true },
  { icon: Users, label: 'Funcionários', href: '/dashboard/employees' },
  { icon: Shield, label: 'Usuários/Acesso', href: '/dashboard/users', adminOnly: true },
  { icon: GraduationCap, label: 'Treinamentos', href: '/dashboard/trainings' },
  { icon: BarChart3, label: 'Relatórios GST', href: '/dashboard/reports' },
  { type: 'divider', label: 'Gestão & Controle', adminOnly: true },
  { icon: CalendarDays, label: 'Calendário SST', href: '/dashboard/calendar', adminOnly: true },
  { icon: Activity, label: 'KPIs SST', href: '/dashboard/kpis' },
  { icon: LineChart, label: 'Cockpit Executivo', href: '/dashboard/executive' },
  { icon: MapPin, label: 'Mapa de Risco', href: '/dashboard/risk-map' },
  { icon: ClipboardCheck, label: 'Inspeções de SST', href: '/dashboard/inspections' },
  { icon: ClipboardX, label: 'Auditoria HSE', href: '/dashboard/audits' },
  { icon: AlertTriangle, label: 'Não Conformidades', href: '/dashboard/nonconformities' },
  { icon: AlertCircle, label: 'CATs (Acidentes)', href: '/dashboard/cats' },
  { icon: CheckSquare, label: 'Ações Corretivas', href: '/dashboard/corrective-actions' },
  { type: 'divider', label: 'Módulos Técnicos', adminOnly: true },
  { icon: Stethoscope, label: 'Exames (PCMSO)', href: '/dashboard/medical-exams' },
  { icon: HardHat, label: 'Atividades', href: '/dashboard/activities', adminOnly: true },
  { icon: AlertOctagon, label: 'Riscos', href: '/dashboard/risks', adminOnly: true },
  { icon: ShieldCheck, label: 'EPIs', href: '/dashboard/epis', adminOnly: true },
  { icon: HardHat, label: 'Fichas de EPI', href: '/dashboard/epi-fichas', adminOnly: true },
  { type: 'divider', label: 'Documentos Operacionais' },
  { icon: Upload, label: 'Importar Docs (IA)', href: '/dashboard/documentos/importar' },
  { icon: FileText, label: 'APRs', href: '/dashboard/aprs' },
  { icon: FileLock2, label: 'PTs', href: '/dashboard/pts' },
  { icon: MessageSquare, label: 'DDS', href: '/dashboard/dds' },
  { icon: ClipboardList, label: 'Checklists', href: '/dashboard/checklist-models' },
  { icon: BookOpen, label: 'RDO', href: '/dashboard/rdos' },
  { icon: Wrench, label: 'OS (NR-1)', href: '/dashboard/service-orders' },
  { icon: Archive, label: 'Registry documental', href: '/dashboard/document-registry' },
  { type: 'divider', label: 'Conta & Sistema' },
  { icon: Settings, label: 'Configurações', href: '/dashboard/settings' },
  { icon: Paintbrush, label: 'Tema do Sistema', href: '/dashboard/system/settings/theme', superAdminOnly: true },
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

  return (
    <>
      <button
        type="button"
        aria-hidden={!isOpen}
        tabIndex={isOpen ? 0 : -1}
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-[#020817]/70 backdrop-blur-sm transition-opacity xl:hidden',
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-full w-72 flex-col border-r border-[color:var(--ds-color-sidebar-border)] bg-[linear-gradient(180deg,var(--ds-color-sidebar-bg)_0%,var(--ds-color-sidebar-bg-soft)_42%,var(--ds-color-sidebar-surface)_100%)] text-[var(--ds-color-sidebar-text)] shadow-[var(--ds-shadow-lg)] transition-transform duration-[var(--ds-motion-base)] xl:static xl:z-auto xl:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
      <div className="border-b border-[color:var(--ds-color-sidebar-border)]/80 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-[color:var(--ds-color-sidebar-border)] bg-[color:var(--ds-color-sidebar-surface)]/90 shadow-[0_8px_24px_rgba(15,23,42,0.22)]">
            <Image src="/logo-gst-mark.svg" alt="Logo GST" width={28} height={28} priority />
          </div>
          <div className="min-w-0">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[var(--ds-color-text-disabled)]">
              Sistema SST
            </p>
            <h1 className="truncate text-[0.96rem] font-bold tracking-[-0.02em] text-[var(--ds-color-sidebar-text)]">&lt;GST&gt;</h1>
            <p className="truncate text-[0.64rem] font-semibold uppercase tracking-[0.15em] text-[var(--ds-color-sidebar-muted)]">
              Gestão de Segurança do Trabalho
            </p>
          </div>
        </div>
        <div className="mt-3 h-px bg-[color:var(--ds-color-sidebar-border)]/60" />
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 py-4">
        <nav className="space-y-1">
          {menuItems.map((item, index) => {
            if (item.adminOnly && !isAdmin) {
              return null;
            }
            if (item.superAdminOnly && !isAdmin) {
              return null;
            }

            const needsDashboardPermission = [
              '/dashboard/kpis',
              '/dashboard/executive',
              '/dashboard/reports',
            ].includes(item.href || '');
            if (needsDashboardPermission && !hasPermission('can_view_dashboard')) {
              return null;
            }

            if (item.href === '/dashboard/risks' && !hasPermission('can_view_risks')) {
              return null;
            }

            if (item.href === '/dashboard/document-registry' && !hasPermission('can_view_documents_registry')) {
              return null;
            }

            if (item.type === 'divider') {
              return (
                <div key={index} className="pb-1.5 pt-4">
                  <p className="px-3 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[var(--ds-color-sidebar-muted)]/90">
                    {item.label}
                  </p>
                </div>
              );
            }

            const Icon = item.icon!;
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href!}
                onClick={onClose}
                className={cn(
                  'group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-[13px] font-medium transition-all duration-[var(--ds-motion-base)]',
                  active
                    ? 'border-[color:var(--ds-color-action-primary)]/30 bg-[color:var(--ds-color-primary-subtle)] text-[color:var(--ds-color-action-primary)] shadow-[0_2px_10px_rgba(20,83,45,0.22)]'
                    : 'border-transparent text-[var(--ds-color-sidebar-muted)] hover:border-[color:var(--ds-color-sidebar-border)]/88 hover:bg-[color:var(--ds-color-sidebar-surface)]/76 hover:text-[var(--ds-color-sidebar-text)]'
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg border transition-colors duration-[var(--ds-motion-base)]',
                    active
                    ? 'border-[color:var(--ds-color-action-primary)]/20 bg-[color:var(--ds-color-action-primary)]/10 text-[color:var(--ds-color-action-primary)]'
                      : 'border-[color:var(--ds-color-sidebar-border)] bg-[color:var(--ds-color-sidebar-surface)]/70 text-[var(--ds-color-sidebar-muted)] group-hover:border-[color:var(--ds-color-sidebar-border)] group-hover:text-[var(--ds-color-sidebar-text)]'
                  )}
                >
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                {active ? <span className="h-2 w-2 rounded-full bg-[color:var(--ds-color-action-primary)] shadow-[0_0_0_4px_rgba(20,83,45,0.2)]" /> : null}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-[color:var(--ds-color-sidebar-border)]/80 p-3.5">
        <div className="mb-3 rounded-xl border border-[color:var(--ds-color-sidebar-border)]/80 bg-[color:var(--ds-color-sidebar-surface)]/65 px-3.5 py-2.5">
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-[13px] font-semibold text-[var(--ds-color-sidebar-text)]">{user?.nome}</p>
            <p className="truncate text-xs text-[var(--ds-color-sidebar-muted)]">{user?.profile?.nome}</p>
            <div className="mt-2.5 inline-flex items-center rounded-full border border-[color:var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-success)]">
              tenant seguro
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-[13px] font-medium text-[var(--ds-color-sidebar-muted)] transition-all duration-[var(--ds-motion-base)] hover:border-[color:var(--ds-color-danger-border)] hover:bg-[color:var(--ds-color-danger-subtle)] hover:text-[var(--ds-color-danger)]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--ds-color-sidebar-border)] bg-[color:var(--ds-color-sidebar-surface)]/70">
            <LogOut className="h-4.5 w-4.5" />
          </span>
          Sair
        </button>
      </div>
      </div>
    </>
  );
}

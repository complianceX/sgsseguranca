'use client';

import Link from 'next/link';
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
  { icon: BarChart3, label: 'Relatórios COMPLIANCE X', href: '/dashboard/reports' },
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
          'fixed inset-y-0 left-0 z-50 flex h-full w-72 flex-col border-r border-[color:var(--ds-color-border-subtle)] bg-[linear-gradient(180deg,#081326_0%,#0d1f39_46%,#12284a_100%)] text-[var(--ds-color-text-primary)] shadow-[var(--ds-shadow-lg)] transition-transform duration-[var(--ds-motion-base)] xl:static xl:z-auto xl:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
      <div className="border-b border-[color:var(--ds-color-border-subtle)]/80 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--ds-color-action-primary)] text-sm font-black text-white shadow-[0_8px_24px_rgba(59,127,232,0.32)]">
            CX
          </div>
          <div className="min-w-0">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[var(--ds-color-text-disabled)]">
              Gestão SST
            </p>
            <h1 className="truncate text-lg font-bold tracking-[-0.03em] text-white">Compliance X</h1>
          </div>
        </div>
        <div className="mt-3 h-px bg-[color:var(--ds-color-border-subtle)]/60" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        <nav className="space-y-1.5">
          {menuItems.map((item, index) => {
            if (item.adminOnly && !isAdmin) {
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
                <div key={index} className="pb-2 pt-5">
                  <p className="px-3 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[var(--ds-color-text-muted)]/90">
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
                  'group flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-sm font-medium transition-all duration-[var(--ds-motion-base)]',
                  active
                    ? 'border-[color:var(--ds-color-action-primary)]/50 bg-[linear-gradient(90deg,var(--ds-color-action-primary),var(--ds-color-action-primary-hover))] text-white shadow-[0_8px_20px_rgba(59,127,232,0.28)]'
                    : 'border-transparent text-[var(--ds-color-text-muted)] hover:border-[color:var(--ds-color-border-strong)]/70 hover:bg-[color:var(--ds-color-surface-elevated)]/72 hover:text-white'
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl border transition-colors duration-[var(--ds-motion-base)]',
                    active
                      ? 'border-white/20 bg-white/12 text-white'
                      : 'border-[color:var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-base)]/70 text-[var(--ds-color-text-secondary)] group-hover:border-[color:var(--ds-color-border-strong)] group-hover:text-white'
                  )}
                >
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                {active ? <span className="h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_0_6px_rgba(255,255,255,0.12)]" /> : null}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-[color:var(--ds-color-border-subtle)]/80 p-4">
        <div className="mb-4 rounded-2xl border border-[color:var(--ds-color-border-subtle)]/80 bg-[color:var(--ds-color-surface-elevated)]/65 px-4 py-3">
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-semibold text-[var(--ds-color-text-primary)]">{user?.nome}</p>
            <p className="truncate text-xs text-[var(--ds-color-text-muted)]">{user?.profile?.nome}</p>
            <div className="mt-3 inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-500/12 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-emerald-300">
              tenant seguro
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-2xl border border-transparent px-3.5 py-3 text-sm font-medium text-[var(--ds-color-text-muted)] transition-all duration-[var(--ds-motion-base)] hover:border-[color:var(--ds-color-border-strong)]/60 hover:bg-[color:var(--ds-color-surface-elevated)]/78 hover:text-white"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-base)]/70">
            <LogOut className="h-4.5 w-4.5" />
          </span>
          Sair
        </button>
      </div>
      </div>
    </>
  );
}

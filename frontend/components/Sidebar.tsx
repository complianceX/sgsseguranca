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
  GraduationCap,
  BarChart3,
  BarChart2,
  Settings,
  Upload,
  AlertCircle,
  CheckSquare,
  BookOpen,
  Stethoscope,
  ClipboardList,
  Radio,
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
  { icon: BarChart2, label: 'KPIs SST', href: '/dashboard/kpis' },
  { icon: BarChart2, label: 'Cockpit Executivo', href: '/dashboard/executive' },
  { icon: Map, label: 'Mapa de Risco', href: '/dashboard/risk-map' },
  { icon: ClipboardCheck, label: 'Inspeções de SST', href: '/dashboard/inspections' },
  { icon: ClipboardCheck, label: 'Auditoria HSE', href: '/dashboard/audits' },
  { icon: AlertTriangle, label: 'Não Conformidades', href: '/dashboard/nonconformities' },
  { icon: AlertCircle, label: 'CATs (Acidentes)', href: '/dashboard/cats' },
  { icon: CheckSquare, label: 'Ações Corretivas', href: '/dashboard/corrective-actions' },
  { type: 'divider', label: 'Módulos Técnicos', adminOnly: true },
  { icon: Stethoscope, label: 'Exames (PCMSO)', href: '/dashboard/medical-exams' },
  { icon: HardHat, label: 'Atividades', href: '/dashboard/activities', adminOnly: true },
  { icon: AlertTriangle, label: 'Riscos', href: '/dashboard/risks', adminOnly: true },
  { icon: Shield, label: 'EPIs', href: '/dashboard/epis', adminOnly: true },
  { icon: HardHat, label: 'Fichas de EPI', href: '/dashboard/epi-fichas', adminOnly: true },
  // { icon: Wrench, label: 'Ferramentas', href: '/dashboard/tools', adminOnly: true },
  // { icon: Construction, label: 'Máquinas', href: '/dashboard/machines', adminOnly: true },
  { type: 'divider', label: 'Documentos Operacionais' },
  { icon: Upload, label: 'Importar Docs (IA)', href: '/dashboard/documentos/importar' },
  { icon: FileText, label: 'APRs', href: '/dashboard/aprs' },
  { icon: FileText, label: 'PTs', href: '/dashboard/pts' },
  { icon: FileText, label: 'DDS', href: '/dashboard/dds' },
  // { icon: ClipboardCheck, label: 'Checklists', href: '/dashboard/checklists' },
  { icon: ClipboardCheck, label: 'Checklists', href: '/dashboard/checklist-models' },
  { icon: BookOpen, label: 'RDO', href: '/dashboard/rdos' },
  { icon: ClipboardList, label: 'OS (NR-1)', href: '/dashboard/service-orders' },
  { type: 'divider', label: 'Conta & Sistema' },
  { icon: Settings, label: 'Configurações', href: '/dashboard/settings' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { logout, user, hasPermission } = useAuth();
  const isAdmin = user?.profile?.nome === 'Administrador Geral';

  return (
    <div className="flex h-full w-64 flex-col bg-[#0F172A] text-white">
      <div className="flex h-16 items-center gap-2 px-6">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2563EB] text-xs font-bold text-white">G</div>
        <h1 className="text-xl font-bold text-white">COMPLIANCE X</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <nav className="space-y-1">
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

            if (item.type === 'divider') {
              return (
                <div key={index} className="pb-2 pt-4">
                  <p className="px-2 text-xs font-semibold uppercase tracking-wider text-[#475569]">
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
                className={cn(
                  'flex items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-[#2563EB] text-white'
                    : 'text-[#94A3B8] hover:bg-[#1E293B] hover:text-white'
                )}
              >
                <Icon className="mr-3 h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-[#334155] p-4">
        <div className="mb-4 flex items-center px-2">
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium text-[#F1F5F9]">{user?.nome}</p>
            <p className="truncate text-xs text-[#94A3B8]">{user?.profile?.nome}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center rounded-xl px-3 py-2 text-sm font-medium text-[#94A3B8] transition-colors hover:bg-[#1E293B] hover:text-white"
        >
          <LogOut className="mr-3 h-5 w-5" />
          Sair
        </button>
      </div>
    </div>
  );
}

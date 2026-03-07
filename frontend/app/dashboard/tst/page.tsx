'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ClipboardCheck, FileText, Search, ShieldAlert, UserRoundSearch } from 'lucide-react';
import { dashboardService, TstDayDashboard } from '@/services/dashboardService';
import { usersService, WorkerOperationalStatus } from '@/services/usersService';
import { getOfflineQueueCount } from '@/lib/offline-sync';

export default function TstFieldPage() {
  const [dashboard, setDashboard] = useState<TstDayDashboard | null>(null);
  const [workerStatus, setWorkerStatus] = useState<WorkerOperationalStatus | null>(null);
  const [cpf, setCpf] = useState('');
  const [loading, setLoading] = useState(true);
  const [workerLoading, setWorkerLoading] = useState(false);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [offlineCount, setOfflineCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await dashboardService.getTstDay();
        setDashboard(data);
      } finally {
        setLoading(false);
      }
    };

    void load();
    setOfflineCount(getOfflineQueueCount());

    const onQueueUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: number }>).detail;
      setOfflineCount(detail?.count ?? getOfflineQueueCount());
    };

    window.addEventListener('app:offline-queue-updated', onQueueUpdate as EventListener);
    return () => {
      window.removeEventListener('app:offline-queue-updated', onQueueUpdate as EventListener);
    };
  }, []);

  const summaryCards = useMemo(
    () => [
      {
        label: 'PTs para liberar',
        value: dashboard?.summary.pendingPtApprovals ?? 0,
        icon: FileText,
        href: '/dashboard/pts',
      },
      {
        label: 'NCs críticas',
        value: dashboard?.summary.criticalNonConformities ?? 0,
        icon: ShieldAlert,
        href: '/dashboard/nonconformities',
      },
      {
        label: 'Inspeções atrasadas',
        value: dashboard?.summary.overdueInspections ?? 0,
        icon: ClipboardCheck,
        href: '/dashboard/inspections',
      },
      {
        label: 'Docs vencendo',
        value: dashboard?.summary.expiringDocuments ?? 0,
        icon: AlertTriangle,
        href: '/dashboard/medical-exams',
      },
    ],
    [dashboard],
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">TST em campo</h1>
          <p className="text-sm text-gray-500">
            Pendências do dia, bloqueios de liberação e consulta operacional por CPF.
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Fila offline pendente: <span className="font-semibold">{offlineCount}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-500">{card.label}</span>
              <card.icon className="h-5 w-5 text-blue-600" />
            </div>
            <div className="mt-4 text-3xl font-bold text-gray-900">
              {loading ? '...' : card.value}
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm xl:col-span-1">
          <div className="mb-4 flex items-center gap-2">
            <UserRoundSearch className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">Consulta do trabalhador</h2>
          </div>
          <form className="space-y-4" onSubmit={handleSearch}>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">CPF</label>
              <input
                value={cpf}
                onChange={(event) => setCpf(event.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none ring-0 transition focus:border-blue-500"
                placeholder="Digite o CPF"
              />
            </div>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-medium text-white"
              disabled={workerLoading || cpf.trim().length < 11}
            >
              <Search className="h-4 w-4" />
              {workerLoading ? 'Consultando...' : 'Consultar status operacional'}
            </button>
          </form>

          {workerError ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {workerError}
            </div>
          ) : null}

          {workerStatus ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{workerStatus.user.nome}</p>
                    <p className="text-xs text-gray-500">{workerStatus.user.funcao || 'Função não informada'}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      workerStatus.blocked
                        ? 'bg-red-100 text-red-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {workerStatus.operationalStatus}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 p-4">
                <p className="text-sm font-semibold text-gray-900">ASO</p>
                <p className="mt-1 text-sm text-gray-600">
                  Status: <span className="font-medium">{workerStatus.medicalExam.status}</span>
                </p>
              </div>

              <div className="rounded-xl border border-gray-100 p-4">
                <p className="text-sm font-semibold text-gray-900">Treinamentos bloqueantes</p>
                <p className="mt-1 text-sm text-gray-600">
                  {workerStatus.trainings.expiredBlocking.length > 0
                    ? workerStatus.trainings.expiredBlocking.map((item) => item.nome).join(', ')
                    : 'Nenhum treinamento vencido bloqueando operação.'}
                </p>
              </div>

              <div className="rounded-xl border border-gray-100 p-4">
                <p className="text-sm font-semibold text-gray-900">EPIs ativos</p>
                <p className="mt-1 text-sm text-gray-600">
                  {workerStatus.epis.totalActive} entrega(s) ativa(s)
                </p>
              </div>

              {workerStatus.reasons.length > 0 ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-semibold text-red-800">Motivos de bloqueio</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-700">
                    {workerStatus.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-6 xl:col-span-2">
          <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">PTs pendentes de liberação</h2>
              <Link href="/dashboard/pts" className="text-sm font-semibold text-blue-600">
                Ver PTs
              </Link>
            </div>
            <div className="space-y-3">
              {(dashboard?.pendingPtApprovals || []).map((pt) => (
                <div key={pt.id} className="rounded-xl border border-gray-100 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{pt.numero} - {pt.titulo}</p>
                      <p className="text-xs text-gray-500">
                        {pt.site || 'Sem obra'} · {pt.responsavel || 'Sem responsável'}
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                      {pt.residual_risk || 'Sem risco'}
                    </span>
                  </div>
                </div>
              ))}
              {dashboard && dashboard.pendingPtApprovals.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhuma PT pendente.</p>
              ) : null}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">NCs críticas</h2>
                <Link href="/dashboard/nonconformities" className="text-sm font-semibold text-blue-600">
                  Ver NCs
                </Link>
              </div>
              <div className="space-y-3">
                {(dashboard?.criticalNonConformities || []).map((item) => (
                  <div key={item.id} className="rounded-xl border border-gray-100 p-4">
                    <p className="text-sm font-semibold text-gray-900">{item.codigo_nc}</p>
                    <p className="text-xs text-gray-500">{item.local_setor_area} · {item.site || 'Sem obra'}</p>
                    <p className="mt-2 text-xs font-medium text-red-700">{item.risco_nivel}</p>
                  </div>
                ))}
                {dashboard && dashboard.criticalNonConformities.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhuma NC crítica aberta.</p>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Documentos vencendo</h2>
                <Link href="/dashboard/trainings" className="text-sm font-semibold text-blue-600">
                  Ver documentos
                </Link>
              </div>
              <div className="space-y-3">
                {(dashboard?.expiringDocuments.medicalExams || []).map((item) => (
                  <div key={item.id} className="rounded-xl border border-gray-100 p-4">
                    <p className="text-sm font-semibold text-gray-900">{item.workerName || 'Colaborador'}</p>
                    <p className="text-xs text-gray-500">
                      ASO {item.tipo_exame} · {item.data_vencimento ? new Date(item.data_vencimento).toLocaleDateString('pt-BR') : 'sem vencimento'}
                    </p>
                  </div>
                ))}
                {(dashboard?.expiringDocuments.trainings || []).map((item) => (
                  <div key={item.id} className="rounded-xl border border-gray-100 p-4">
                    <p className="text-sm font-semibold text-gray-900">{item.workerName || 'Colaborador'}</p>
                    <p className="text-xs text-gray-500">
                      {item.nome} · {new Date(item.data_vencimento).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                ))}
                {dashboard &&
                dashboard.expiringDocuments.medicalExams.length === 0 &&
                dashboard.expiringDocuments.trainings.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhum documento vencendo nos próximos 7 dias.</p>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Inspeções atrasadas</h2>
                <Link href="/dashboard/inspections" className="text-sm font-semibold text-blue-600">
                  Ver inspeções
                </Link>
              </div>
              <div className="space-y-3">
                {(dashboard?.overdueInspections || []).map((item) => (
                  <div key={item.id} className="rounded-xl border border-gray-100 p-4">
                    <p className="text-sm font-semibold text-gray-900">{item.setor_area}</p>
                    <p className="text-xs text-gray-500">
                      {item.site || 'Sem obra'} · {new Date(item.data_inspecao).toLocaleDateString('pt-BR')}
                    </p>
                    <p className="mt-2 text-xs text-gray-600">
                      {item.responsavel || 'Responsável não informado'}
                    </p>
                  </div>
                ))}
                {dashboard && dashboard.overdueInspections.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhuma inspeção com plano em atraso.</p>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

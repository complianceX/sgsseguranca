'use client';

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { toast } from 'sonner';
import { PaginationControls } from '@/components/PaginationControls';
import { SignatureModal } from '@/components/SignatureModal';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { episService, Epi } from '@/services/episService';
import {
  epiAssignmentsService,
  EpiAssignment,
} from '@/services/epiAssignmentsService';
import { usersService, User } from '@/services/usersService';
import { Plus } from 'lucide-react';

type SignatureTarget =
  | { mode: 'create' }
  | { mode: 'return'; assignmentId: string };

export default function EpiFichasPage() {
  const [assignments, setAssignments] = useState<EpiAssignment[]>([]);
  const [epis, setEpis] = useState<Epi[]>([]);
  const [selectedEpi, setSelectedEpi] = useState<Epi | null>(null);
  const [userOptions, setUserOptions] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [epiSearch, setEpiSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const deferredEpiSearch = useDeferredValue(epiSearch);
  const deferredUserSearch = useDeferredValue(userSearch);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [summary, setSummary] = useState({
    total: 0,
    entregue: 0,
    devolvido: 0,
    substituido: 0,
    caExpirado: 0,
  });
  const [form, setForm] = useState({
    epi_id: '',
    user_id: '',
    quantidade: 1,
    observacoes: '',
  });
  const [deliverySignature, setDeliverySignature] = useState('');
  const [deliverySignatureType, setDeliverySignatureType] = useState<
    'digital' | 'upload' | 'facial'
  >('digital');
  const [signatureTarget, setSignatureTarget] = useState<SignatureTarget | null>(
    null,
  );

  const availableUsers = useMemo(() => {
    if (!selectedUser) {
      return userOptions;
    }

    return [selectedUser, ...userOptions.filter((item) => item.id !== selectedUser.id)];
  }, [selectedUser, userOptions]);
  const availableEpis = useMemo(() => {
    if (!selectedEpi) {
      return epis;
    }

    return [selectedEpi, ...epis.filter((item) => item.id !== selectedEpi.id)];
  }, [epis, selectedEpi]);
  const usersMap = useMemo(
    () => new Map(availableUsers.map((item) => [item.id, item.nome])),
    [availableUsers],
  );
  const episMap = useMemo(
    () => new Map(availableEpis.map((item) => [item.id, item.nome])),
    [availableEpis],
  );

  const loadAssignments = useCallback(async () => {
    try {
      setLoading(true);
      const [assignmentsPage, summaryData] = await Promise.all([
        epiAssignmentsService.findPaginated({ page, limit: 20 }),
        epiAssignmentsService.getSummary(),
      ]);
      setAssignments(assignmentsPage.data);
      setTotal(assignmentsPage.total);
      setLastPage(assignmentsPage.lastPage);
      setSummary(summaryData);
    } catch (error) {
      console.error('Erro ao carregar fichas EPI:', error);
      toast.error('Erro ao carregar fichas de EPI.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    const loadEpis = async () => {
      try {
        const episPage = await episService.findPaginated({
          page: 1,
          limit: 25,
          search: deferredEpiSearch || undefined,
        });
        let nextEpis = episPage.data;
        if (form.epi_id && !nextEpis.some((item) => item.id === form.epi_id)) {
          try {
            const currentEpi = await episService.findOne(form.epi_id);
            nextEpis = dedupeById([currentEpi, ...nextEpis]);
          } catch {
            nextEpis = dedupeById(nextEpis);
          }
        } else {
          nextEpis = dedupeById(nextEpis);
        }
        setEpis(nextEpis);
      } catch (error) {
        console.error('Erro ao carregar EPIs:', error);
        toast.error('Erro ao carregar catálogo de EPIs.');
      }
    };

    void loadEpis();
  }, [deferredEpiSearch, form.epi_id]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const usersPage = await usersService.findPaginated({
          page: 1,
          limit: 20,
          search: deferredUserSearch || undefined,
        });
        setUserOptions(usersPage.data);
      } catch (error) {
        console.error('Erro ao carregar colaboradores da ficha EPI:', error);
        toast.error('Erro ao carregar colaboradores.');
      }
    };

    void loadUsers();
  }, [deferredUserSearch]);

  const handleCreate = async () => {
    if (!form.epi_id || !form.user_id) {
      toast.error('Selecione EPI e colaborador.');
      return;
    }
    if (!deliverySignature) {
      toast.error('Assinatura de entrega obrigatoria.');
      return;
    }
    try {
      setCreating(true);
      await epiAssignmentsService.create({
        epi_id: form.epi_id,
        user_id: form.user_id,
        quantidade: Number(form.quantidade) || 1,
        observacoes: form.observacoes || undefined,
        assinatura_entrega: {
          signature_data: deliverySignature,
          signature_type: deliverySignatureType,
          signer_name: usersMap.get(form.user_id),
        },
      });
      toast.success('Ficha de EPI registrada.');
      setForm({ epi_id: '', user_id: '', quantidade: 1, observacoes: '' });
      setDeliverySignature('');
      setDeliverySignatureType('digital');
      setSelectedEpi(null);
      setSelectedUser(null);
      setEpiSearch('');
      setUserSearch('');
      if (page !== 1) {
        setPage(1);
        return;
      }
      await loadAssignments();
    } catch (error) {
      console.error('Erro ao criar ficha EPI:', error);
      toast.error('Falha ao registrar ficha de EPI.');
    } finally {
      setCreating(false);
    }
  };

  const handleReturn = async (
    assignment: EpiAssignment,
    signatureData: string,
    signatureType: string,
  ) => {
    const reason = window.prompt('Motivo da devolucao (opcional):', '');
    try {
      await epiAssignmentsService.returnAssignment(assignment.id, {
        assinatura_devolucao: {
          signature_data: signatureData,
          signature_type: signatureType,
          signer_name: assignment.user?.nome || usersMap.get(assignment.user_id),
        },
        motivo_devolucao: reason || undefined,
      });
      toast.success('Devolucao registrada.');
      await loadAssignments();
    } catch (error) {
      console.error('Erro ao devolver EPI:', error);
      toast.error('Falha ao registrar devolucao.');
    }
  };

  const handleReplace = async (assignment: EpiAssignment) => {
    const reason = window.prompt(
      'Motivo da substituicao:',
      assignment.motivo_devolucao || '',
    );
    if (!reason?.trim()) {
      return;
    }
    try {
      await epiAssignmentsService.replaceAssignment(assignment.id, {
        motivo_substituicao: reason.trim(),
      });
      toast.success('Ficha marcada como substituida.');
      await loadAssignments();
    } catch (error) {
      console.error('Erro ao substituir EPI:', error);
      toast.error('Falha ao marcar substituicao.');
    }
  };

  const resolveCaStatus = (validadeCa?: string) => {
    if (!validadeCa) return 'Nao informado';
    const due = new Date(validadeCa);
    if (due < new Date()) return 'CA expirado';
    return 'CA valido';
  };

  return (
    <div className="ds-system-scope space-y-6">
      <div className="ds-surface-card p-4">
        <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">Fichas de EPI</h1>
        <p className="text-[var(--ds-color-text-muted)]">
          Controle de CA, entrega/devolucao e assinatura eletronica com carimbo de
          tempo.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi title="Total" value={summary.total} />
        <Kpi title="Entregues" value={summary.entregue} />
        <Kpi title="Devolvidos" value={summary.devolvido} />
        <Kpi title="Substituidos" value={summary.substituido} />
        <Kpi title="CA expirado" value={summary.caExpirado} />
      </div>

      <div className="ds-surface-card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
          Nova ficha de entrega
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <select
            value={form.epi_id}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedEpi(
                availableEpis.find((item) => item.id === value) || null,
              );
              setForm((prev) => ({ ...prev, epi_id: value }));
            }}
            className="rounded-md border px-3 py-2 text-sm"
          >
            <option value="">EPI</option>
            {availableEpis.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
          <select
            value={form.user_id}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedUser(
                availableUsers.find((item) => item.id === value) || null,
              );
              setForm((prev) => ({ ...prev, user_id: value }));
            }}
            className="rounded-md border px-3 py-2 text-sm"
          >
            <option value="">Colaborador</option>
            {availableUsers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={form.quantidade}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                quantidade: Number(e.target.value) || 1,
              }))
            }
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Quantidade"
          />
          <input
            type="text"
            value={form.observacoes}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, observacoes: e.target.value }))
            }
            className="rounded-md border px-3 py-2 text-sm md:col-span-2"
            placeholder="Observacoes"
          />
          <button
            type="button"
            onClick={() => setSignatureTarget({ mode: 'create' })}
            className="rounded-md border px-3 py-2 text-sm font-medium text-[var(--ds-color-text-secondary)] hover:bg-[var(--ds-color-surface-muted)]"
          >
            {deliverySignature ? 'Assinatura capturada' : 'Assinar entrega'}
          </button>
          <input
            type="text"
            value={epiSearch}
            onChange={(e) => setEpiSearch(e.target.value)}
            className="rounded-md border px-3 py-2 text-sm md:col-span-2"
            placeholder="Buscar EPI"
          />
          <input
            type="text"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            className="rounded-md border px-3 py-2 text-sm md:col-span-2"
            placeholder="Buscar colaborador"
          />
          <button
            type="button"
            disabled={creating}
            onClick={() => void handleCreate()}
            className="flex items-center justify-center rounded-md bg-[var(--ds-color-action-primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--ds-color-action-primary-hover)] disabled:opacity-60"
          >
            <Plus className="mr-2 h-4 w-4" />
            {creating ? 'Salvando...' : 'Registrar'}
          </button>
        </div>
      </div>

      <div className="ds-surface-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>EPI</TableHead>
              <TableHead>CA</TableHead>
              <TableHead>Validade CA</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Entrega</TableHead>
              <TableHead className="text-right">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-[var(--ds-color-text-muted)]">
                  Carregando fichas...
                </TableCell>
              </TableRow>
            ) : assignments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-[var(--ds-color-text-muted)]">
                  Nenhuma ficha registrada.
                </TableCell>
              </TableRow>
            ) : (
              assignments.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell>
                    {assignment.user?.nome || usersMap.get(assignment.user_id) || '-'}
                  </TableCell>
                  <TableCell>
                    {assignment.epi?.nome || episMap.get(assignment.epi_id) || '-'}
                  </TableCell>
                  <TableCell>{assignment.ca || '-'}</TableCell>
                  <TableCell>
                    {assignment.validade_ca
                      ? `${new Date(assignment.validade_ca).toLocaleDateString('pt-BR')} (${resolveCaStatus(assignment.validade_ca)})`
                      : '-'}
                  </TableCell>
                  <TableCell>{assignment.status}</TableCell>
                  <TableCell>
                    {new Date(assignment.entregue_em).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {assignment.status === 'entregue' && (
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs text-[var(--ds-color-success)] hover:bg-[var(--ds-color-success-subtle)]"
                          onClick={() =>
                            setSignatureTarget({
                              mode: 'return',
                              assignmentId: assignment.id,
                            })
                          }
                        >
                          Devolver
                        </button>
                      )}
                      {assignment.status === 'entregue' && (
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs text-[var(--ds-color-text-primary)] hover:bg-[var(--ds-color-primary-subtle)]"
                          onClick={() => void handleReplace(assignment)}
                        >
                          Substituir
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {!loading && assignments.length > 0 ? (
          <PaginationControls
            page={page}
            lastPage={lastPage}
            total={total}
            onPrev={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(lastPage, current + 1))}
          />
        ) : null}
      </div>

      <SignatureModal
        isOpen={Boolean(signatureTarget)}
        onClose={() => setSignatureTarget(null)}
        userName={
          signatureTarget?.mode === 'create'
            ? usersMap.get(form.user_id) || 'Colaborador'
            : signatureTarget?.mode === 'return'
              ? assignments.find((item) => item.id === signatureTarget.assignmentId)
                  ?.user?.nome ||
                usersMap.get(
                  assignments.find((item) => item.id === signatureTarget.assignmentId)
                    ?.user_id || '',
                ) ||
                'Colaborador'
              : 'Colaborador'
        }
        onSave={(signatureData, type) => {
          if (!signatureTarget) {
            return;
          }
          if (signatureTarget.mode === 'create') {
            setDeliverySignature(signatureData);
            const normalizedType =
              type === 'upload' || type === 'facial' ? type : 'digital';
            setDeliverySignatureType(normalizedType);
            toast.success('Assinatura de entrega capturada.');
            return;
          }
          const assignment = assignments.find(
            (item) => item.id === signatureTarget.assignmentId,
          );
          if (!assignment) {
            toast.error('Ficha nao encontrada para devolucao.');
            return;
          }
          void handleReturn(assignment, signatureData, type);
        }}
      />
    </div>
  );
}

function Kpi({ title, value }: { title: string; value: number }) {
  return (
    <div className="ds-surface-card p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
        {title}
      </p>
      <p className="mt-1 text-2xl font-bold text-[var(--ds-color-text-primary)]">{value}</p>
    </div>
  );
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

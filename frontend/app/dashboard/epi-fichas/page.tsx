'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SignatureModal } from '@/components/SignatureModal';
import { episService, Epi } from '@/services/episService';
import {
  epiAssignmentsService,
  EpiAssignment,
} from '@/services/epiAssignmentsService';
import { usersService, User } from '@/services/usersService';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus } from 'lucide-react';

type SignatureTarget =
  | { mode: 'create' }
  | { mode: 'return'; assignmentId: string };

export default function EpiFichasPage() {
  const [assignments, setAssignments] = useState<EpiAssignment[]>([]);
  const [epis, setEpis] = useState<Epi[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
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
  const [deliverySignatureType, setDeliverySignatureType] = useState<'digital' | 'upload' | 'facial'>('digital');
  const [signatureTarget, setSignatureTarget] = useState<SignatureTarget | null>(
    null,
  );

  const usersMap = useMemo(
    () => new Map(users.map((item) => [item.id, item.nome])),
    [users],
  );
  const episMap = useMemo(
    () => new Map(epis.map((item) => [item.id, item.nome])),
    [epis],
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const [assignmentsData, episData, usersData, summaryData] =
        await Promise.all([
          epiAssignmentsService.findAll(),
          episService.findAll(),
          usersService.findAll(),
          epiAssignmentsService.getSummary(),
        ]);
      setAssignments(assignmentsData);
      setEpis(episData);
      setUsers(usersData);
      setSummary(summaryData);
    } catch (error) {
      console.error('Erro ao carregar fichas EPI:', error);
      toast.error('Erro ao carregar fichas de EPI.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

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
      await loadData();
    } catch (error) {
      console.error('Erro ao criar ficha EPI:', error);
      toast.error('Falha ao registrar ficha de EPI.');
    } finally {
      setCreating(false);
    }
  };

  const handleReturn = async (assignment: EpiAssignment, signatureData: string, signatureType: string) => {
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
      await loadData();
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
      await loadData();
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
    <div className="space-y-6">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Fichas de EPI</h1>
        <p className="text-gray-500">
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

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Nova ficha de entrega
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <select
            value={form.epi_id}
            onChange={(e) => setForm((prev) => ({ ...prev, epi_id: e.target.value }))}
            className="rounded-md border px-3 py-2 text-sm"
          >
            <option value="">EPI</option>
            {epis.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
          <select
            value={form.user_id}
            onChange={(e) => setForm((prev) => ({ ...prev, user_id: e.target.value }))}
            className="rounded-md border px-3 py-2 text-sm"
          >
            <option value="">Colaborador</option>
            {users.map((item) => (
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
            className="rounded-md border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {deliverySignature ? 'Assinatura capturada' : 'Assinar entrega'}
          </button>
          <button
            type="button"
            disabled={creating}
            onClick={() => void handleCreate()}
            className="flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Plus className="mr-2 h-4 w-4" />
            {creating ? 'Salvando...' : 'Registrar'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm">
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
                <TableCell colSpan={7} className="py-8 text-center text-gray-500">
                  Carregando fichas...
                </TableCell>
              </TableRow>
            ) : assignments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-gray-500">
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
                          className="rounded border px-2 py-1 text-xs text-green-700 hover:bg-green-50"
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
                          className="rounded border px-2 py-1 text-xs text-amber-700 hover:bg-amber-50"
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
      </div>

      <SignatureModal
        isOpen={Boolean(signatureTarget)}
        onClose={() => setSignatureTarget(null)}
        userName={
          signatureTarget?.mode === 'create'
            ? usersMap.get(form.user_id) || 'Colaborador'
            : signatureTarget?.mode === 'return'
              ? assignments.find((item) => item.id === signatureTarget.assignmentId)?.user?.nome ||
                usersMap.get(assignments.find((item) => item.id === signatureTarget.assignmentId)?.user_id || '') ||
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
    <div className="rounded-lg border bg-white p-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

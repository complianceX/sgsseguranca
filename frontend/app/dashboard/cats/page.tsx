'use client';

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { PaginationControls } from '@/components/PaginationControls';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { catsService, CatRecord } from '@/services/catsService';
import { sitesService, Site } from '@/services/sitesService';
import { usersService, User } from '@/services/usersService';
import { Eye, Plus, Upload } from 'lucide-react';

export default function CatsPage() {
  const [cats, setCats] = useState<CatRecord[]>([]);
  const [workerOptions, setWorkerOptions] = useState<User[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<User | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [workerSearch, setWorkerSearch] = useState('');
  const [siteSearch, setSiteSearch] = useState('');
  const deferredWorkerSearch = useDeferredValue(workerSearch);
  const deferredSiteSearch = useDeferredValue(siteSearch);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [summary, setSummary] = useState({
    total: 0,
    aberta: 0,
    investigacao: 0,
    fechada: 0,
  });
  const [form, setForm] = useState({
    data_ocorrencia: new Date().toISOString().slice(0, 16),
    tipo: 'tipico',
    gravidade: 'moderada',
    descricao: '',
    local_ocorrencia: '',
    worker_id: '',
    site_id: '',
    acao_imediata: '',
  });

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const sitesMap = useMemo(
    () => new Map(sites.map((item) => [item.id, item.nome])),
    [sites],
  );
  const availableWorkers = useMemo(() => {
    if (!selectedWorker) {
      return workerOptions;
    }

    return [
      selectedWorker,
      ...workerOptions.filter((item) => item.id !== selectedWorker.id),
    ];
  }, [selectedWorker, workerOptions]);

  const loadCats = useCallback(async () => {
    try {
      setLoading(true);
      const [catsPage, summaryData] = await Promise.all([
        catsService.findPaginated({ page, limit: 20 }),
        catsService.getSummary(),
      ]);
      setCats(catsPage.data);
      setTotal(catsPage.total);
      setLastPage(catsPage.lastPage);
      setSummary(summaryData);
    } catch (error) {
      console.error('Erro ao carregar CATs:', error);
      toast.error('Erro ao carregar fluxo de CAT.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void loadCats();
  }, [loadCats]);

  useEffect(() => {
    const loadSites = async () => {
      try {
        const sitesPage = await sitesService.findPaginated({
          page: 1,
          limit: 25,
          search: deferredSiteSearch || undefined,
        });
        let nextSites = sitesPage.data;
        if (form.site_id && !nextSites.some((item) => item.id === form.site_id)) {
          try {
            const selectedSite = await sitesService.findOne(form.site_id);
            nextSites = dedupeById([selectedSite, ...nextSites]);
          } catch {
            nextSites = dedupeById(nextSites);
          }
        } else {
          nextSites = dedupeById(nextSites);
        }
        setSites(nextSites);
      } catch (error) {
        console.error('Erro ao carregar obras/setores:', error);
        toast.error('Erro ao carregar obras/setores.');
      }
    };

    void loadSites();
  }, [deferredSiteSearch, form.site_id]);

  useEffect(() => {
    const loadWorkers = async () => {
      try {
        const workersPage = await usersService.findPaginated({
          page: 1,
          limit: 20,
          search: deferredWorkerSearch || undefined,
        });
        setWorkerOptions(workersPage.data);
      } catch (error) {
        console.error('Erro ao carregar colaboradores da CAT:', error);
        toast.error('Erro ao carregar colaboradores.');
      }
    };

    void loadWorkers();
  }, [deferredWorkerSearch]);

  const handleCreate = async () => {
    if (!form.descricao.trim()) {
      toast.error('Descricao da CAT e obrigatoria.');
      return;
    }
    try {
      setCreating(true);
      await catsService.create({
        data_ocorrencia: new Date(form.data_ocorrencia).toISOString(),
        tipo: form.tipo as CatRecord['tipo'],
        gravidade: form.gravidade as CatRecord['gravidade'],
        descricao: form.descricao,
        local_ocorrencia: form.local_ocorrencia || undefined,
        worker_id: form.worker_id || undefined,
        site_id: form.site_id || undefined,
        acao_imediata: form.acao_imediata || undefined,
      });
      toast.success('CAT aberta com sucesso.');
      setForm({
        data_ocorrencia: new Date().toISOString().slice(0, 16),
        tipo: 'tipico',
        gravidade: 'moderada',
        descricao: '',
        local_ocorrencia: '',
        worker_id: '',
        site_id: '',
        acao_imediata: '',
      });
      setSelectedWorker(null);
      setWorkerSearch('');
      if (page !== 1) {
        setPage(1);
        return;
      }
      await loadCats();
    } catch (error) {
      console.error('Erro ao abrir CAT:', error);
      toast.error('Nao foi possivel abrir a CAT.');
    } finally {
      setCreating(false);
    }
  };

  const handleStartInvestigation = async (cat: CatRecord) => {
    const detalhes = window.prompt(
      `Investigation details for CAT ${cat.numero}:`,
      cat.investigacao_detalhes || '',
    );
    if (!detalhes?.trim()) {
      return;
    }
    const causaRaiz = window.prompt('Causa raiz (opcional):', cat.causa_raiz || '');
    try {
      await catsService.startInvestigation(cat.id, {
        investigacao_detalhes: detalhes.trim(),
        causa_raiz: causaRaiz?.trim() || undefined,
      });
      toast.success('CAT movida para investigacao.');
      await loadCats();
    } catch (error) {
      console.error('Erro ao iniciar investigacao:', error);
      toast.error('Falha ao iniciar investigacao da CAT.');
    }
  };

  const handleClose = async (cat: CatRecord) => {
    const plano = window.prompt(
      `Plano de acao para fechamento da CAT ${cat.numero}:`,
      cat.plano_acao_fechamento || '',
    );
    if (!plano?.trim()) {
      return;
    }
    const licoes = window.prompt(
      'Licoes aprendidas (opcional):',
      cat.licoes_aprendidas || '',
    );
    try {
      await catsService.close(cat.id, {
        plano_acao_fechamento: plano.trim(),
        licoes_aprendidas: licoes?.trim() || undefined,
      });
      toast.success('CAT fechada com sucesso.');
      await loadCats();
    } catch (error) {
      console.error('Erro ao fechar CAT:', error);
      toast.error('Falha ao fechar CAT.');
    }
  };

  const handleUploadAttachment = async (catId: string, file?: File) => {
    if (!file) {
      return;
    }
    try {
      await catsService.uploadAttachment(catId, file, 'geral');
      toast.success('Anexo enviado.');
      await loadCats();
    } catch (error) {
      console.error('Erro ao enviar anexo:', error);
      toast.error('Falha ao anexar arquivo na CAT.');
    } finally {
      const input = fileInputRefs.current[catId];
      if (input) {
        input.value = '';
      }
    }
  };

  const handleOpenAttachment = async (catId: string, attachmentId: string) => {
    try {
      const access = await catsService.getAttachmentAccess(catId, attachmentId);
      window.open(access.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Erro ao abrir anexo:', error);
      toast.error('Nao foi possivel abrir o anexo.');
    }
  };

  return (
    <div className="ds-system-scope space-y-6">
      <div className="ds-surface-card p-4">
        <h1 className="text-2xl font-bold text-gray-900">CAT - Acidente de Trabalho</h1>
        <p className="text-gray-500">
          Fluxo completo: abertura, investigacao, fechamento e anexos.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi title="Total" value={summary.total} />
        <Kpi title="Abertas" value={summary.aberta} />
        <Kpi title="Em investigacao" value={summary.investigacao} />
        <Kpi title="Fechadas" value={summary.fechada} />
      </div>

      <div className="ds-surface-card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Abrir CAT
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <input
            type="datetime-local"
            value={form.data_ocorrencia}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, data_ocorrencia: e.target.value }))
            }
            className="rounded-md border px-3 py-2 text-sm"
          />
          <select
            value={form.tipo}
            onChange={(e) => setForm((prev) => ({ ...prev, tipo: e.target.value }))}
            className="rounded-md border px-3 py-2 text-sm"
          >
            <option value="tipico">Tipico</option>
            <option value="trajeto">Trajeto</option>
            <option value="doenca_ocupacional">Doenca ocupacional</option>
            <option value="outros">Outros</option>
          </select>
          <select
            value={form.gravidade}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, gravidade: e.target.value }))
            }
            className="rounded-md border px-3 py-2 text-sm"
          >
            <option value="leve">Leve</option>
            <option value="moderada">Moderada</option>
            <option value="grave">Grave</option>
            <option value="fatal">Fatal</option>
          </select>
          <select
            value={form.worker_id}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedWorker(
                availableWorkers.find((item) => item.id === value) || null,
              );
              setForm((prev) => ({ ...prev, worker_id: value }));
            }}
            className="rounded-md border px-3 py-2 text-sm"
          >
            <option value="">Colaborador</option>
            {availableWorkers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
          <select
            value={form.site_id}
            onChange={(e) => setForm((prev) => ({ ...prev, site_id: e.target.value }))}
            className="rounded-md border px-3 py-2 text-sm"
          >
            <option value="">Obra/Setor</option>
            {sites.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating}
            className="flex items-center justify-center rounded-md bg-[var(--ds-color-action-primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--ds-color-action-primary-hover)] disabled:opacity-60"
          >
            <Plus className="mr-2 h-4 w-4" />
            {creating ? 'Salvando...' : 'Abrir'}
          </button>
          <input
            type="text"
            value={workerSearch}
            onChange={(e) => setWorkerSearch(e.target.value)}
            placeholder="Buscar colaborador"
            className="rounded-md border px-3 py-2 text-sm md:col-span-2"
          />
          <input
            type="text"
            value={siteSearch}
            onChange={(e) => setSiteSearch(e.target.value)}
            placeholder="Buscar obra/setor"
            className="rounded-md border px-3 py-2 text-sm md:col-span-2"
          />
          <input
            type="text"
            value={form.local_ocorrencia}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, local_ocorrencia: e.target.value }))
            }
            placeholder="Local da ocorrencia"
            className="rounded-md border px-3 py-2 text-sm md:col-span-1"
          />
          <input
            type="text"
            value={form.acao_imediata}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, acao_imediata: e.target.value }))
            }
            placeholder="Acao imediata"
            className="rounded-md border px-3 py-2 text-sm md:col-span-1"
          />
          <input
            type="text"
            value={form.descricao}
            onChange={(e) => setForm((prev) => ({ ...prev, descricao: e.target.value }))}
            placeholder="Descricao da ocorrencia"
            className="rounded-md border px-3 py-2 text-sm md:col-span-6"
          />
        </div>
      </div>

      <div className="ds-surface-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Numero</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Colaborador</TableHead>
              <TableHead>Local</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Anexos</TableHead>
              <TableHead className="text-right">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-gray-500">
                  Carregando CATs...
                </TableCell>
              </TableRow>
            ) : cats.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-gray-500">
                  Nenhuma CAT registrada.
                </TableCell>
              </TableRow>
            ) : (
              cats.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">{cat.numero}</TableCell>
                  <TableCell>
                    {new Date(cat.data_ocorrencia).toLocaleString('pt-BR')}
                  </TableCell>
                  <TableCell>{cat.worker?.nome || '-'}</TableCell>
                  <TableCell>
                    {cat.local_ocorrencia ||
                      cat.site?.nome ||
                      sitesMap.get(cat.site_id || '') ||
                      '-'}
                  </TableCell>
                  <TableCell>{cat.status}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      {(cat.attachments || []).slice(0, 2).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => void handleOpenAttachment(cat.id, item.id)}
                          className="rounded border border-blue-200 px-2 py-0.5 text-xs text-[var(--ds-color-text-primary)] hover:bg-blue-50"
                        >
                          <Eye className="mr-1 inline h-3 w-3" />
                          {item.file_name}
                        </button>
                      ))}
                      {cat.attachments && cat.attachments.length > 2 && (
                        <span className="text-xs text-gray-500">
                          +{cat.attachments.length - 2}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <input
                        type="file"
                        aria-label="Selecionar anexo da CAT"
                        ref={(el) => {
                          fileInputRefs.current[cat.id] = el;
                        }}
                        className="hidden"
                        onChange={(event) =>
                          void handleUploadAttachment(cat.id, event.target.files?.[0])
                        }
                      />
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                        onClick={() => fileInputRefs.current[cat.id]?.click()}
                      >
                        <Upload className="mr-1 inline h-3 w-3" />
                        Anexar
                      </button>
                      {cat.status !== 'fechada' && (
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs text-[var(--ds-color-text-primary)] hover:bg-blue-50"
                          onClick={() => void handleStartInvestigation(cat)}
                        >
                          Investigar
                        </button>
                      )}
                      {cat.status !== 'fechada' && (
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs text-green-700 hover:bg-green-50"
                          onClick={() => void handleClose(cat)}
                        >
                          Fechar
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {!loading && cats.length > 0 ? (
          <PaginationControls
            page={page}
            lastPage={lastPage}
            total={total}
            onPrev={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(lastPage, current + 1))}
          />
        ) : null}
      </div>
    </div>
  );
}

function Kpi({ title, value }: { title: string; value: number }) {
  return (
    <div className="ds-surface-card p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

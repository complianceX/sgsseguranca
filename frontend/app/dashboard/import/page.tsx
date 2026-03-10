'use client';

import { useCallback, useDeferredValue, useEffect, useState } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import axios from 'axios';
import api from '@/lib/api';
import { toast } from 'sonner';
import { sitesService, Site } from '@/services/sitesService';
import { usersService, User } from '@/services/usersService';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface ExtractedData {
  type: 'APR' | 'PT' | 'CHECKLIST' | 'DDS' | 'UNKNOWN';
  confidence: number;
  metadata: {
    title?: string;
    date?: string;
    responsibles?: string[];
  };
  fields: Record<string, unknown>;
  rawText: string;
  saved?: { type: string; id: string } | null;
}

export default function ImportPage() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ExtractedData | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [siteId, setSiteId] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [siteSearchTerm, setSiteSearchTerm] = useState('');
  const [responsibleSearchTerm, setResponsibleSearchTerm] = useState('');
  const [title, setTitle] = useState('');
  const [number, setNumber] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [isModel, setIsModel] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const deferredSiteSearchTerm = useDeferredValue(siteSearchTerm);
  const deferredResponsibleSearchTerm = useDeferredValue(responsibleSearchTerm);

  const uploadConfig = {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 45000,
  };

  const shouldRetryUpload = (error: unknown) => {
    if (!axios.isAxiosError(error)) return false;
    const status = error.response?.status;
    return error.code === 'ECONNABORTED' || !status || (status >= 500 && status <= 599);
  };

  const uploadWithRetry = async (formData: FormData) => {
    const maxAttempts = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await api.post<ExtractedData>('/imports/upload', formData, uploadConfig);
      } catch (error) {
        lastError = error;
        if (!shouldRetryUpload(error) || attempt === maxAttempts) {
          throw error;
        }
        const backoffMs = 400 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 150);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw lastError;
  };

  useEffect(() => {
    if (user?.id && !responsibleId) {
      setResponsibleId(user.id);
    }
    if (user?.site_id && !siteId) {
      setSiteId(user.site_id);
    }
  }, [siteId, responsibleId, user?.id, user?.site_id]);

  const loadSites = useCallback(async () => {
    try {
      setSitesLoading(true);
      const response = await sitesService.findPaginated({
        page: 1,
        limit: 25,
        search: deferredSiteSearchTerm.trim() || undefined,
      });

      let nextSites = response.data;
      if (siteId && !nextSites.some((site) => site.id === siteId)) {
        try {
          const selectedSite = await sitesService.findOne(siteId);
          nextSites = dedupeById([selectedSite, ...nextSites]);
        } catch {
          nextSites = dedupeById(nextSites);
        }
      } else {
        nextSites = dedupeById(nextSites);
      }

      setSites(nextSites);
      if (!siteId && !!user && !user.site_id && nextSites.length > 0) {
        setSiteId(nextSites[0].id);
      }
    } catch (error) {
      console.error('Erro ao carregar sites:', error);
      toast.error('Erro ao carregar sites disponíveis.');
    } finally {
      setSitesLoading(false);
    }
  }, [deferredSiteSearchTerm, siteId, user?.site_id]);

  const loadUsers = useCallback(async () => {
    try {
      setUsersLoading(true);
      const response = await usersService.findPaginated({
        page: 1,
        limit: 25,
        search: deferredResponsibleSearchTerm.trim() || undefined,
      });

      let nextUsers = response.data;
      if (responsibleId && !nextUsers.some((entry) => entry.id === responsibleId)) {
        try {
          const selectedUser = await usersService.findOne(responsibleId);
          nextUsers = dedupeById([selectedUser, ...nextUsers]);
        } catch {
          nextUsers = dedupeById(nextUsers);
        }
      } else {
        nextUsers = dedupeById(nextUsers);
      }

      setUsers(nextUsers);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
      toast.error('Erro ao carregar responsáveis disponíveis.');
    } finally {
      setUsersLoading(false);
    }
  }, [deferredResponsibleSearchTerm, responsibleId]);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (!result) return;
    if (result.metadata.date && !date) {
      const normalized = normalizeDateInput(result.metadata.date);
      if (normalized) setDate(normalized);
    }
    if (!title && result.metadata.title) {
      setTitle(result.metadata.title);
    }
  }, [result, date, title]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setResult(null);
      setIsModel(false);
      setShowErrors(false);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setAnalyzing(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('save', 'false');

    try {
      const response = await uploadWithRetry(formData);
      setResult(response.data);
      setShowErrors(false);
      toast.success('Arquivo analisado com sucesso!');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao processar arquivo.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleImport = async () => {
    if (!file || !result) return;
    setShowErrors(true);
    const validation = getImportValidation(result.type);
    if (!validation.isValid) {
      toast.error('Preencha os campos obrigatórios antes de importar.');
      return;
    }

    setSaving(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('site_id', siteId);
    formData.append(getResponsibleField(result.type), responsibleId);
    if (date) {
      if (result.type === 'APR') {
        formData.append('data_inicio', date);
        formData.append('data_fim', date);
      } else {
        formData.append('data', date);
      }
    }
    if (title) {
      formData.append(result.type === 'DDS' ? 'tema' : 'titulo', title);
    }
    if (number && (result.type === 'APR' || result.type === 'PT')) {
      formData.append('numero', number);
    }
    if (isModel && (result.type === 'DDS' || result.type === 'CHECKLIST')) {
      formData.append('is_modelo', 'true');
    }

    try {
      const response = await api.post<ExtractedData>('/imports/upload', formData, uploadConfig);
      setResult(response.data);
      toast.success('Documento importado com sucesso!');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao importar documento.');
    } finally {
      setSaving(false);
    }
  };

  const getResponsibleLabel = (type: ExtractedData['type']) => {
    if (type === 'APR') return 'Elaborador';
    if (type === 'PT') return 'Responsável';
    if (type === 'CHECKLIST') return 'Inspetor';
    if (type === 'DDS') return 'Facilitador';
    return 'Responsável';
  };

  const getTitleLabel = (type: ExtractedData['type']) => {
    if (type === 'DDS') return 'Tema';
    return 'Título';
  };

  const getImportValidation = (type: ExtractedData['type']) => {
    const errors: Record<string, string> = {};
    if (!siteId) errors.siteId = 'Selecione a obra/setor.';
    if (!responsibleId) errors.responsibleId = `Selecione ${getResponsibleLabel(type).toLowerCase()}.`;
    if (!title) errors.title = `Informe ${getTitleLabel(type).toLowerCase()}.`;
    if (!date) errors.date = 'Informe a data.';
    if ((type === 'APR' || type === 'PT') && !number) errors.number = 'Informe o número.';
    return { isValid: Object.keys(errors).length === 0, errors };
  };

  const getResponsibleField = (type: ExtractedData['type']) => {
    if (type === 'APR') return 'elaborador_id';
    if (type === 'PT') return 'responsavel_id';
    if (type === 'CHECKLIST') return 'inspetor_id';
    if (type === 'DDS') return 'facilitador_id';
    return 'responsavel_id';
  };

  const normalizeDateInput = (value: string) => {
    const ddmmyyyy = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (ddmmyyyy) {
      const [, dd, mm, yyyy] = ddmmyyyy;
      return `${yyyy}-${mm}-${dd}`;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
  };

  const validation = result ? getImportValidation(result.type) : { isValid: true, errors: {} };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">Importação Inteligente</h1>
          <p className="text-[var(--ds-color-text-muted)]">
            Transforme documentos (PDF, Word, Excel) em registros do sistema usando IA.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card tone="elevated" padding="lg">
            <CardHeader className="mb-4 px-0 pt-0">
              <CardTitle className="text-lg">1. Selecione o Documento</CardTitle>
            </CardHeader>

            <div className="flex w-full items-center justify-center">
              <label
                htmlFor="dropzone-file"
                className="flex h-64 w-full cursor-pointer flex-col items-center justify-center rounded-[var(--ds-radius-lg)] border-2 border-dashed border-[var(--ds-color-border-strong)] bg-[var(--ds-color-surface-muted)]/18 transition-colors hover:bg-[var(--ds-color-surface-muted)]/28"
              >
                <div className="flex flex-col items-center justify-center pb-6 pt-5">
                  <Upload className="mb-4 h-10 w-10 text-[var(--ds-color-text-muted)]" />
                  <p className="mb-2 text-sm text-[var(--ds-color-text-secondary)]">
                    <span className="font-semibold">Clique para enviar</span> ou arraste o arquivo
                  </p>
                  <p className="text-xs text-[var(--ds-color-text-muted)]">PDF, DOCX, XLSX (Máx. 10MB)</p>
                </div>
                <input
                  id="dropzone-file"
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                  accept=".pdf,.docx,.xlsx,.xls"
                />
              </label>
            </div>

            {file && (
              <div className="mt-4 flex items-center justify-between rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-primary-subtle)] bg-[var(--ds-color-primary-subtle)]/46 p-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-6 w-6 text-[var(--ds-color-action-primary)]" />
                  <div>
                    <p className="text-sm font-medium text-[var(--ds-color-text-primary)]">{file.name}</p>
                    <p className="text-xs text-[var(--ds-color-text-secondary)]">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <Button onClick={handleUpload} disabled={analyzing} rightIcon={!analyzing ? <ArrowRight className="h-4 w-4" /> : undefined} loading={analyzing}>
                  {analyzing ? 'Analisando...' : 'Processar'}
                </Button>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {result && (
            <Card tone="elevated" padding="lg" className="animate-in fade-in slide-in-from-bottom-4">
              <CardHeader className="mb-4 px-0 pt-0">
                <CardTitle className="text-lg">2. Resultado da Análise</CardTitle>
              </CardHeader>

              <div className="mb-6 flex items-center gap-4 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/18 p-4">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-full ${
                    result.confidence > 0.8
                      ? 'bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)]'
                      : 'bg-[var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)]'
                  }`}
                >
                  {result.confidence > 0.8 ? <CheckCircle className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
                </div>
                <div>
                  <p className="text-sm text-[var(--ds-color-text-muted)]">Tipo Identificado</p>
                  <p className="text-xl font-bold text-[var(--ds-color-text-primary)]">{result.type}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-sm text-[var(--ds-color-text-muted)]">Confiança</p>
                  <p className="text-lg font-semibold text-[var(--ds-color-text-primary)]">{(result.confidence * 100).toFixed(0)}%</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-[var(--ds-color-text-secondary)]">Metadados Extraídos</h3>
                  <div className="mt-2 grid grid-cols-2 gap-4">
                    <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] p-3">
                      <p className="text-xs text-[var(--ds-color-text-muted)]">Data</p>
                      <p className="font-medium text-[var(--ds-color-text-primary)]">{result.metadata.date || 'Não encontrada'}</p>
                    </div>
                    <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] p-3">
                      <p className="text-xs text-[var(--ds-color-text-muted)]">Responsável</p>
                      <p className="font-medium text-[var(--ds-color-text-primary)]">{result.metadata.responsibles?.[0] || 'Não identificado'}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-[var(--ds-color-text-secondary)]">Campos de Importação</h3>
                  <div className="mt-2 grid grid-cols-1 gap-4 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/18 p-4">
                    <div>
                      <label htmlFor="import-site" className="text-xs text-[var(--ds-color-text-muted)]">Obra/Setor</label>
                      <Input
                        id="import-site-search"
                        type="text"
                        className="mt-1"
                        value={siteSearchTerm}
                        onChange={(e) => setSiteSearchTerm(e.target.value)}
                        placeholder="Buscar obra/setor"
                      />
                      <select
                        id="import-site"
                        className="mt-2 h-11 w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] shadow-[var(--ds-shadow-sm)] outline-none transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:shadow-[0_0_0_4px_var(--ds-color-focus-ring)]"
                        value={siteId}
                        onChange={(e) => setSiteId(e.target.value)}
                        disabled={sitesLoading}
                      >
                        <option value="">{sitesLoading ? 'Carregando sites...' : 'Selecione a obra/setor'}</option>
                        {sites.map((site) => (
                          <option key={site.id} value={site.id}>
                            {site.nome}
                          </option>
                        ))}
                      </select>
                      {showErrors && validation.errors.siteId && <p className="mt-1 text-xs text-red-500">{validation.errors.siteId}</p>}
                    </div>

                    <div>
                      <label htmlFor="import-responsible" className="text-xs text-[var(--ds-color-text-muted)]">{getResponsibleLabel(result.type)}</label>
                      <Input
                        id="import-responsible-search"
                        type="text"
                        className="mt-1"
                        value={responsibleSearchTerm}
                        onChange={(e) => setResponsibleSearchTerm(e.target.value)}
                        placeholder={`Buscar ${getResponsibleLabel(result.type).toLowerCase()}`}
                      />
                      <select
                        id="import-responsible"
                        className="mt-2 h-11 w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] shadow-[var(--ds-shadow-sm)] outline-none transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:shadow-[0_0_0_4px_var(--ds-color-focus-ring)]"
                        value={responsibleId}
                        onChange={(e) => setResponsibleId(e.target.value)}
                        disabled={usersLoading}
                      >
                        <option value="">
                          {usersLoading ? 'Carregando responsáveis...' : 'Selecione'}
                        </option>
                        {users.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.nome}
                          </option>
                        ))}
                      </select>
                      {showErrors && validation.errors.responsibleId && <p className="mt-1 text-xs text-red-500">{validation.errors.responsibleId}</p>}
                    </div>

                    <div>
                      <label htmlFor="import-title" className="text-xs text-[var(--ds-color-text-muted)]">{getTitleLabel(result.type)}</label>
                      <Input
                        id="import-title"
                        type="text"
                        className="mt-1"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={result.type === 'DDS' ? 'Tema do DDS' : 'Título do documento'}
                      />
                      {showErrors && validation.errors.title && <p className="mt-1 text-xs text-red-500">{validation.errors.title}</p>}
                    </div>

                    {(result.type === 'APR' || result.type === 'PT') && (
                      <div>
                        <label htmlFor="import-number" className="text-xs text-[var(--ds-color-text-muted)]">Número</label>
                        <Input
                          id="import-number"
                          type="text"
                          className="mt-1"
                          value={number}
                          onChange={(e) => setNumber(e.target.value)}
                          placeholder="Número do documento"
                        />
                        {showErrors && validation.errors.number && <p className="mt-1 text-xs text-red-500">{validation.errors.number}</p>}
                      </div>
                    )}

                    <div>
                      <label htmlFor="import-date" className="text-xs text-[var(--ds-color-text-muted)]">Data</label>
                      <Input id="import-date" type="date" className="mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
                      {showErrors && validation.errors.date && <p className="mt-1 text-xs text-red-500">{validation.errors.date}</p>}
                    </div>

                    {(result.type === 'DDS' || result.type === 'CHECKLIST') && (
                      <div className="flex items-center gap-2">
                        <input
                          id="is-model"
                          type="checkbox"
                          checked={isModel}
                          onChange={(e) => setIsModel(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-amber-700 focus:ring-amber-500"
                        />
                        <label htmlFor="is-model" className="text-sm text-[var(--ds-color-text-secondary)]">
                          Salvar como modelo
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-[var(--ds-color-text-secondary)]">Campos Específicos</h3>
                  <div className="mt-2 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/18 p-3">
                    <pre className="overflow-x-auto text-xs text-[var(--ds-color-text-secondary)]">{JSON.stringify(result.fields, null, 2)}</pre>
                  </div>
                </div>

                <div className="pt-4">
                  <Button
                    disabled={saving || result.type === 'UNKNOWN' || !validation.isValid}
                    onClick={handleImport}
                    variant="success"
                    className="w-full"
                    loading={saving}
                  >
                    {saving ? 'Importando...' : `Importar como ${result.type}`}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {!result && !analyzing && (
            <Card tone="muted" className="flex h-full items-center justify-center border-dashed p-12 text-center">
              <div>
                <FileText className="mx-auto mb-4 h-12 w-12 text-[var(--ds-color-text-muted)]/40" />
                <h3 className="text-lg font-medium text-[var(--ds-color-text-primary)]">Aguardando documento</h3>
                <p className="text-[var(--ds-color-text-muted)]">Faça o upload para ver a análise da IA.</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

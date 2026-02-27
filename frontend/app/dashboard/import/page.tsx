'use client';

import { useEffect, useState } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, Loader2, ArrowRight } from 'lucide-react';
import axios from 'axios';
import api from '@/lib/api';
import { toast } from 'sonner'; // Usando sonner que vi no package.json
import { sitesService, Site } from '@/services/sitesService';
import { usersService, User } from '@/services/usersService';
import { useAuth } from '@/context/AuthContext';

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
  const [siteId, setSiteId] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [title, setTitle] = useState('');
  const [number, setNumber] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [isModel, setIsModel] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const uploadConfig = {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 45000,
  };

  const shouldRetryUpload = (error: unknown) => {
    if (!axios.isAxiosError(error)) return false;
    const status = error.response?.status;
    return (
      error.code === 'ECONNABORTED' ||
      !status ||
      (status >= 500 && status <= 599)
    );
  };

  const uploadWithRetry = async (formData: FormData) => {
    const maxAttempts = 3;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await api.post<ExtractedData>(
          '/imports/upload',
          formData,
          uploadConfig,
        );
      } catch (error) {
        lastError = error;
        if (!shouldRetryUpload(error) || attempt === maxAttempts) {
          throw error;
        }
        const backoffMs =
          400 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 150);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
    throw lastError;
  };

  useEffect(() => {
    async function loadData() {
      try {
        const [sitesData, usersData] = await Promise.all([
          sitesService.findAll(),
          usersService.findAll(),
        ]);
        setSites(sitesData);
        setUsers(usersData);
        if (user?.id && !responsibleId) {
          setResponsibleId(user.id);
        }
        if (user?.site_id) {
          setSiteId(user.site_id);
        } else if (sitesData.length > 0 && !siteId) {
          setSiteId(sitesData[0].id);
        }
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
        toast.error('Erro ao carregar sites e usuários.');
      }
    }
    loadData();
  }, [siteId, user?.id, user?.site_id, responsibleId]);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
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
      const response = await api.post<ExtractedData>(
        '/imports/upload',
        formData,
        uploadConfig,
      );
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
    if (!siteId) {
      errors.siteId = 'Selecione a obra/setor.';
    }
    if (!responsibleId) {
      errors.responsibleId = `Selecione ${getResponsibleLabel(type).toLowerCase()}.`;
    }
    if (!title) {
      errors.title = `Informe ${getTitleLabel(type).toLowerCase()}.`;
    }
    if (!date) {
      errors.date = 'Informe a data.';
    }
    if ((type === 'APR' || type === 'PT') && !number) {
      errors.number = 'Informe o número.';
    }
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
          <h1 className="text-2xl font-bold text-gray-900">Importação Inteligente</h1>
          <p className="text-gray-500">
            Transforme documentos (PDF, Word, Excel) em registros do sistema usando IA.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Área de Upload */}
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">1. Selecione o Documento</h2>
            
            <div className="flex w-full items-center justify-center">
              <label
                htmlFor="dropzone-file"
                className="flex h-64 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100"
              >
                <div className="flex flex-col items-center justify-center pb-6 pt-5">
                  <Upload className="mb-4 h-10 w-10 text-gray-400" />
                  <p className="mb-2 text-sm text-gray-500">
                    <span className="font-semibold">Clique para enviar</span> ou arraste o arquivo
                  </p>
                  <p className="text-xs text-gray-500">PDF, DOCX, XLSX (Máx. 10MB)</p>
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
              <div className="mt-4 flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 p-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-6 w-6 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-blue-900">{file.name}</p>
                    <p className="text-xs text-blue-700">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <button
                  onClick={handleUpload}
                  disabled={analyzing}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analisando...
                    </>
                  ) : (
                    <>
                      Processar
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Área de Resultado */}
        <div className="space-y-6">
          {result && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm animate-in fade-in slide-in-from-bottom-4">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">2. Resultado da Análise</h2>
              
              <div className="mb-6 flex items-center gap-4 rounded-lg bg-gray-50 p-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-full ${
                  result.confidence > 0.8 ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'
                }`}>
                  {result.confidence > 0.8 ? <CheckCircle className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
                </div>
                <div>
                  <p className="text-sm text-gray-500">Tipo Identificado</p>
                  <p className="text-xl font-bold text-gray-900">{result.type}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-sm text-gray-500">Confiança</p>
                  <p className="text-lg font-semibold text-gray-900">{(result.confidence * 100).toFixed(0)}%</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-700">Metadados Extraídos</h3>
                  <div className="mt-2 grid grid-cols-2 gap-4">
                    <div className="rounded-lg border border-gray-200 p-3">
                      <p className="text-xs text-gray-500">Data</p>
                      <p className="font-medium">{result.metadata.date || 'Não encontrada'}</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-3">
                      <p className="text-xs text-gray-500">Responsável</p>
                      <p className="font-medium">{result.metadata.responsibles?.[0] || 'Não identificado'}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-700">Campos de Importação</h3>
                  <div className="mt-2 grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div>
                      <label htmlFor="import-site" className="text-xs text-gray-500">Obra/Setor</label>
                      <select
                        id="import-site"
                        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                        value={siteId}
                        onChange={(e) => setSiteId(e.target.value)}
                      >
                        {sites.map((site) => (
                          <option key={site.id} value={site.id}>
                            {site.nome}
                          </option>
                        ))}
                      </select>
                      {showErrors && validation.errors.siteId && (
                        <p className="mt-1 text-xs text-red-500">{validation.errors.siteId}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="import-responsible" className="text-xs text-gray-500">{getResponsibleLabel(result.type)}</label>
                      <select
                        id="import-responsible"
                        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                        value={responsibleId}
                        onChange={(e) => setResponsibleId(e.target.value)}
                      >
                        <option value="">Selecione</option>
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.nome}
                          </option>
                        ))}
                      </select>
                      {showErrors && validation.errors.responsibleId && (
                        <p className="mt-1 text-xs text-red-500">{validation.errors.responsibleId}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="import-title" className="text-xs text-gray-500">
                        {getTitleLabel(result.type)}
                      </label>
                      <input
                        id="import-title"
                        type="text"
                        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={result.type === 'DDS' ? 'Tema do DDS' : 'Título do documento'}
                      />
                      {showErrors && validation.errors.title && (
                        <p className="mt-1 text-xs text-red-500">{validation.errors.title}</p>
                      )}
                    </div>
                    {(result.type === 'APR' || result.type === 'PT') && (
                      <div>
                        <label htmlFor="import-number" className="text-xs text-gray-500">Número</label>
                        <input
                          id="import-number"
                          type="text"
                          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                          value={number}
                          onChange={(e) => setNumber(e.target.value)}
                          placeholder="Número do documento"
                        />
                        {showErrors && validation.errors.number && (
                          <p className="mt-1 text-xs text-red-500">{validation.errors.number}</p>
                        )}
                      </div>
                    )}
                    <div>
                      <label htmlFor="import-date" className="text-xs text-gray-500">Data</label>
                      <input
                        id="import-date"
                        type="date"
                        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                      {showErrors && validation.errors.date && (
                        <p className="mt-1 text-xs text-red-500">{validation.errors.date}</p>
                      )}
                    </div>
                    {(result.type === 'DDS' || result.type === 'CHECKLIST') && (
                      <div className="flex items-center gap-2">
                        <input
                          id="is-model"
                          type="checkbox"
                          checked={isModel}
                          onChange={(e) => setIsModel(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="is-model" className="text-sm text-gray-700">
                          Salvar como modelo
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-700">Campos Específicos</h3>
                  <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <pre className="overflow-x-auto text-xs text-gray-600">
                      {JSON.stringify(result.fields, null, 2)}
                    </pre>
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    disabled={
                      saving ||
                      result.type === 'UNKNOWN' ||
                        !validation.isValid
                    }
                    onClick={handleImport}
                    className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Importando...' : `Importar como ${result.type}`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {!result && !analyzing && (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 p-12 text-center">
              <div>
                <FileText className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-900">Aguardando documento</h3>
                <p className="text-gray-500">Faça o upload para ver a análise da IA.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

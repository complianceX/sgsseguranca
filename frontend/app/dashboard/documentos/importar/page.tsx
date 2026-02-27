'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ShieldCheck, 
  Search, 
  Info,
  ChevronRight,
  FileCheck
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';

interface AnalysisResult {
  success: boolean;
  documentId: string;
  tipoDocumento: string;
  tipoDocumentoDescricao: string;
  analysis: {
    empresa: string;
    cnpj: string;
    data: string;
    responsavelTecnico: string;
    nrsCitadas: string[];
    riscos: string[];
    epis: string[];
    assinaturas: string[];
    scoreConfianca: number;
  };
  validation: {
    status: 'VALIDO' | 'COM_PENDENCIAS' | 'INVALIDO';
    pendencias: string[];
    scoreConfianca: number;
  };
  metadata: {
    tamanhoArquivo: number;
    quantidadeTexto: number;
    hash: string;
    timestamp: string;
  };
}

export default function DocumentImportPage() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${progress}%`;
    }
  }, [progress]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'application/pdf') {
      setFile(droppedFile);
      setResult(null);
    } else {
      toast.error('Por favor, envie apenas arquivos PDF.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgress(0);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('empresaId', user?.company_id || '');

    try {
      // Simulação de progresso para melhor UX
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 500);

      const response = await api.post<AnalysisResult>('/documents/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      clearInterval(progressInterval);
      setProgress(100);
      setResult(response.data);
      toast.success('Documento processado com sucesso!');
    } catch (error: unknown) {
      console.error('Erro no upload:', error);
      
      let message = 'Erro ao processar documento.';
      if (error && typeof error === 'object' && 'response' in error) {
        const response = (error as { response: { data?: { message?: string } } }).response;
        message = response.data?.message || message;
      }
      
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Importação Inteligente de PDF</h1>
        <p className="text-slate-500">
          Faça upload de documentos SST (APR, PGR, PCMSO, ASO) para extração automática e validação.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Lado Esquerdo: Upload */}
        <div className="lg:col-span-1 space-y-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              relative border-2 border-dashed rounded-xl p-8 transition-all duration-200
              flex flex-col items-center justify-center text-center gap-4 cursor-pointer
              ${isDragging ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-slate-300 bg-slate-50'}
              ${file ? 'border-green-500 bg-green-50' : ''}
            `}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf"
              className="hidden"
              title="Upload de arquivo PDF"
              aria-label="Upload de arquivo PDF"
            />
            
            <div className={`p-4 rounded-full ${file ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
              {file ? <FileCheck size={32} /> : <Upload size={32} />}
            </div>

            <div className="space-y-1">
              <p className="font-semibold text-slate-900">
                {file ? file.name : 'Clique ou arraste o PDF aqui'}
              </p>
              <p className="text-sm text-slate-500">Apenas arquivos PDF até 10MB</p>
            </div>

            {file && !uploading && !result && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpload();
                }}
                className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                Começar Processamento <ChevronRight size={18} />
              </button>
            )}

            {uploading && (
              <div className="w-full mt-4 space-y-3">
                <div className="flex justify-between text-sm font-medium text-slate-600">
                  <span>Processando...</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div 
                    ref={progressBarRef}
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                  />
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-blue-600 animate-pulse">
                  <Loader2 size={16} className="animate-spin" />
                  IA analisando o conteúdo...
                </div>
              </div>
            )}

            {result && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  reset();
                }}
                className="mt-4 w-full border border-slate-200 hover:bg-white text-slate-600 font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Importar outro arquivo
              </button>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-blue-900 flex items-center gap-2">
              <Info size={16} /> Como funciona?
            </h3>
            <ul className="text-xs text-blue-800 space-y-2 list-disc pl-4">
              <li>Extraímos todo o texto do documento usando OCR e Processamento de Linguagem Natural.</li>
              <li>Nossa IA classifica automaticamente o tipo do documento.</li>
              <li>Identificamos riscos, EPIs, empresas, datas e assinaturas.</li>
              <li>Validamos as exigências das NRs (Normas Regulamentadoras).</li>
            </ul>
          </div>
        </div>

        {/* Lado Direito: Resultados */}
        <div className="lg:col-span-2">
          {result ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Header de Resultado */}
              <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${
                    result.validation.status === 'VALIDO' ? 'bg-green-100 text-green-600' :
                    result.validation.status === 'COM_PENDENCIAS' ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'
                  }`}>
                    {result.validation.status === 'VALIDO' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">{result.tipoDocumentoDescricao}</h2>
                    <p className="text-sm text-slate-500">Status da Validação: <span className="font-semibold">{result.validation.status}</span></p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-500 mb-1">Score de Confiança</div>
                  <div className={`text-2xl font-black ${
                    result.validation.scoreConfianca > 0.8 ? 'text-green-600' :
                    result.validation.scoreConfianca > 0.5 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {(result.validation.scoreConfianca * 100).toFixed(0)}%
                  </div>
                </div>
              </div>

              {/* Grid de Detalhes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Informações Gerais */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Search size={18} className="text-blue-500" /> Informações Extraídas
                  </h3>
                  <div className="space-y-3">
                    <DetailItem label="Empresa" value={result.analysis.empresa} />
                    <DetailItem label="CNPJ" value={result.analysis.cnpj} />
                    <DetailItem label="Data" value={result.analysis.data ? new Date(result.analysis.data).toLocaleDateString('pt-BR') : 'Não encontrada'} />
                    <DetailItem label="Resp. Técnico" value={result.analysis.responsavelTecnico} />
                  </div>
                </div>

                {/* Pendências / Validação */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <ShieldCheck size={18} className="text-blue-500" /> Validação Técnica
                  </h3>
                  {result.validation.pendencias.length > 0 ? (
                    <div className="space-y-2">
                      {result.validation.pendencias.map((pendencia, i) => (
                        <div key={i} className="flex gap-2 text-sm text-amber-700 bg-amber-50 p-2 rounded-lg">
                          <AlertCircle size={16} className="shrink-0 mt-0.5" />
                          {pendencia}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                      <CheckCircle2 size={32} className="text-green-500 mb-2" />
                      <p className="text-sm text-green-700 font-medium">Nenhuma pendência crítica identificada.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Tags e Listas */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Riscos Identificados</h4>
                    <div className="flex flex-wrap gap-2">
                      {result.analysis.riscos.length > 0 ? (
                        result.analysis.riscos.map((risco, i) => (
                          <span key={i} className="px-2 py-1 bg-red-50 text-red-700 text-xs font-medium rounded-md border border-red-100">
                            {risco}
                          </span>
                        ))
                      ) : <span className="text-xs text-slate-400">Nenhum risco detectado</span>}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">EPIs Citados</h4>
                    <div className="flex flex-wrap gap-2">
                      {result.analysis.epis.length > 0 ? (
                        result.analysis.epis.map((epi, i) => (
                          <span key={i} className="px-2 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-md border border-green-100">
                            {epi}
                          </span>
                        ))
                      ) : <span className="text-xs text-slate-400">Nenhum EPI detectado</span>}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Normas Regulamentadoras (NRs)</h4>
                  <div className="flex flex-wrap gap-2">
                    {result.analysis.nrsCitadas.length > 0 ? (
                      result.analysis.nrsCitadas.map((nr, i) => (
                        <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-md border border-blue-100">
                          {nr}
                        </span>
                      ))
                    ) : <span className="text-xs text-slate-400">Nenhuma NR identificada</span>}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-12 text-slate-400">
              <FileText size={64} className="mb-4 opacity-20" />
              <p className="text-lg font-medium">Aguardando envio de arquivo para análise</p>
              <p className="text-sm">Os resultados da IA aparecerão aqui após o processamento.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
      <span className="text-sm font-semibold text-slate-700">{value || '---'}</span>
    </div>
  );
}

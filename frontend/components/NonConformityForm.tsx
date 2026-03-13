"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import type { FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Save, Plus, Trash2, Loader2, Camera, X } from "lucide-react";
import { toast } from "sonner";
import {
  NC_STATUS_LABEL,
  NcStatus,
  nonConformitiesService,
  normalizeNcStatus,
} from "@/services/nonConformitiesService";
import { sitesService, Site } from "@/services/sitesService";
import { getFormErrorMessage } from "@/lib/error-handler";
import { attachPdfIfProvided } from "@/lib/document-upload";
import { readSophieNcPreview, SophieNcPreview } from "@/lib/sophie-draft-storage";

const nonConformitySchema = z.object({
  codigo_nc: z.string().min(1, "O código é obrigatório"),
  tipo: z.string().min(1, "O tipo é obrigatório"),
  data_identificacao: z.string(),
  site_id: z.string().optional(),
  local_setor_area: z.string().min(1, "O local/setor/área é obrigatório"),
  atividade_envolvida: z.string().min(1, "A atividade é obrigatória"),
  responsavel_area: z.string().min(1, "O responsável é obrigatório"),
  auditor_responsavel: z.string().min(1, "O auditor é obrigatório"),
  classificacao: z.array(z.string()).optional(),
  descricao: z.string().min(1, "A descrição é obrigatória"),
  evidencia_observada: z.string().min(1, "A evidência é obrigatória"),
  condicao_insegura: z.string().min(1, "A condição insegura é obrigatória"),
  ato_inseguro: z.string().optional(),
  requisito_nr: z.string().min(1, "A NR é obrigatória"),
  requisito_item: z.string().min(1, "O item é obrigatório"),
  requisito_procedimento: z.string().optional(),
  requisito_politica: z.string().optional(),
  risco_perigo: z.string().min(1, "O perigo é obrigatório"),
  risco_associado: z.string().min(1, "O risco é obrigatório"),
  risco_consequencias: z.array(z.string()).optional(),
  risco_nivel: z.string().min(1, "O nível de risco é obrigatório"),
  causa: z.array(z.string()).optional(),
  causa_outro: z.string().optional(),
  acao_imediata_descricao: z.string().optional(),
  acao_imediata_data: z.string().optional(),
  acao_imediata_responsavel: z.string().optional(),
  acao_imediata_status: z.string().optional(),
  acao_definitiva_descricao: z.string().optional(),
  acao_definitiva_prazo: z.string().optional(),
  acao_definitiva_responsavel: z.string().optional(),
  acao_definitiva_recursos: z.string().optional(),
  acao_definitiva_data_prevista: z.string().optional(),
  acao_preventiva_medidas: z.string().optional(),
  acao_preventiva_treinamento: z.string().optional(),
  acao_preventiva_revisao_procedimento: z.string().optional(),
  acao_preventiva_melhoria_processo: z.string().optional(),
  acao_preventiva_epc_epi: z.string().optional(),
  verificacao_resultado: z.string().optional(),
  verificacao_evidencias: z.string().optional(),
  verificacao_data: z.string().optional(),
  verificacao_responsavel: z.string().optional(),
  status: z.string().min(1, "O status é obrigatório"),
  observacoes_gerais: z.string().optional(),
  anexos: z
    .array(z.object({ url: z.string().min(1, "Informe o anexo") }))
    .optional(),
  assinatura_responsavel_area: z.string().optional(),
  assinatura_tecnico_auditor: z.string().optional(),
  assinatura_gestao: z.string().optional(),
});

type NonConformityFormData = z.infer<typeof nonConformitySchema>;

interface NonConformityFormProps {
  id?: string;
}

function isImageAttachment(url?: string) {
  const normalized = String(url || "").trim().toLowerCase();
  return (
    normalized.startsWith("data:image/") ||
    normalized.endsWith(".png") ||
    normalized.endsWith(".jpg") ||
    normalized.endsWith(".jpeg") ||
    normalized.endsWith(".webp") ||
    normalized.endsWith(".gif")
  );
}

function resolveActionPriorityClass(priority?: string) {
  switch (priority) {
    case "critical":
      return "border-red-300 bg-red-50 text-red-700";
    case "high":
      return "border-amber-300 bg-amber-50 text-amber-700";
    case "medium":
      return "border-sky-300 bg-sky-50 text-sky-700";
    default:
      return "border-slate-300 bg-slate-50 text-slate-700";
  }
}

function resolveRiskLevelClass(riskLevel?: string) {
  switch (riskLevel) {
    case "Crítico":
      return "border-red-300 bg-red-50 text-red-700";
    case "Alto":
      return "border-amber-300 bg-amber-50 text-amber-700";
    case "Médio":
      return "border-sky-300 bg-sky-50 text-sky-700";
    default:
      return "border-emerald-300 bg-emerald-50 text-emerald-700";
  }
}

export function NonConformityForm({ id }: NonConformityFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [sophiePreview, setSophiePreview] = useState<SophieNcPreview | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setFocus,
    watch,
    formState: { errors, isValid, isSubmitting },
  } = useForm<NonConformityFormData>({
    resolver: zodResolver(nonConformitySchema),
    mode: "onBlur",
    reValidateMode: "onBlur",
    defaultValues: {
      data_identificacao: new Date().toISOString().split("T")[0],
      tipo: "Menor",
      risco_nivel: "Baixo",
      status: NcStatus.ABERTA,
      acao_imediata_status: "Não implementada",
      verificacao_resultado: "Não",
      classificacao: [],
      risco_consequencias: [],
      causa: [],
      anexos: [],
    },
  });

  const {
    fields: anexosFields,
    append: appendAnexo,
    remove: removeAnexo,
  } = useFieldArray({
    control,
    name: "anexos",
  });
  const watchedAnexos = watch("anexos") || [];

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraOpen(true);
    } catch {
      toast.error("Não foi possível acessar a câmera.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 800;
      canvas.height = video.videoHeight || 600;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        appendAnexo({ url: dataUrl });
        toast.success("Foto capturada e adicionada aos anexos");
      }
    }
    stopCamera();
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const sitesData = await sitesService.findAll();
        setSites(sitesData);
        if (id) {
          const nonConformity = await nonConformitiesService.findOne(id);
          reset({
            ...nonConformity,
            status: normalizeNcStatus(nonConformity.status),
            data_identificacao: new Date(nonConformity.data_identificacao)
              .toISOString()
              .split("T")[0],
            acao_imediata_data: nonConformity.acao_imediata_data
              ? new Date(nonConformity.acao_imediata_data)
                  .toISOString()
                  .split("T")[0]
              : undefined,
            acao_definitiva_prazo: nonConformity.acao_definitiva_prazo
              ? new Date(nonConformity.acao_definitiva_prazo)
                  .toISOString()
                  .split("T")[0]
              : undefined,
            acao_definitiva_data_prevista:
              nonConformity.acao_definitiva_data_prevista
                ? new Date(nonConformity.acao_definitiva_data_prevista)
                    .toISOString()
                    .split("T")[0]
                : undefined,
            verificacao_data: nonConformity.verificacao_data
              ? new Date(nonConformity.verificacao_data)
                  .toISOString()
                  .split("T")[0]
              : undefined,
            anexos: (nonConformity.anexos || []).map((url) => ({ url })),
          });
        }
      } catch (error) {
        console.error("Error loading data:", error);
        toast.error("Erro ao carregar dados");
      } finally {
        setFetching(false);
      }
    };

    loadData();
  }, [id, reset]);

  useEffect(() => {
    if (!id) {
      setSophiePreview(null);
      return;
    }

    setSophiePreview(readSophieNcPreview(id));
  }, [id]);

  const onSubmit = async (data: NonConformityFormData) => {
    setLoading(true);
    setSubmitError(null);
    try {
      const payload = {
        ...data,
        anexos: data.anexos?.map((item) => item.url),
      };

      if (id) {
        const updated = await nonConformitiesService.update(id, payload);
        await attachPdfIfProvided(
          updated.id,
          pdfFile,
          nonConformitiesService.attachFile,
        );
        toast.success("Não conformidade atualizada com sucesso");
      } else {
        const created = await nonConformitiesService.create(payload);
        await attachPdfIfProvided(
          created.id,
          pdfFile,
          nonConformitiesService.attachFile,
        );
        toast.success("Não conformidade criada com sucesso");
      }
      router.push("/dashboard/nonconformities");
    } catch (error) {
      console.error("Error saving non conformity:", error);
      const errorMessage = getFormErrorMessage(error, {
        badRequest: "Dados inválidos. Revise os campos obrigatórios.",
        unauthorized: "Sessão expirada. Faça login novamente.",
        forbidden: "Você não tem permissão para salvar esta não conformidade.",
        server: "Erro interno do servidor ao salvar a não conformidade.",
        fallback: "Falha ao salvar não conformidade. Tente novamente.",
      });
      setSubmitError(errorMessage);
      toast.error("Erro ao salvar não conformidade");
    } finally {
      setLoading(false);
    }
  };

  const onInvalid = (formErrors: FieldErrors<NonConformityFormData>) => {
    if (formErrors.codigo_nc) {
      setFocus("codigo_nc");
    } else if (formErrors.tipo) {
      setFocus("tipo");
    } else if (formErrors.local_setor_area) {
      setFocus("local_setor_area");
    } else if (formErrors.atividade_envolvida) {
      setFocus("atividade_envolvida");
    } else if (formErrors.responsavel_area) {
      setFocus("responsavel_area");
    } else if (formErrors.auditor_responsavel) {
      setFocus("auditor_responsavel");
    } else if (formErrors.descricao) {
      setFocus("descricao");
    } else if (formErrors.evidencia_observada) {
      setFocus("evidencia_observada");
    } else if (formErrors.condicao_insegura) {
      setFocus("condicao_insegura");
    } else if (formErrors.requisito_nr) {
      setFocus("requisito_nr");
    } else if (formErrors.requisito_item) {
      setFocus("requisito_item");
    } else if (formErrors.risco_perigo) {
      setFocus("risco_perigo");
    } else if (formErrors.risco_associado) {
      setFocus("risco_associado");
    } else if (formErrors.risco_nivel) {
      setFocus("risco_nivel");
    }
    toast.error("Revise os campos obrigatórios antes de salvar.");
  };

  if (fetching) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--ds-color-text-primary)]" />
      </div>
    );
  }

  const classificacaoOptions = [
    "Legal",
    "Procedimental",
    "Operacional",
    "Documental",
    "Comportamental",
    "Estrutural",
    "Equipamento / Máquina",
    "EPI / EPC",
  ];

  const consequenciasOptions = [
    "Lesão leve",
    "Lesão grave",
    "Incapacidade",
    "Fatalidade",
  ];

  const causasOptions = [
    "Falta de treinamento",
    "Falha de gestão",
    "Falta de procedimento",
    "Descumprimento de procedimento",
    "Falta de manutenção",
    "Falta de fiscalização",
    "Cultura de segurança inadequada",
    "Outro",
  ];

  const tiposNc = ["Crítica", "Maior", "Menor"];
  const niveisRisco = ["Baixo", "Médio", "Alto", "Crítico"];
  const statusOptions = Object.values(NcStatus);
  const statusAcao = ["Implementada", "Em andamento", "Não implementada"];
  const resultadoEficacia = ["Sim", "Parcialmente", "Não"];

  return (
    <form
      onSubmit={handleSubmit(onSubmit, onInvalid)}
      className="ds-form-page space-y-8 pb-12"
    >
      {submitError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {submitError}
        </div>
      )}
      {sophiePreview ? (
        <div className="rounded-xl border border-[var(--ds-color-action-primary)]/20 bg-[var(--ds-color-action-primary)]/8 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-action-primary)]">
                NC Assistida pela SOPHIE
              </p>
              <h2 className="mt-2 text-lg font-bold text-[var(--ds-color-text-primary)]">
                Revisão guiada da não conformidade
              </h2>
              <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
                A SOPHIE estruturou o plano inicial de ação e trouxe as evidências visuais da origem para acelerar sua validação técnica.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {sophiePreview.riskLevel ? (
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${resolveRiskLevelClass(
                    sophiePreview.riskLevel,
                  )}`}
                >
                  Risco {sophiePreview.riskLevel}
                </span>
              ) : null}
              {sophiePreview.sourceType ? (
                <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                  Origem {sophiePreview.sourceType}
                </span>
              ) : null}
            </div>
          </div>

          {sophiePreview.actionPlan?.length ? (
            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-text-secondary)]">
                Plano de ação estruturado pela SOPHIE
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {sophiePreview.actionPlan.map((item, index) => (
                  <div
                    key={`${item.type}-${item.title}-${index}`}
                    className="rounded-lg border border-[var(--ds-color-border-subtle)] bg-white/80 p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${resolveActionPriorityClass(
                          item.priority,
                        )}`}
                      >
                        Prioridade {item.priority}
                      </span>
                      <span className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                        {item.type}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                      {item.title}
                    </p>
                    <p className="mt-2 text-xs text-[var(--ds-color-text-secondary)]">
                      Responsável sugerido: {item.owner}
                    </p>
                    <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
                      Prazo sugerido: {item.timeline}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {sophiePreview.evidenceAttachments?.length ? (
            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-text-secondary)]">
                Evidências importadas da origem
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {sophiePreview.evidenceAttachments.map((item, index) => (
                  <div
                    key={`${item.url}-${index}`}
                    className="overflow-hidden rounded-lg border border-[var(--ds-color-border-subtle)] bg-white/80"
                  >
                    {isImageAttachment(item.url) ? (
                      <img
                        src={item.url}
                        alt={item.label}
                        className="h-40 w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-40 items-center justify-center bg-slate-100 px-4 text-center text-xs text-slate-500">
                        Evidência disponível para abertura externa
                      </div>
                    )}
                    <div className="p-3">
                      <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                        {item.label}
                      </p>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex text-xs font-semibold text-[var(--ds-color-action-primary)] hover:underline"
                      >
                        Abrir evidência
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-gray-900">
          1. Identificação da Não Conformidade
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label
              htmlFor="nc-codigo"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Código da NC
            </label>
            <input
              id="nc-codigo"
              {...register("codigo_nc")}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                errors.codigo_nc ? "border-red-500" : "border-gray-300"
              }`}
              aria-invalid={errors.codigo_nc ? "true" : undefined}
            />
            {errors.codigo_nc && (
              <p className="mt-1 text-xs text-red-500">
                {errors.codigo_nc.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="nc-tipo"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Tipo
            </label>
            <select
              id="nc-tipo"
              {...register("tipo")}
              aria-label="Tipo da não conformidade"
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                errors.tipo ? "border-red-500" : "border-gray-300"
              }`}
              aria-invalid={errors.tipo ? "true" : undefined}
            >
              {tiposNc.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {tipo}
                </option>
              ))}
            </select>
            {errors.tipo && (
              <p className="mt-1 text-xs text-red-500">{errors.tipo.message}</p>
            )}
          </div>
          <div>
            <label
              htmlFor="nc-data-identificacao"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Data da identificação
            </label>
            <input
              id="nc-data-identificacao"
              type="date"
              {...register("data_identificacao")}
              aria-label="Data da identificação"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label
              htmlFor="nc-site-id"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Site / Unidade
            </label>
            <select
              id="nc-site-id"
              {...register("site_id")}
              aria-label="Site ou unidade da não conformidade"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Selecione o site</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="nc-local-setor-area"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Local / Setor / Área
            </label>
            <input
              id="nc-local-setor-area"
              {...register("local_setor_area")}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                errors.local_setor_area ? "border-red-500" : "border-gray-300"
              }`}
              aria-invalid={errors.local_setor_area ? "true" : undefined}
            />
            {errors.local_setor_area && (
              <p className="mt-1 text-xs text-red-500">
                {errors.local_setor_area.message}
              </p>
            )}
          </div>
          <div className="md:col-span-2">
            <label
              htmlFor="nc-atividade-envolvida"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Atividade envolvida
            </label>
            <input
              id="nc-atividade-envolvida"
              {...register("atividade_envolvida")}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                errors.atividade_envolvida
                  ? "border-red-500"
                  : "border-gray-300"
              }`}
              aria-invalid={errors.atividade_envolvida ? "true" : undefined}
            />
            {errors.atividade_envolvida && (
              <p className="mt-1 text-xs text-red-500">
                {errors.atividade_envolvida.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="nc-responsavel-area"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Responsável pela área
            </label>
            <input
              id="nc-responsavel-area"
              {...register("responsavel_area")}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                errors.responsavel_area ? "border-red-500" : "border-gray-300"
              }`}
              aria-invalid={errors.responsavel_area ? "true" : undefined}
            />
            {errors.responsavel_area && (
              <p className="mt-1 text-xs text-red-500">
                {errors.responsavel_area.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="nc-auditor-responsavel"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Auditor / Técnico / Inspetor
            </label>
            <input
              id="nc-auditor-responsavel"
              {...register("auditor_responsavel")}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                errors.auditor_responsavel
                  ? "border-red-500"
                  : "border-gray-300"
              }`}
              aria-invalid={errors.auditor_responsavel ? "true" : undefined}
            />
            {errors.auditor_responsavel && (
              <p className="mt-1 text-xs text-red-500">
                {errors.auditor_responsavel.message}
              </p>
            )}
          </div>
          <div className="md:col-span-3">
            <label
              htmlFor="nc-pdf-file"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Anexar PDF da NC (opcional)
            </label>
            <input
              id="nc-pdf-file"
              type="file"
              accept="application/pdf"
              aria-label="Selecionar PDF da não conformidade"
              onChange={(event) => setPdfFile(event.target.files?.[0] || null)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:font-semibold file:text-slate-700 hover:file:bg-blue-100"
            />
          </div>
        </div>
      </div>

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-gray-900">
          2. Classificação da Não Conformidade
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {classificacaoOptions.map((option) => (
            <label key={option} className="flex items-center space-x-3 text-sm">
              <input
                type="checkbox"
                value={option}
                {...register("classificacao")}
                className="h-4 w-4 rounded border-gray-300 text-[var(--ds-color-text-primary)] focus:ring-blue-500"
              />
              <span className="text-gray-700">{option}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-gray-900">
          3. Descrição da Não Conformidade
        </h2>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="nc-descricao"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Descrição
            </label>
            <textarea
              id="nc-descricao"
              {...register("descricao")}
              aria-label="Descrição da não conformidade"
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {errors.descricao && (
              <p className="mt-1 text-xs text-red-500">
                {errors.descricao.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="nc-evidencia-observada"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Evidência observada
            </label>
            <textarea
              id="nc-evidencia-observada"
              {...register("evidencia_observada")}
              aria-label="Evidência observada"
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {errors.evidencia_observada && (
              <p className="mt-1 text-xs text-red-500">
                {errors.evidencia_observada.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="nc-condicao-insegura"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Condição insegura identificada
            </label>
            <textarea
              id="nc-condicao-insegura"
              {...register("condicao_insegura")}
              aria-label="Condição insegura identificada"
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {errors.condicao_insegura && (
              <p className="mt-1 text-xs text-red-500">
                {errors.condicao_insegura.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="nc-ato-inseguro"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Ato inseguro
            </label>
            <textarea
              id="nc-ato-inseguro"
              {...register("ato_inseguro")}
              aria-label="Ato inseguro"
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-gray-900">
          4. Requisito Não Atendido
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="nc-requisito-nr"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Norma Regulamentadora
            </label>
            <input
              id="nc-requisito-nr"
              {...register("requisito_nr")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {errors.requisito_nr && (
              <p className="mt-1 text-xs text-red-500">
                {errors.requisito_nr.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="nc-requisito-item"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Item / Subitem
            </label>
            <input
              id="nc-requisito-item"
              {...register("requisito_item")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {errors.requisito_item && (
              <p className="mt-1 text-xs text-red-500">
                {errors.requisito_item.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="nc-requisito-procedimento"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Procedimento interno
            </label>
            <input
              id="nc-requisito-procedimento"
              {...register("requisito_procedimento")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="nc-requisito-politica"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Política de SST
            </label>
            <input
              id="nc-requisito-politica"
              {...register("requisito_politica")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-gray-900">
          5. Análise de Risco Associada
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="nc-risco-perigo"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Perigo identificado
            </label>
            <input
              id="nc-risco-perigo"
              {...register("risco_perigo")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {errors.risco_perigo && (
              <p className="mt-1 text-xs text-red-500">
                {errors.risco_perigo.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="nc-risco-associado"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Risco associado
            </label>
            <input
              id="nc-risco-associado"
              {...register("risco_associado")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {errors.risco_associado && (
              <p className="mt-1 text-xs text-red-500">
                {errors.risco_associado.message}
              </p>
            )}
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-2 block text-sm font-bold text-gray-700">
            Possíveis consequências
          </label>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {consequenciasOptions.map((option) => (
              <label
                key={option}
                className="flex items-center space-x-3 text-sm"
              >
                <input
                  type="checkbox"
                  value={option}
                  {...register("risco_consequencias")}
                  className="h-4 w-4 rounded border-gray-300 text-[var(--ds-color-text-primary)] focus:ring-blue-500"
                />
                <span className="text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <label
            htmlFor="nc-risco-nivel"
            className="mb-2 block text-sm font-bold text-gray-700"
          >
            Nível de risco
          </label>
          <select
            id="nc-risco-nivel"
            {...register("risco_nivel")}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {niveisRisco.map((nivel) => (
              <option key={nivel} value={nivel}>
                {nivel}
              </option>
            ))}
          </select>
          {errors.risco_nivel && (
            <p className="mt-1 text-xs text-red-500">
              {errors.risco_nivel.message}
            </p>
          )}
        </div>
      </div>

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-gray-900">
          6. Causa da Não Conformidade
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {causasOptions.map((option) => (
            <label key={option} className="flex items-center space-x-3 text-sm">
              <input
                type="checkbox"
                value={option}
                {...register("causa")}
                className="h-4 w-4 rounded border-gray-300 text-[var(--ds-color-text-primary)] focus:ring-blue-500"
              />
              <span className="text-gray-700">{option}</span>
            </label>
          ))}
        </div>
        <div className="mt-4">
          <label
            htmlFor="nc-causa-outro"
            className="mb-2 block text-sm font-bold text-gray-700"
          >
            Outro (descrever)
          </label>
          <input
            id="nc-causa-outro"
            {...register("causa_outro")}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-gray-900">
          7. Ação Corretiva Imediata
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label
              htmlFor="nc-acao-imediata-descricao"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Medida adotada
            </label>
            <textarea
              id="nc-acao-imediata-descricao"
              {...register("acao_imediata_descricao")}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="nc-acao-imediata-data"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Data da ação
            </label>
            <input
              id="nc-acao-imediata-data"
              type="date"
              {...register("acao_imediata_data")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="nc-acao-imediata-responsavel"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Responsável
            </label>
            <input
              id="nc-acao-imediata-responsavel"
              {...register("acao_imediata_responsavel")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="nc-acao-imediata-status"
              className="mb-2 block text-sm font-bold text-gray-700"
            >
              Status
            </label>
            <select
              id="nc-acao-imediata-status"
              {...register("acao_imediata_status")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {statusAcao.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-gray-900">
          8. Ação Corretiva Definitiva
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-bold text-gray-700">
              Descrição detalhada
            </label>
            <textarea
              {...register("acao_definitiva_descricao")}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">
              Prazo para implementação
            </label>
            <input
              type="date"
              {...register("acao_definitiva_prazo")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">
              Responsável pela execução
            </label>
            <input
              {...register("acao_definitiva_responsavel")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-bold text-gray-700">
              Recursos necessários
            </label>
            <input
              {...register("acao_definitiva_recursos")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">
              Data prevista de conclusão
            </label>
            <input
              type="date"
              {...register("acao_definitiva_data_prevista")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-gray-900">
          9. Ação Preventiva
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-bold text-gray-700">
              Medidas para evitar reincidência
            </label>
            <textarea
              {...register("acao_preventiva_medidas")}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">
              Treinamento necessário
            </label>
            <input
              {...register("acao_preventiva_treinamento")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">
              Revisão de procedimento
            </label>
            <input
              {...register("acao_preventiva_revisao_procedimento")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">
              Melhoria de processo
            </label>
            <input
              {...register("acao_preventiva_melhoria_processo")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">
              Implementação de EPC / EPI
            </label>
            <input
              {...register("acao_preventiva_epc_epi")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-gray-900">
          10. Verificação de Eficácia
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">
              Ação eliminou ou reduziu o risco?
            </label>
            <select
              {...register("verificacao_resultado")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {resultadoEficacia.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">
              Data da verificação
            </label>
            <input
              type="date"
              {...register("verificacao_data")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-bold text-gray-700">
              Evidências
            </label>
            <textarea
              {...register("verificacao_evidencias")}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">
              Responsável pela validação
            </label>
            <input
              {...register("verificacao_responsavel")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-gray-900">
          11. Status da Não Conformidade
        </h2>
        <select
          {...register("status")}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          {statusOptions.map((item) => (
            <option key={item} value={item}>
              {NC_STATUS_LABEL[item]}
            </option>
          ))}
        </select>
        {errors.status && (
          <p className="mt-1 text-xs text-red-500">{errors.status.message}</p>
        )}
      </div>

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-gray-900">
          12. Observações Gerais
        </h2>
        <textarea
          {...register("observacoes_gerais")}
          rows={3}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-bold text-gray-700">
              Fotos / registros anexos
            </label>
            <button
              type="button"
              onClick={() => appendAnexo({ url: "" })}
              className="flex items-center space-x-2 text-sm font-medium text-[var(--ds-color-text-primary)] hover:text-[var(--ds-color-text-primary)]"
            >
              <Plus className="h-4 w-4" />
              <span>Adicionar anexo</span>
            </button>
          </div>
          <div className="mb-3">
            <button
              type="button"
              onClick={startCamera}
              className="inline-flex items-center space-x-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-[var(--ds-color-text-primary)] hover:bg-blue-100"
            >
              <Camera className="h-4 w-4" />
              <span>Capturar foto</span>
            </button>
          </div>
          <div className="space-y-2">
            {watchedAnexos.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-3">
                {watchedAnexos.map((item, index) => {
                  const url = String(item?.url || "");
                  const previewLabel =
                    sophiePreview?.evidenceAttachments?.find((entry) => entry.url === url)
                      ?.label || `Anexo ${index + 1}`;

                  if (!url) {
                    return null;
                  }

                  return (
                    <div
                      key={`${url}-${index}`}
                      className="overflow-hidden rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]"
                    >
                      {isImageAttachment(url) ? (
                        <img
                          src={url}
                          alt={previewLabel}
                          className="h-32 w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-32 items-center justify-center bg-slate-100 px-4 text-center text-xs text-slate-500">
                          Arquivo anexado
                        </div>
                      )}
                      <div className="p-3">
                        <p className="text-xs font-semibold text-[var(--ds-color-text-primary)]">
                          {previewLabel}
                        </p>
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex text-[11px] font-semibold text-[var(--ds-color-action-primary)] hover:underline"
                        >
                          Abrir anexo
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {anexosFields.map((field, index) => (
              <div key={field.id} className="flex items-center space-x-2">
                <input
                  {...register(`anexos.${index}.url` as const)}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                  placeholder="URL ou identificação do anexo"
                />
                <button
                  type="button"
                  onClick={() => removeAnexo(index)}
                  className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-red-500"
                  title="Remover anexo"
                  aria-label={`Remover anexo ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isCameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                Capturar foto
              </h3>
              <button
                type="button"
                onClick={stopCamera}
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-3 overflow-hidden rounded-lg border">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="h-64 w-full bg-black"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <div className="flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={capturePhoto}
                className="inline-flex items-center space-x-2 rounded-md bg-[var(--ds-color-action-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--ds-color-action-primary-hover)]"
              >
                <Camera className="h-4 w-4" />
                <span>Capturar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-gray-900">
          13. Assinaturas
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">
              Responsável pela área
            </label>
            <input
              {...register("assinatura_responsavel_area")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">
              Técnico / Auditor de SST
            </label>
            <input
              {...register("assinatura_tecnico_auditor")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">
              Gestão / Coordenação
            </label>
            <input
              {...register("assinatura_gestao")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end space-x-3">
        <button
          type="button"
          onClick={() => router.push("/dashboard/nonconformities")}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading || isSubmitting || !isValid}
          className="flex items-center space-x-2 rounded-lg bg-[var(--ds-color-action-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--ds-color-action-primary-hover)] disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Salvando...</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>Salvar</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}


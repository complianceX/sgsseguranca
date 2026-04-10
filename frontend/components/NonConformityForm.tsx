"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
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
  parseGovernedNcAttachmentReference,
} from "@/services/nonConformitiesService";
import { sitesService, Site } from "@/services/sitesService";
import { getFormErrorMessage } from "@/lib/error-handler";
import { attachPdfIfProvided } from "@/lib/document-upload";
import { readSophieNcPreview, SophieNcPreview } from "@/lib/sophie-draft-storage";
import { usePermissions } from "@/hooks/usePermissions";
import { selectedTenantStore } from "@/lib/selectedTenantStore";
import { sessionStore } from "@/lib/sessionStore";
import { toInputDateValue } from "@/lib/date/safeFormat";
import { PageHeader } from "@/components/layout";
import { PageLoadingState } from "@/components/ui/state";
import { StatusPill } from "@/components/ui/status-pill";

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
      return "border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)]";
    case "high":
      return "border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)]";
    case "medium":
      return "border-[var(--ds-color-info-border)] bg-[var(--ds-color-info-subtle)] text-[var(--ds-color-info)]";
    default:
      return "border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)]";
  }
}

function resolveRiskLevelClass(riskLevel?: string) {
  switch (riskLevel) {
    case "Crítico":
      return "border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)]";
    case "Alto":
      return "border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)]";
    case "Médio":
      return "border-[var(--ds-color-info-border)] bg-[var(--ds-color-info-subtle)] text-[var(--ds-color-info)]";
    default:
      return "border-[var(--ds-color-success-border)] bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)]";
  }
}

export function NonConformityForm({ id }: NonConformityFormProps) {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const canManageNc = hasPermission("can_manage_nc");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState(
    () => selectedTenantStore.get()?.companyId || sessionStore.get()?.companyId || "",
  );
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [sophiePreview, setSophiePreview] = useState<SophieNcPreview | null>(null);
  const [uploadingGovernedAttachment, setUploadingGovernedAttachment] =
    useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const governedAttachmentInputRef = useRef<HTMLInputElement | null>(null);

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
    replace: replaceAnexos,
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

  const handleGovernedAttachmentUpload = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!id) {
      toast.info(
        "Salve a não conformidade primeiro para anexar evidências no storage oficial.",
      );
      event.target.value = "";
      return;
    }

    if (!canManageNc) {
      toast.error("Você não tem permissão para anexar evidências nesta NC.");
      event.target.value = "";
      return;
    }

    try {
      setUploadingGovernedAttachment(true);
      const result = await nonConformitiesService.attachAttachment(id, file);
      replaceAnexos(result.attachments.map((url) => ({ url })));
      toast.success("Anexo governado salvo com sucesso.");
      if (result.message) {
        toast.info(result.message);
      }
    } catch (error) {
      console.error("Erro ao anexar evidência governada:", error);
      toast.error("Não foi possível salvar o anexo governado.");
    } finally {
      setUploadingGovernedAttachment(false);
      event.target.value = "";
    }
  };

  const handleOpenGovernedAttachment = async (_index: number, url: string) => {
    if (!id) {
      toast.info(
        "Salve a não conformidade primeiro para abrir anexos governados.",
      );
      return;
    }

    const metadata = parseGovernedNcAttachmentReference(url);
    if (!metadata) {
      toast.error("A referência do anexo governado está inválida.");
      return;
    }

    try {
      const savedNc = await nonConformitiesService.findOne(id);
      const savedIndex = (savedNc.anexos || []).findIndex((item) => item === url);
      if (savedIndex < 0) {
        toast.warning(
          "Esse anexo governado ainda não foi persistido no backend. Salve a NC antes de abri-lo.",
        );
        return;
      }

      const access = await nonConformitiesService.getAttachmentAccess(id, savedIndex);
      if (access.url) {
        window.open(access.url, "_blank", "noopener,noreferrer");
        return;
      }

      toast.warning(
        access.message ||
          `O anexo governado ${metadata.originalName} está registrado, mas indisponível para abertura no momento.`,
      );
    } catch (error) {
      console.error("Erro ao abrir anexo governado:", error);
      toast.error("Não foi possível abrir o anexo governado.");
    }
  };

  useEffect(() => {
    const unsubscribe = selectedTenantStore.subscribe((tenant) => {
      setActiveCompanyId(tenant?.companyId || sessionStore.get()?.companyId || "");
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        const sitesPage = activeCompanyId
          ? await sitesService.findPaginated({
              page: 1,
              limit: 200,
              companyId: activeCompanyId,
            })
          : { data: [], total: 0, page: 1, lastPage: 1 };
        setSites(sitesPage.data);
        if (sitesPage.lastPage > 1) {
          toast.warning(
            "A lista de sites foi limitada aos primeiros 200 registros.",
          );
        }
        if (id) {
          const nonConformity = await nonConformitiesService.findOne(id);
          reset({
            ...nonConformity,
            status: normalizeNcStatus(nonConformity.status),
            data_identificacao: toInputDateValue(nonConformity.data_identificacao),
            acao_imediata_data: toInputDateValue(nonConformity.acao_imediata_data) || undefined,
            acao_definitiva_prazo: toInputDateValue(nonConformity.acao_definitiva_prazo) || undefined,
            acao_definitiva_data_prevista:
              toInputDateValue(nonConformity.acao_definitiva_data_prevista) || undefined,
            verificacao_data: toInputDateValue(nonConformity.verificacao_data) || undefined,
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
  }, [activeCompanyId, id, reset]);

  useEffect(() => {
    if (!id) {
      setSophiePreview(null);
      return;
    }

    setSophiePreview(readSophieNcPreview(id));
  }, [id]);

  const onSubmit = async (data: NonConformityFormData) => {
    if (!canManageNc) {
      setSubmitError(
        "Você não tem permissão para salvar esta não conformidade.",
      );
      toast.error("Você não tem permissão para salvar esta não conformidade.");
      return;
    }

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
      <PageLoadingState
        title={id ? 'Carregando não conformidade' : 'Preparando não conformidade'}
        description="Buscando site, anexos, dados da NC e contexto operacional para montar o formulário."
        cards={3}
        tableRows={4}
      />
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
      <PageHeader
        eyebrow="Gestão de não conformidades"
        title={id ? "Editar não conformidade" : "Nova não conformidade"}
        description="Registre a origem do desvio, o risco associado, o plano de ação e as evidências em um único fluxo."
        icon={<X className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusPill tone="danger">NC</StatusPill>
            <StatusPill tone={id ? "warning" : "success"}>
              {id ? "Edição" : "Novo cadastro"}
            </StatusPill>
            <StatusPill tone={canManageNc ? "success" : "warning"}>
              {canManageNc ? "Edição liberada" : "Somente leitura"}
            </StatusPill>
          </div>
        }
      />
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/22 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
          Fluxo guiado
        </p>
        <p className="mt-2 text-sm font-semibold text-[var(--ds-color-text-primary)]">
          Consolide o desvio, valide a criticidade e desdobre ações corretivas com evidências rastreáveis.
        </p>
        <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
          Revise tipo, local, risco e plano de ação antes de salvar para manter o processo de NC consistente.
        </p>
      </div>
      {!canManageNc ? (
        <div
          role="alert"
          className="rounded-lg border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] px-4 py-3 text-sm text-[var(--ds-color-warning-fg)]"
        >
          <p className="font-semibold">Modo somente leitura</p>
          <p className="mt-1 text-[color:var(--ds-color-warning-fg)]/90">
            Você está em modo somente leitura para não conformidades. Edição e emissão final exigem a permissão <code>can_manage_nc</code>.
          </p>
        </div>
      ) : null}
      {submitError && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] px-4 py-3 text-sm text-[var(--ds-color-danger-fg)]"
        >
          <p className="font-semibold">Não foi possível salvar a não conformidade</p>
          <p className="mt-1 text-[color:var(--ds-color-danger-fg)]/90">{submitError}</p>
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
                <span className="rounded-full border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--ds-color-text-secondary)]">
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
                      <span className="rounded-full border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ds-color-text-secondary)]">
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
                      // eslint-disable-next-line @next/next/no-img-element -- Evidence previews accept arbitrary external/data URLs and cannot rely on Next image optimization.
                      <img
                        src={item.url}
                        alt={item.label}
                        className="h-40 w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-40 items-center justify-center bg-[var(--ds-color-surface-muted)] px-4 text-center text-xs text-[var(--ds-color-text-muted)]">
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
        <h2 className="mb-4 text-lg font-bold text-[var(--ds-color-text-primary)]">
          1. Identificação da Não Conformidade
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label
              htmlFor="nc-codigo"
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Código da NC
            </label>
            <input
              id="nc-codigo"
              {...register("codigo_nc")}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                errors.codigo_nc ? "border-[var(--ds-color-danger)]" : ""
              }`}
              aria-invalid={errors.codigo_nc ? "true" : undefined}
            />
            {errors.codigo_nc && (
              <p className="mt-1 text-xs text-[var(--ds-color-danger)]">
                {errors.codigo_nc.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="nc-tipo"
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Tipo
            </label>
            <select
              id="nc-tipo"
              {...register("tipo")}
              aria-label="Tipo da não conformidade"
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                errors.tipo ? "border-[var(--ds-color-danger)]" : ""
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
              <p className="mt-1 text-xs text-[var(--ds-color-danger)]">{errors.tipo.message}</p>
            )}
          </div>
          <div>
            <label
              htmlFor="nc-data-identificacao"
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Data da identificação
            </label>
            <input
              id="nc-data-identificacao"
              type="date"
              {...register("data_identificacao")}
              aria-label="Data da identificação"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label
              htmlFor="nc-site-id"
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Site / Unidade
            </label>
            <select
              id="nc-site-id"
              {...register("site_id")}
              aria-label="Site ou unidade da não conformidade"
              className="w-full rounded-md border px-3 py-2 text-sm"
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
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Local / Setor / Área
            </label>
            <input
              id="nc-local-setor-area"
              {...register("local_setor_area")}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                errors.local_setor_area ? "border-[var(--ds-color-danger)]" : ""
              }`}
              aria-invalid={errors.local_setor_area ? "true" : undefined}
            />
            {errors.local_setor_area && (
              <p className="mt-1 text-xs text-[var(--ds-color-danger)]">
                {errors.local_setor_area.message}
              </p>
            )}
          </div>
          <div className="md:col-span-2">
            <label
              htmlFor="nc-atividade-envolvida"
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Atividade envolvida
            </label>
            <input
              id="nc-atividade-envolvida"
              {...register("atividade_envolvida")}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                errors.atividade_envolvida
                  ? "border-[var(--ds-color-danger)]"
                  : ""
              }`}
              aria-invalid={errors.atividade_envolvida ? "true" : undefined}
            />
            {errors.atividade_envolvida && (
              <p className="mt-1 text-xs text-[var(--ds-color-danger)]">
                {errors.atividade_envolvida.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="nc-responsavel-area"
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Responsável pela área
            </label>
            <input
              id="nc-responsavel-area"
              {...register("responsavel_area")}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                errors.responsavel_area ? "border-[var(--ds-color-danger)]" : ""
              }`}
              aria-invalid={errors.responsavel_area ? "true" : undefined}
            />
            {errors.responsavel_area && (
              <p className="mt-1 text-xs text-[var(--ds-color-danger)]">
                {errors.responsavel_area.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="nc-auditor-responsavel"
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Auditor / Técnico / Inspetor
            </label>
            <input
              id="nc-auditor-responsavel"
              {...register("auditor_responsavel")}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                errors.auditor_responsavel
                  ? "border-[var(--ds-color-danger)]"
                  : ""
              }`}
              aria-invalid={errors.auditor_responsavel ? "true" : undefined}
            />
            {errors.auditor_responsavel && (
              <p className="mt-1 text-xs text-[var(--ds-color-danger)]">
                {errors.auditor_responsavel.message}
              </p>
            )}
          </div>
          <div className="md:col-span-3">
            <label
              htmlFor="nc-pdf-file"
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Anexar PDF da NC (opcional)
            </label>
            <input
              id="nc-pdf-file"
              type="file"
              accept="application/pdf"
              aria-label="Selecionar PDF da não conformidade"
              onChange={(event) => setPdfFile(event.target.files?.[0] || null)}
              className="w-full rounded-md border px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-[var(--ds-color-surface-muted)] file:px-3 file:py-1.5 file:font-semibold file:text-[var(--ds-color-text-secondary)] hover:file:bg-[var(--ds-color-primary-subtle)]"
            />
          </div>
        </div>
      </div>

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-[var(--ds-color-text-primary)]">
          2. Classificação da Não Conformidade
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {classificacaoOptions.map((option) => (
            <label key={option} className="flex items-center space-x-3 text-sm">
              <input
                type="checkbox"
                value={option}
                {...register("classificacao")}
                className="h-4 w-4 rounded border-[var(--ds-color-border-default)] accent-[var(--ds-color-action-primary)]"
              />
              <span className="text-[var(--ds-color-text-secondary)]">{option}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-[var(--ds-color-text-primary)]">
          3. Descrição da Não Conformidade
        </h2>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="nc-descricao"
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Descrição
            </label>
            <textarea
              id="nc-descricao"
              {...register("descricao")}
              aria-label="Descrição da não conformidade"
              rows={3}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            {errors.descricao && (
              <p className="mt-1 text-xs text-[var(--ds-color-danger)]">
                {errors.descricao.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="nc-evidencia-observada"
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Evidência observada
            </label>
            <textarea
              id="nc-evidencia-observada"
              {...register("evidencia_observada")}
              aria-label="Evidência observada"
              rows={3}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            {errors.evidencia_observada && (
              <p className="mt-1 text-xs text-[var(--ds-color-danger)]">
                {errors.evidencia_observada.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="nc-condicao-insegura"
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Condição insegura identificada
            </label>
            <textarea
              id="nc-condicao-insegura"
              {...register("condicao_insegura")}
              aria-label="Condição insegura identificada"
              rows={2}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            {errors.condicao_insegura && (
              <p className="mt-1 text-xs text-[var(--ds-color-danger)]">
                {errors.condicao_insegura.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="nc-ato-inseguro"
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Ato inseguro
            </label>
            <textarea
              id="nc-ato-inseguro"
              {...register("ato_inseguro")}
              aria-label="Ato inseguro"
              rows={2}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-[var(--ds-color-text-primary)]">
          4. Requisito Não Atendido
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="nc-requisito-nr"
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Norma Regulamentadora
            </label>
            <input
              id="nc-requisito-nr"
              {...register("requisito_nr")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            {errors.requisito_nr && (
              <p className="mt-1 text-xs text-[var(--ds-color-danger)]">
                {errors.requisito_nr.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="nc-requisito-item"
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Item / Subitem
            </label>
            <input
              id="nc-requisito-item"
              {...register("requisito_item")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            {errors.requisito_item && (
              <p className="mt-1 text-xs text-[var(--ds-color-danger)]">
                {errors.requisito_item.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="nc-requisito-procedimento"
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Procedimento interno
            </label>
            <input
              id="nc-requisito-procedimento"
              {...register("requisito_procedimento")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="nc-requisito-politica"
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Política de SST
            </label>
            <input
              id="nc-requisito-politica"
              {...register("requisito_politica")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-[var(--ds-color-text-primary)]">
          5. Análise de Risco Associada
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="nc-risco-perigo"
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Perigo identificado
            </label>
            <input
              id="nc-risco-perigo"
              {...register("risco_perigo")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            {errors.risco_perigo && (
              <p className="mt-1 text-xs text-[var(--ds-color-danger)]">
                {errors.risco_perigo.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="nc-risco-associado"
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Risco associado
            </label>
            <input
              id="nc-risco-associado"
              {...register("risco_associado")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            {errors.risco_associado && (
              <p className="mt-1 text-xs text-[var(--ds-color-danger)]">
                {errors.risco_associado.message}
              </p>
            )}
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">
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
                  className="h-4 w-4 rounded border-[var(--ds-color-border-default)] accent-[var(--ds-color-action-primary)]"
                />
                <span className="text-[var(--ds-color-text-secondary)]">{option}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <label
            htmlFor="nc-risco-nivel"
            className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
          >
            Nível de risco
          </label>
          <select
            id="nc-risco-nivel"
            {...register("risco_nivel")}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            {niveisRisco.map((nivel) => (
              <option key={nivel} value={nivel}>
                {nivel}
              </option>
            ))}
          </select>
          {errors.risco_nivel && (
            <p className="mt-1 text-xs text-[var(--ds-color-danger)]">
              {errors.risco_nivel.message}
            </p>
          )}
        </div>
      </div>

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-[var(--ds-color-text-primary)]">
          6. Causa da Não Conformidade
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {causasOptions.map((option) => (
            <label key={option} className="flex items-center space-x-3 text-sm">
              <input
                type="checkbox"
                value={option}
                {...register("causa")}
                className="h-4 w-4 rounded border-[var(--ds-color-border-default)] accent-[var(--ds-color-action-primary)]"
              />
              <span className="text-[var(--ds-color-text-secondary)]">{option}</span>
            </label>
          ))}
        </div>
        <div className="mt-4">
          <label
            htmlFor="nc-causa-outro"
            className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
          >
            Outro (descrever)
          </label>
          <input
            id="nc-causa-outro"
            {...register("causa_outro")}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-[var(--ds-color-text-primary)]">
          7. Ação Corretiva Imediata
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label
              htmlFor="nc-acao-imediata-descricao"
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Medida adotada
            </label>
            <textarea
              id="nc-acao-imediata-descricao"
              {...register("acao_imediata_descricao")}
              rows={2}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="nc-acao-imediata-data"
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Data da ação
            </label>
            <input
              id="nc-acao-imediata-data"
              type="date"
              {...register("acao_imediata_data")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="nc-acao-imediata-responsavel"
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Responsável
            </label>
            <input
              id="nc-acao-imediata-responsavel"
              {...register("acao_imediata_responsavel")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="nc-acao-imediata-status"
              className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]"
            >
              Status
            </label>
            <select
              id="nc-acao-imediata-status"
              {...register("acao_imediata_status")}
              className="w-full rounded-md border px-3 py-2 text-sm"
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
        <h2 className="mb-4 text-lg font-bold text-[var(--ds-color-text-primary)]">
          8. Ação Corretiva Definitiva
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">
              Descrição detalhada
            </label>
            <textarea
              {...register("acao_definitiva_descricao")}
              rows={2}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">
              Prazo para implementação
            </label>
            <input
              type="date"
              {...register("acao_definitiva_prazo")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">
              Responsável pela execução
            </label>
            <input
              {...register("acao_definitiva_responsavel")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">
              Recursos necessários
            </label>
            <input
              {...register("acao_definitiva_recursos")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">
              Data prevista de conclusão
            </label>
            <input
              type="date"
              {...register("acao_definitiva_data_prevista")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-[var(--ds-color-text-primary)]">
          9. Ação Preventiva
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">
              Medidas para evitar reincidência
            </label>
            <textarea
              {...register("acao_preventiva_medidas")}
              rows={2}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">
              Treinamento necessário
            </label>
            <input
              {...register("acao_preventiva_treinamento")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">
              Revisão de procedimento
            </label>
            <input
              {...register("acao_preventiva_revisao_procedimento")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">
              Melhoria de processo
            </label>
            <input
              {...register("acao_preventiva_melhoria_processo")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">
              Implementação de EPC / EPI
            </label>
            <input
              {...register("acao_preventiva_epc_epi")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-[var(--ds-color-text-primary)]">
          10. Verificação de Eficácia
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">
              Ação eliminou ou reduziu o risco?
            </label>
            <select
              {...register("verificacao_resultado")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              {resultadoEficacia.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">
              Data da verificação
            </label>
            <input
              type="date"
              {...register("verificacao_data")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">
              Evidências
            </label>
            <textarea
              {...register("verificacao_evidencias")}
              rows={2}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">
              Responsável pela validação
            </label>
            <input
              {...register("verificacao_responsavel")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-[var(--ds-color-text-primary)]">
          11. Status da Não Conformidade
        </h2>
        <select
          {...register("status")}
          className="w-full rounded-md border px-3 py-2 text-sm"
        >
          {statusOptions.map((item) => (
            <option key={item} value={item}>
              {NC_STATUS_LABEL[item]}
            </option>
          ))}
        </select>
        {errors.status && (
          <p className="mt-1 text-xs text-[var(--ds-color-danger)]">{errors.status.message}</p>
        )}
      </div>

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-[var(--ds-color-text-primary)]">
          12. Observações Gerais
        </h2>
        <textarea
          {...register("observacoes_gerais")}
          rows={3}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-bold text-[var(--ds-color-text-secondary)]">
              Fotos / registros anexos
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => appendAnexo({ url: "" })}
                disabled={!canManageNc}
                className="flex items-center space-x-2 text-sm font-medium text-[var(--ds-color-text-primary)] hover:text-[var(--ds-color-text-primary)]"
              >
                <Plus className="h-4 w-4" />
                <span>Adicionar URL</span>
              </button>
              <input
                ref={governedAttachmentInputRef}
                type="file"
                accept=".pdf,image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleGovernedAttachmentUpload}
              />
              <button
                type="button"
                onClick={() => {
                  if (!id) {
                    toast.info(
                      "Salve a não conformidade primeiro para anexar arquivos governados.",
                    );
                    return;
                  }
                  governedAttachmentInputRef.current?.click();
                }}
                disabled={!canManageNc || uploadingGovernedAttachment}
                className="inline-flex items-center space-x-2 rounded-md border border-[var(--ds-color-success-border)] bg-[var(--ds-color-success-subtle)] px-3 py-1.5 text-sm font-medium text-[var(--ds-color-text-primary)] hover:bg-[var(--ds-color-success-subtle)] disabled:opacity-60"
              >
                {uploadingGovernedAttachment ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                <span>Upload governado</span>
              </button>
            </div>
          </div>
          <div className="mb-3">
            <button
              type="button"
              onClick={startCamera}
              disabled={!canManageNc}
              className="inline-flex items-center space-x-2 rounded-md border border-[var(--ds-color-border-default)] bg-[var(--ds-color-primary-subtle)] px-3 py-1.5 text-sm font-medium text-[var(--ds-color-text-primary)] hover:bg-[var(--ds-color-primary-subtle)]"
            >
              <Camera className="h-4 w-4" />
              <span>Capturar foto</span>
            </button>
          </div>
          <p className="mb-3 text-xs text-[var(--ds-color-text-muted)]">
            Para evidência oficial, prefira o upload governado no storage da plataforma. URLs manuais e fotos capturadas aqui permanecem como exceção operacional; o backend aceita anexos inline apenas dentro do limite de 1 MB por anexo.
          </p>
          {!id ? (
            <p className="mb-3 text-xs text-[var(--ds-color-warning)]">
              Salve a não conformidade primeiro para anexar arquivos governados. Antes disso, apenas URL manual ou captura inline ficam disponíveis.
            </p>
          ) : null}
          <div className="space-y-2">
            {watchedAnexos.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-3">
                {watchedAnexos.map((item, index) => {
                  const url = String(item?.url || "");
                  const governedAttachment =
                    parseGovernedNcAttachmentReference(url);
                  const previewLabel =
                    sophiePreview?.evidenceAttachments?.find((entry) => entry.url === url)
                      ?.label ||
                    governedAttachment?.originalName ||
                    `Anexo ${index + 1}`;

                  if (!url) {
                    return null;
                  }

                  return (
                    <div
                      key={`${url}-${index}`}
                      className="overflow-hidden rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]"
                    >
                      {isImageAttachment(url) ? (
                        // eslint-disable-next-line @next/next/no-img-element -- Attachment previews accept arbitrary external/data URLs and must render without image optimization constraints.
                        <img
                          src={url}
                          alt={previewLabel}
                          className="h-32 w-full object-cover"
                        />
                      ) : governedAttachment ? (
                        <div className="flex h-32 flex-col items-center justify-center gap-2 bg-[var(--ds-color-success-subtle)] px-4 text-center text-xs text-[var(--ds-color-success)]">
                          <span className="rounded-full bg-[var(--ds-color-success-subtle)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-success)]">
                            Governado
                          </span>
                          <span className="font-medium">{governedAttachment.originalName}</span>
                        </div>
                      ) : (
                        <div className="flex h-32 items-center justify-center bg-[var(--ds-color-surface-muted)] px-4 text-center text-xs text-[var(--ds-color-text-muted)]">
                          Arquivo anexado
                        </div>
                      )}
                      <div className="p-3">
                        <p className="text-xs font-semibold text-[var(--ds-color-text-primary)]">
                          {previewLabel}
                        </p>
                        {governedAttachment ? (
                          <button
                            type="button"
                            onClick={() => void handleOpenGovernedAttachment(index, url)}
                            className="mt-2 inline-flex text-[11px] font-semibold text-[var(--ds-color-action-primary)] hover:underline"
                          >
                            Abrir anexo governado
                          </button>
                        ) : (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex text-[11px] font-semibold text-[var(--ds-color-action-primary)] hover:underline"
                          >
                            Abrir anexo
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {anexosFields.map((field, index) => {
              const currentValue = String(watchedAnexos[index]?.url || "");
              const governedAttachment =
                parseGovernedNcAttachmentReference(currentValue);

              return (
                <div key={field.id} className="flex items-center space-x-2">
                  {governedAttachment ? (
                    <div className="flex flex-1 items-center justify-between rounded-md border border-[var(--ds-color-success-border)] bg-[var(--ds-color-success-subtle)] px-3 py-2 text-sm text-[var(--ds-color-success)]">
                      <div>
                        <p className="font-medium">{governedAttachment.originalName}</p>
                        <p className="text-xs text-[var(--ds-color-success)]">
                          Anexo governado salvo no storage oficial.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleOpenGovernedAttachment(index, currentValue)}
                        className="text-xs font-semibold text-[var(--ds-color-action-primary)] hover:underline"
                      >
                        Abrir
                      </button>
                    </div>
                  ) : (
                    <input
                      {...register(`anexos.${index}.url` as const)}
                      className="flex-1 rounded-md border px-3 py-2 text-sm"
                      placeholder="URL ou identificação do anexo"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removeAnexo(index)}
                    disabled={!canManageNc}
                    className="rounded-md p-2 text-[var(--ds-color-text-muted)] hover:bg-[var(--ds-color-danger-subtle)] hover:text-[var(--ds-color-danger)]"
                    title="Remover anexo"
                    aria-label={`Remover anexo ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>

        </div>
      </div>

      {isCameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                Capturar foto
              </h3>
              <button
                type="button"
                onClick={stopCamera}
                className="rounded-md p-2 text-[var(--ds-color-text-muted)] hover:bg-[var(--ds-color-primary-subtle)] hover:text-[var(--ds-color-text-primary)]"
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
                className="inline-flex items-center space-x-2 rounded-md bg-[var(--ds-color-action-primary)] px-4 py-2 text-sm font-medium text-[var(--ds-color-action-primary-foreground)] hover:bg-[var(--ds-color-action-primary-hover)]"
              >
                <Camera className="h-4 w-4" />
                <span>Capturar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-[var(--ds-color-text-primary)]">
          13. Assinaturas
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">
              Responsável pela área
            </label>
            <input
              {...register("assinatura_responsavel_area")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">
              Técnico / Auditor de SST
            </label>
            <input
              {...register("assinatura_tecnico_auditor")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">
              Gestão / Coordenação
            </label>
            <input
              {...register("assinatura_gestao")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end space-x-3">
        <button
          type="button"
          onClick={() => router.push("/dashboard/nonconformities")}
          className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] px-4 py-2 text-sm font-medium text-[var(--ds-color-text-secondary)] hover:bg-[var(--ds-color-surface-muted)]"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading || isSubmitting || !isValid || !canManageNc}
          className="flex items-center space-x-2 rounded-lg bg-[var(--ds-color-action-primary)] px-4 py-2 text-sm font-medium text-[var(--ds-color-action-primary-foreground)] hover:bg-[var(--ds-color-action-primary-hover)] disabled:opacity-60"
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

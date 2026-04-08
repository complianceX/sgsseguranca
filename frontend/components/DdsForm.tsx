"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ddsService, type Dds } from "@/services/ddsService";
import { sitesService, Site } from "@/services/sitesService";
import { usersService, User } from "@/services/usersService";
import { useForm } from "react-hook-form";
import type { FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  ArrowLeft,
  Save,
  Sparkles,
  Loader2,
  Camera,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import NextImage from "next/image";
import { toast } from "sonner";
import { companiesService, Company } from "@/services/companiesService";
import { aiService } from "@/services/aiService";
import { isAiEnabled } from "@/lib/featureFlags";
import { SignatureModal } from "../app/dashboard/checklists/components/SignatureModal";
import { signaturesService } from "@/services/signaturesService";
import { extractApiErrorMessage, getFormErrorMessage } from "@/lib/error-handler";
import { selectedTenantStore } from "@/lib/selectedTenantStore";
import { sessionStore } from "@/lib/sessionStore";
import { isAdminGeralAccount } from "@/lib/auth-session-state";
import { usePermissions } from "@/hooks/usePermissions";
import { useDocumentVideos } from "@/hooks/useDocumentVideos";
import { DocumentVideoPanel } from "@/components/document-videos/DocumentVideoPanel";
import { safeToLocaleDateString, toInputDateValue } from "@/lib/date/safeFormat";

const ddsSchema = z.object({
  tema: z.string().min(5, "O tema deve ter pelo menos 5 caracteres"),
  conteudo: z.string().optional(),
  data: z.string(),
  company_id: z.string().min(1, "Selecione uma empresa"),
  site_id: z.string().min(1, "Selecione um site"),
  facilitador_id: z.string().min(1, "Selecione um facilitador"),
  participants: z
    .array(z.string())
    .min(1, "Selecione pelo menos um participante"),
});

type DdsFormData = z.infer<typeof ddsSchema>;

interface DdsFormProps {
  id?: string;
}

type TeamPhotoEvidence = {
  imageData: string;
  capturedAt: string;
  hash: string;
  metadata: TeamPhotoMetadata;
};

type TeamPhotoMetadata = {
  userAgent: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
};

type HistoricalPhotoReference = {
  ddsId: string;
  tema: string;
  data: string;
};

const TEAM_PHOTO_SIGNATURE_PREFIX = "team_photo";
const TEAM_PHOTO_REUSE_JUSTIFICATION_TYPE = "team_photo_reuse_justification";
const UUID_LIKE_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidLike(value?: string | null): value is string {
  return typeof value === "string" && UUID_LIKE_REGEX.test(value.trim());
}

function buildSignatureSnapshot(input: {
  participantIds: string[];
  signatures: Record<string, { data: string; type: string }>;
  teamPhotos: TeamPhotoEvidence[];
  photoReuseJustification: string;
}) {
  const participants = [...input.participantIds].sort();
  const normalizedSignatures = participants.map((participantId) => {
    const signature = input.signatures[participantId];
    return {
      participantId,
      type: signature?.type || "",
      data: signature?.data || "",
    };
  });
  const normalizedPhotos = [...input.teamPhotos]
    .map((photo) => ({
      hash: photo.hash,
      capturedAt: photo.capturedAt,
      imageData: photo.imageData,
      metadata: photo.metadata,
    }))
    .sort((first, second) => first.hash.localeCompare(second.hash));

  return JSON.stringify({
    participants,
    normalizedSignatures,
    normalizedPhotos,
    photoReuseJustification: String(input.photoReuseJustification || "").trim(),
  });
}

export function DdsForm({ id }: DdsFormProps) {
  const { hasPermission } = usePermissions();
  const canManageDds = hasPermission("can_manage_dds");
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillCompanyIdParam = searchParams.get("company_id") || "";
  const selectedTenantCompanyId = selectedTenantStore.get()?.companyId || null;
  const sessionCompanyId = sessionStore.get()?.companyId || null;
  const prefillCompanyId = isUuidLike(prefillCompanyIdParam)
    ? prefillCompanyIdParam
    : isUuidLike(selectedTenantCompanyId)
      ? selectedTenantCompanyId
      : isUuidLike(sessionCompanyId)
        ? sessionCompanyId
        : "";
  const prefillSiteId = searchParams.get("site_id") || "";
  const prefillFacilitatorId =
    searchParams.get("facilitador_id") || searchParams.get("user_id") || "";
  const prefillTitle = searchParams.get("title") || "";
  const prefillDescription = searchParams.get("description") || "";
  const resumeSignatures = searchParams.get("resume_signatures") === "1";
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [suggesting, setSuggesting] = useState(false);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentDds, setCurrentDds] = useState<Dds | null>(null);

  // Signature States
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [currentSigningUser, setCurrentSigningUser] = useState<User | null>(
    null,
  );
  const [signatures, setSignatures] = useState<
    Record<string, { data: string; type: string }>
  >({});
  const [teamPhotos, setTeamPhotos] = useState<TeamPhotoEvidence[]>([]);
  const [historicalPhotoHashes, setHistoricalPhotoHashes] = useState<
    Record<string, HistoricalPhotoReference>
  >({});
  const [photoReuseWarnings, setPhotoReuseWarnings] = useState<
    Record<string, HistoricalPhotoReference>
  >({});
  const [photoReuseJustification, setPhotoReuseJustification] = useState("");
  const [initialSignatureSnapshot, setInitialSignatureSnapshot] = useState<
    string | null
  >(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    setFocus,
    formState: { errors, isValid, isSubmitting },
  } = useForm<DdsFormData>({
    resolver: zodResolver(ddsSchema),
    mode: "onBlur",
    reValidateMode: "onBlur",
    defaultValues: {
      tema: prefillTitle,
      conteudo: prefillDescription,
      data: new Date().toISOString().split("T")[0],
      company_id: prefillCompanyId,
      site_id: prefillSiteId,
      facilitador_id: prefillFacilitatorId,
      participants: prefillFacilitatorId ? [prefillFacilitatorId] : [],
    },
  });

  const selectedCompanyId = watch("company_id");
  const isAdminGeral = isAdminGeralAccount(
    sessionStore.get()?.profileName,
    sessionStore.get()?.roles || [],
  );
  const filteredSites = sites.filter(
    (site) => site.company_id === selectedCompanyId,
  );
  const filteredUsers = users.filter(
    (user) => user.company_id === selectedCompanyId,
  );
  const selectedParticipantIds = watch("participants") || [];
  const ddsReadOnly = Boolean(currentDds?.pdf_file_key) ||
    currentDds?.status === "arquivado";
  const ddsReadOnlyMessage = currentDds?.pdf_file_key
    ? "Este DDS já possui PDF final governado e está em modo somente leitura."
    : currentDds?.status === "arquivado"
      ? "Este DDS está arquivado e não aceita novas alterações pelo fluxo comum."
      : null;
  const ddsVideoLocked = Boolean(currentDds?.pdf_file_key) ||
    currentDds?.status === "arquivado" ||
    Boolean(currentDds?.is_modelo);
  const ddsVideoLockMessage = currentDds?.is_modelo
    ? "Modelos de DDS não aceitam vídeos operacionais."
    : currentDds?.pdf_file_key
      ? "O DDS já possui PDF final emitido."
      : currentDds?.status === "arquivado"
        ? "O DDS está arquivado."
        : null;
  const documentVideos = useDocumentVideos({
    documentId: id,
    enabled: Boolean(id),
    loadVideos: ddsService.listVideoAttachments,
    uploadVideo: ddsService.uploadVideoAttachment,
    removeVideo: ddsService.removeVideoAttachment,
    getVideoAccess: ddsService.getVideoAttachmentAccess,
    labels: {
      loadError: "Não foi possível carregar os vídeos do DDS.",
      uploadSuccess: "Vídeo anexado ao DDS.",
      uploadError: "Não foi possível anexar o vídeo ao DDS.",
      removeSuccess: "Vídeo removido do DDS.",
      removeError: "Não foi possível remover o vídeo do DDS.",
      accessError: "Não foi possível abrir o vídeo do DDS.",
    },
  });

  const handleAiSuggestion = async () => {
    if (!isAiEnabled()) {
      toast.error("IA desativada neste ambiente.");
      return;
    }
    try {
      setSuggesting(true);
      const result = await aiService.generateDds();

      setValue("tema", result.tema);
      setValue("conteudo", result.conteudo);

      toast.success("SGS sugeriu um tema para o DDS!", {
        description: result.explanation,
        duration: 5000,
      });
    } catch (error) {
      console.error("Erro na sugestão do SGS:", error);
      toast.error("Não foi possível obter uma sugestão no momento.");
    } finally {
      setSuggesting(false);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        let companiesData: Company[] = [];
        try {
          const companiesPage = await companiesService.findPaginated({
            page: 1,
            limit: 200,
          });
          companiesData = companiesPage.data;
          if (companiesPage.lastPage > 1) {
            toast.warning(
              "A lista de empresas foi limitada aos primeiros 200 registros.",
            );
          }
        } catch {
          // sem permissão para listar empresas — seguir com lista vazia
        }

        const fallbackCompanyId = isUuidLike(prefillCompanyId)
          ? prefillCompanyId
          : undefined;
        if (
          fallbackCompanyId &&
          !companiesData.some((company) => company.id === fallbackCompanyId)
        ) {
          try {
            const fallbackCompany = await companiesService.findOne(
              fallbackCompanyId,
            );
            companiesData = [fallbackCompany, ...companiesData];
          } catch {
            // ignora fallback sem permissão
          }
        }

        if (
          !id &&
          !prefillCompanyId &&
          companiesData.length === 1 &&
          companiesData[0]?.id
        ) {
          setValue("company_id", companiesData[0].id, {
            shouldValidate: true,
          });
        }

        setCompanies(companiesData);

        if (id) {
          const [ddsResult, signaturesResult] = await Promise.allSettled([
            ddsService.findOne(id),
            signaturesService.findByDocument(id, "DDS"),
          ]);
          if (ddsResult.status !== "fulfilled") {
            throw ddsResult.reason;
          }
          const dds = ddsResult.value;
          const existingSignatures =
            signaturesResult.status === "fulfilled" ? signaturesResult.value : [];
          if (signaturesResult.status === "rejected") {
            toast.warning(
              await extractApiErrorMessage(
                signaturesResult.reason,
                "Assinaturas existentes não puderam ser carregadas agora. O formulário foi aberto em modo degradado.",
              ),
            );
          }
          setCurrentDds(dds);

          const participantSignatures: Record<
            string,
            { data: string; type: string }
          > = {};
          const loadedTeamPhotos: TeamPhotoEvidence[] = [];
          let loadedPhotoReuseJustification = "";

          existingSignatures.forEach((sig) => {
            if (sig.type === TEAM_PHOTO_REUSE_JUSTIFICATION_TYPE) {
              loadedPhotoReuseJustification = sig.signature_data || "";
              setPhotoReuseJustification(loadedPhotoReuseJustification);
              return;
            }

            if (sig.type.startsWith(TEAM_PHOTO_SIGNATURE_PREFIX)) {
              try {
                const parsed = JSON.parse(
                  sig.signature_data,
                ) as TeamPhotoEvidence;
                if (parsed?.imageData && parsed?.hash) {
                  loadedTeamPhotos.push(parsed);
                }
              } catch {
                loadedTeamPhotos.push({
                  imageData: sig.signature_data,
                  capturedAt: sig.created_at || new Date().toISOString(),
                  hash: "indisponivel",
                  metadata: { userAgent: "legacy" },
                });
              }
              return;
            }
            if (sig.user_id) {
              participantSignatures[sig.user_id] = {
                data: sig.signature_data,
                type: sig.type || "participant",
              };
            }
          });

          setSignatures(participantSignatures);
          setTeamPhotos(loadedTeamPhotos);

          reset({
            tema: dds.tema,
            conteudo: dds.conteudo || "",
            data: toInputDateValue(dds.data),
            company_id: dds.company_id,
            site_id: dds.site_id,
            facilitador_id: dds.facilitador_id,
            participants: dds.participants.map((p) => p.id),
          });

          setInitialSignatureSnapshot(
            buildSignatureSnapshot({
              participantIds: dds.participants.map((participant) => participant.id),
              signatures: participantSignatures,
              teamPhotos: loadedTeamPhotos,
              photoReuseJustification: loadedPhotoReuseJustification,
            }),
          );
        } else {
          setCurrentDds(null);
          setInitialSignatureSnapshot(null);
        }
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
        toast.error(
          getFormErrorMessage(error, {
            fallback: "Erro ao carregar dados para o formulário.",
            server: "O DDS não pôde ser carregado agora.",
          }),
        );
      } finally {
        setFetching(false);
      }
    }
    loadData();
  }, [id, reset, prefillCompanyId, setValue]);

  useEffect(() => {
    let cancelled = false;

    async function loadCompanyScopedCatalogs() {
      if (!isUuidLike(selectedCompanyId)) {
        setSites([]);
        setUsers([]);
        return;
      }

      const selectedCompany = companies.find(
        (company) => company.id === selectedCompanyId,
      );

      if (isAdminGeral) {
        selectedTenantStore.set({
          companyId: selectedCompanyId,
          companyName:
            selectedCompany?.razao_social || "Empresa selecionada",
        });
      }

      const [siteResult, userResult] = await Promise.allSettled([
        sitesService.findPaginated({
          page: 1,
          limit: 200,
          companyId: selectedCompanyId,
        }),
        usersService.findPaginated({
          page: 1,
          limit: 200,
          companyId: selectedCompanyId,
        }),
      ]);

      if (cancelled) {
        return;
      }

      const failedCatalogs = [
        siteResult.status === "rejected" ? "sites" : null,
        userResult.status === "rejected" ? "usuários" : null,
      ].filter(Boolean);

      if (siteResult.status === "fulfilled") {
        setSites(siteResult.value.data);
      }

      if (userResult.status === "fulfilled") {
        setUsers(userResult.value.data);
      }

      if (siteResult.status === "fulfilled" && siteResult.value.lastPage > 1) {
        toast.warning(
          "A lista de sites foi limitada aos primeiros 200 registros para manter performance.",
        );
      }

      if (userResult.status === "fulfilled" && userResult.value.lastPage > 1) {
        toast.warning(
          "A lista de usuários foi limitada aos primeiros 200 registros para manter performance.",
        );
      }

      if (failedCatalogs.length > 0) {
        toast.warning(
          `Parte do catálogo do DDS não pôde ser carregada para a empresa selecionada: ${failedCatalogs.join(", ")}.`,
        );
      }
    }

    void loadCompanyScopedCatalogs();

    return () => {
      cancelled = true;
    };
  }, [companies, isAdminGeral, selectedCompanyId]);

  useEffect(() => {
    async function loadHistoricalPhotoHashes() {
      try {
        const nextHashes: Record<string, HistoricalPhotoReference> = {};
        const historicalReferences =
          await ddsService.getHistoricalPhotoHashes(
            100,
            id,
            selectedCompanyId,
          );
        historicalReferences
          .forEach((item) => {
            item.hashes.forEach((hash) => {
              if (!hash) {
                return;
              }
              nextHashes[hash] = {
                ddsId: item.ddsId,
                tema: item.tema,
                data: item.data,
              };
            });
          });
        setHistoricalPhotoHashes(nextHashes);
      } catch (error) {
        console.error(
          "Erro ao carregar hashes históricos de fotos do DDS:",
          error,
        );
      }
    }

    if (isUuidLike(selectedCompanyId)) {
      loadHistoricalPhotoHashes();
    } else {
      setHistoricalPhotoHashes({});
      setPhotoReuseWarnings({});
    }
  }, [selectedCompanyId, id]);

  useEffect(() => {
    const nextWarnings: Record<string, HistoricalPhotoReference> = {};
    teamPhotos.forEach((photo) => {
      const found = historicalPhotoHashes[photo.hash];
      if (found) {
        nextWarnings[photo.hash] = found;
      }
    });
    setPhotoReuseWarnings(nextWarnings);
  }, [teamPhotos, historicalPhotoHashes]);

  useEffect(() => {
    if (resumeSignatures) {
      toast.warning(
        "O DDS foi salvo, mas as assinaturas/fotos precisam ser concluídas antes do PDF final.",
      );
    }
  }, [resumeSignatures]);

  const getGeoMetadata = async (): Promise<TeamPhotoMetadata> => {
    const nav: Navigator | undefined =
      typeof window !== "undefined" ? window.navigator : undefined;

    if (!nav) {
      return { userAgent: "server" };
    }

    if (!nav.geolocation) {
      return { userAgent: nav.userAgent };
    }

    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          nav.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 6000,
            maximumAge: 120000,
          });
        },
      );

      return {
        userAgent: nav.userAgent,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
    } catch {
      return { userAgent: nav.userAgent };
    }
  };

  const sha256 = async (value: string): Promise<string> => {
    const data = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  };

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(new Error("Falha ao ler arquivo de imagem."));
      reader.readAsDataURL(file);
    });

  const resizeImageFile = async (file: File): Promise<string> => {
    const imageDataUrl = await fileToDataUrl(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(new Error("Não foi possível processar a imagem."));
      image.src = imageDataUrl;
    });

    const maxWidth = 1600;
    const maxHeight = 1200;
    let { width, height } = img;

    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Não foi possível otimizar a imagem.");
    }
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.8);
  };

  const handleTeamPhotoChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    try {
      const geoMetadata = await getGeoMetadata();
      const processedPhotos = await Promise.all(
        Array.from(files).map(async (file) => {
          const imageData = await resizeImageFile(file);
          const hash = await sha256(imageData);
          return {
            imageData,
            hash,
            capturedAt: new Date().toISOString(),
            metadata: geoMetadata,
          } as TeamPhotoEvidence;
        }),
      );
      const hasPotentialReuse = processedPhotos.some((photo) =>
        Boolean(historicalPhotoHashes[photo.hash]),
      );
      if (hasPotentialReuse) {
        toast.warning(
          "Detectamos foto(s) já usada(s) em DDS anterior desta empresa.",
        );
      }
      setTeamPhotos((prev) => [...prev, ...processedPhotos].slice(0, 6));
      toast.success(
        `${processedPhotos.length} foto(s) auditável(is) adicionada(s) ao DDS.`,
      );
    } catch (error) {
      console.error("Erro ao processar fotos da equipe:", error);
      toast.error("Não foi possível processar uma ou mais fotos.");
    } finally {
      event.target.value = "";
    }
  };

  async function onSubmit(data: DdsFormData) {
    if (!canManageDds) {
      setSubmitError("Você não tem permissão para salvar DDS.");
      toast.error("Você não tem permissão para salvar DDS.");
      return;
    }
    let persistedDdsId: string | undefined;
    let shouldPersistSignatures = false;
    try {
      setLoading(true);
      setSubmitError(null);

      const missingSignatureUsers = data.participants.filter(
        (participantId) => !signatures[participantId],
      );
      if (missingSignatureUsers.length > 0) {
        setSubmitError(
          "Todos os participantes selecionados devem assinar o DDS.",
        );
        toast.error("Faltam assinaturas de participantes.");
        return;
      }

      if (
        Object.keys(photoReuseWarnings).length > 0 &&
        photoReuseJustification.trim().length < 20
      ) {
        setSubmitError(
          "Detectamos possível reuso de foto. Informe uma justificativa com pelo menos 20 caracteres para continuar.",
        );
        toast.error("Justificativa obrigatória para reuso de foto detectado.");
        return;
      }

      let ddsId = id;
      const payload = { ...data };
      if (payload.conteudo === "") delete payload.conteudo;

      if (id) {
        const updatedDds = await ddsService.update(id, payload);
        persistedDdsId = updatedDds.id;
        setCurrentDds(updatedDds);
      } else {
        const newDds = await ddsService.create(payload);
        ddsId = newDds.id;
        persistedDdsId = newDds.id;
        setCurrentDds(newDds);
      }

      const currentSignatureSnapshot = buildSignatureSnapshot({
        participantIds: data.participants,
        signatures,
        teamPhotos,
        photoReuseJustification,
      });
      const shouldReplaceSignatures =
        !id ||
        !initialSignatureSnapshot ||
        currentSignatureSnapshot !== initialSignatureSnapshot;
      shouldPersistSignatures = shouldReplaceSignatures;

      if (ddsId && shouldReplaceSignatures) {
        const participantSignaturesPayload = data.participants.map(
          (participantId) => {
            const signature = signatures[participantId];
            if (signature.type === "hmac") {
              const pin = String(signature.data || "").trim();
              if (!/^\d{4,6}$/.test(pin)) {
                const participantName =
                  users.find((user) => user.id === participantId)?.nome ||
                  "Participante";
                throw new Error(
                  `${participantName} precisa confirmar novamente a assinatura por PIN para concluir esta alteração.`,
                );
              }
              return {
                user_id: participantId,
                type: signature.type,
                signature_data: "HMAC_PENDING",
                pin,
              };
            }

            return {
              user_id: participantId,
              type: signature.type || "digital",
              signature_data: signature.data,
            };
          },
        );

        await ddsService.replaceSignatures(ddsId, {
          participant_signatures: participantSignaturesPayload,
          team_photos: teamPhotos,
          photo_reuse_justification:
            Object.keys(photoReuseWarnings).length > 0
              ? photoReuseJustification.trim()
              : undefined,
        });

        if (id) {
          setInitialSignatureSnapshot(currentSignatureSnapshot);
        }
      }

      toast.success(
        id ? "DDS atualizado com sucesso!" : "DDS cadastrado com sucesso!",
      );

      router.push("/dashboard/dds");
      router.refresh();
    } catch (error) {
      if (persistedDdsId && shouldPersistSignatures) {
        const partialSaveMessage =
          "O DDS foi salvo, mas assinaturas/fotos ainda não foram concluídas. Revise o registro e finalize antes de emitir o PDF final.";
        setSubmitError(partialSaveMessage);
        toast.warning(partialSaveMessage);
        if (!id) {
          router.replace(
            `/dashboard/dds/edit/${persistedDdsId}?resume_signatures=1`,
          );
        }
        return;
      }
      console.error("Erro ao salvar DDS:", error);
      const errorMessage = getFormErrorMessage(error, {
        badRequest: "Dados inválidos. Revise os campos obrigatórios.",
        unauthorized: "Sessão expirada. Faça login novamente.",
        forbidden: "Você não tem permissão para salvar DDS.",
        server: "Erro interno do servidor ao salvar DDS.",
        fallback: "Erro ao salvar DDS. Tente novamente.",
      });
      setSubmitError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  const onInvalid = (formErrors: FieldErrors<DdsFormData>) => {
    if (formErrors.tema) {
      setFocus("tema");
    } else if (formErrors.company_id) {
      setFocus("company_id");
    } else if (formErrors.site_id) {
      setFocus("site_id");
    } else if (formErrors.facilitador_id) {
      setFocus("facilitador_id");
    }
    toast.error("Revise os campos obrigatórios antes de salvar.");
  };

  const toggleParticipant = (userId: string) => {
    const isSelected = selectedParticipantIds.includes(userId);

    if (isSelected) {
      // If already selected, just remove
      const updated = selectedParticipantIds.filter((id) => id !== userId);
      setValue("participants", updated, { shouldValidate: true });
      // Also remove temporary signature if exists
      const newSignatures = { ...signatures };
      delete newSignatures[userId];
      setSignatures(newSignatures);
    } else {
      // If not selected, open signature modal first
      const user = users.find((u) => u.id === userId);
      if (user) {
        setCurrentSigningUser(user);
        setIsSignatureModalOpen(true);
      }
    }
  };

  const handleSaveSignature = (signatureData: string, type: string) => {
    if (currentSigningUser) {
      setSignatures((prev) => ({
        ...prev,
        [currentSigningUser.id]: { data: signatureData, type },
      }));

      const updated = Array.from(
        new Set([...selectedParticipantIds, currentSigningUser.id]),
      );
      setValue("participants", updated, { shouldValidate: true });
      toast.success(`Assinatura de ${currentSigningUser.nome} capturada!`);
    }
  };

  if (fetching) {
    return (
      <div className="flex justify-center py-10">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--ds-color-action-primary)] border-t-transparent"></div>
      </div>
    );
  }

  if (!canManageDds) {
    return (
      <div className="rounded-lg border border-[color:var(--ds-color-danger)]/20 bg-[color:var(--ds-color-danger)]/8 px-5 py-4 text-sm text-[var(--ds-color-danger)]">
        Você não tem permissão para criar ou editar DDS neste tenant.
      </div>
    );
  }

  return (
    <div className="ds-form-page mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            href="/dashboard/dds"
            className="rounded-full p-2 text-[var(--ds-color-text-muted)] hover:bg-[var(--ds-color-surface-muted)] hover:text-[var(--ds-color-text-secondary)]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">
            {id ? "Editar DDS" : "Novo DDS"}
          </h1>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-8">
        {submitError && (
          <div className="rounded-lg border border-[color:var(--ds-color-danger)]/20 bg-[color:var(--ds-color-danger)]/8 px-4 py-3 text-sm text-[var(--ds-color-danger)]">
            {submitError}
          </div>
        )}
        {ddsReadOnlyMessage ? (
          <div className="rounded-xl border border-[color:var(--ds-color-warning)]/25 bg-[color:var(--ds-color-warning-subtle)] px-5 py-4 text-sm text-[var(--ds-color-text-secondary)]">
            <p className="font-semibold text-[var(--ds-color-text-primary)]">
              Documento travado para edição
            </p>
            <p className="mt-1">{ddsReadOnlyMessage}</p>
          </div>
        ) : null}
        <fieldset
          disabled={ddsReadOnly}
          className={`space-y-8 ${ddsReadOnly ? "opacity-80" : ""}`}
        >
        <div className="sst-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-[var(--ds-color-text-primary)]">
              Informações Básicas
            </h2>
            {isAiEnabled() && (
              <button
                type="button"
                onClick={handleAiSuggestion}
                disabled={suggesting || ddsReadOnly}
                className="flex items-center space-x-2 rounded-lg bg-[var(--ds-color-action-primary)] px-4 py-2 text-sm font-bold text-white shadow-md transition-all hover:brightness-110 disabled:opacity-50"
              >
                {suggesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                <span>Sugerir Tema com SGS</span>
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="md:col-span-2">
              <label
                htmlFor="dds-tema"
                className="block text-sm font-medium text-[var(--ds-color-text-secondary)]"
              >
                Tema do DDS
              </label>
              <input
                id="dds-tema"
                type="text"
                {...register("tema")}
                className={`mt-1 block w-full rounded-md border bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] focus:outline-none ${
                  errors.tema
                    ? "border-[var(--ds-color-danger)] focus:border-[var(--ds-color-danger)]"
                    : "border-[var(--ds-color-border-default)] focus:border-[var(--ds-color-action-primary)]"
                }`}
                aria-invalid={errors.tema ? "true" : undefined}
                placeholder="Ex: Importância do uso de EPIs"
              />
              {errors.tema && (
                <p className="mt-1 text-xs text-[var(--ds-color-danger)]">
                  {errors.tema.message}
                </p>
              )}
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="dds-conteudo"
                className="block text-sm font-medium text-[var(--ds-color-text-secondary)]"
              >
                Conteúdo / Resumo
              </label>
              <textarea
                id="dds-conteudo"
                {...register("conteudo")}
                rows={5}
                aria-label="Conteúdo do DDS"
                className="mt-1 block w-full rounded-md border border-[var(--ds-color-border-default)] px-3 py-2 text-sm focus:border-[var(--ds-color-action-primary)] focus:outline-none"
                placeholder="Descreva brevemente os pontos abordados no DDS..."
              />
            </div>

            <div>
              <label
                htmlFor="dds-data"
                className="block text-sm font-medium text-[var(--ds-color-text-secondary)]"
              >
                Data
              </label>
              <input
                id="dds-data"
                type="date"
                {...register("data")}
                aria-label="Data do DDS"
                className="mt-1 block w-full rounded-md border border-[var(--ds-color-border-default)] px-3 py-2 text-sm focus:border-[var(--ds-color-action-primary)] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="dds-company-id"
                className="block text-sm font-medium text-[var(--ds-color-text-secondary)]"
              >
                Empresa
              </label>
              <select
                id="dds-company-id"
                {...register("company_id")}
                onChange={(e) => {
                  const nextCompanyId = e.target.value;
                  if (isAdminGeral && isUuidLike(nextCompanyId)) {
                    const selectedCompany = companies.find(
                      (company) => company.id === nextCompanyId,
                    );
                    selectedTenantStore.set({
                      companyId: nextCompanyId,
                      companyName:
                        selectedCompany?.razao_social || "Empresa selecionada",
                    });
                  }
                  setValue("company_id", nextCompanyId, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                  setValue("site_id", "");
                  setValue("facilitador_id", "");
                  setValue("participants", []);
                  setSignatures({});
                  setTeamPhotos([]);
                  setPhotoReuseWarnings({});
                  setPhotoReuseJustification("");
                }}
                className={`mt-1 block w-full rounded-md border bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] focus:outline-none ${
                  errors.company_id
                    ? "border-[var(--ds-color-danger)] focus:border-[var(--ds-color-danger)]"
                    : "border-[var(--ds-color-border-default)] focus:border-[var(--ds-color-action-primary)]"
                }`}
                aria-invalid={errors.company_id ? "true" : undefined}
              >
                <option value="">Selecione uma empresa</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.razao_social}
                  </option>
                ))}
              </select>
              {errors.company_id && (
                <p className="mt-1 text-xs text-[var(--ds-color-danger)]">
                  {errors.company_id.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="dds-site-id"
                className="block text-sm font-medium text-[var(--ds-color-text-secondary)]"
              >
                Site/Unidade
              </label>
              <select
                id="dds-site-id"
                {...register("site_id")}
                disabled={!selectedCompanyId}
                aria-label="Site ou unidade do DDS"
                className={`mt-1 block w-full rounded-md border bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] focus:outline-none ${
                  !selectedCompanyId
                    ? "bg-[var(--ds-color-surface-muted)] cursor-not-allowed border-[var(--ds-color-border-default)]"
                    : errors.site_id
                      ? "border-[var(--ds-color-danger)] focus:border-[var(--ds-color-danger)]"
                      : "border-[var(--ds-color-border-default)] focus:border-[var(--ds-color-action-primary)]"
                }`}
                aria-invalid={errors.site_id ? "true" : undefined}
              >
                <option value="">
                  {selectedCompanyId
                    ? "Selecione um site"
                    : "Selecione uma empresa primeiro"}
                </option>
                {filteredSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.nome}
                  </option>
                ))}
              </select>
              {errors.site_id && (
                <p className="mt-1 text-xs text-[var(--ds-color-danger)]">
                  {errors.site_id.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="dds-facilitador-id"
                className="block text-sm font-medium text-[var(--ds-color-text-secondary)]"
              >
                Facilitador
              </label>
              <select
                id="dds-facilitador-id"
                {...register("facilitador_id")}
                disabled={!selectedCompanyId}
                aria-label="Facilitador do DDS"
                className={`mt-1 block w-full rounded-md border bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] focus:outline-none ${
                  !selectedCompanyId
                    ? "bg-[var(--ds-color-surface-muted)] cursor-not-allowed border-[var(--ds-color-border-default)]"
                    : errors.facilitador_id
                      ? "border-[var(--ds-color-danger)] focus:border-[var(--ds-color-danger)]"
                      : "border-[var(--ds-color-border-default)] focus:border-[var(--ds-color-action-primary)]"
                }`}
                aria-invalid={errors.facilitador_id ? "true" : undefined}
              >
                <option value="">
                  {selectedCompanyId
                    ? "Selecione um facilitador"
                    : "Selecione uma empresa primeiro"}
                </option>
                {filteredUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.nome}
                  </option>
                ))}
              </select>
              {errors.facilitador_id && (
                <p className="mt-1 text-xs text-[var(--ds-color-danger)]">
                  {errors.facilitador_id.message}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="sst-card p-6">
          <h2 className="mb-4 flex items-center justify-between text-lg font-bold text-[var(--ds-color-text-primary)]">
            Participantes
            <span className="text-xs font-normal text-[var(--ds-color-text-muted)]">
              {selectedParticipantIds.length} selecionados
            </span>
          </h2>
          {!selectedCompanyId ? (
            <div className="rounded-lg border border-dashed border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)] py-8 text-center text-sm text-[var(--ds-color-text-muted)]">
              Selecione uma empresa para listar os participantes
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)] py-8 text-center text-sm text-[var(--ds-color-text-muted)]">
              Nenhum usuário encontrado para esta empresa
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              {filteredUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => toggleParticipant(user.id)}
                  className={`flex items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors ${
                    selectedParticipantIds.includes(user.id)
                      ? "border-[var(--ds-color-action-primary)] bg-[color:var(--ds-color-action-primary)]/8 text-[var(--ds-color-action-primary)]"
                      : "border-[var(--ds-color-border-subtle)] hover:bg-[var(--ds-color-surface-muted)]"
                  }`}
                >
                  <span>{user.nome}</span>
                  {selectedParticipantIds.includes(user.id) && (
                    <div className="h-2 w-2 rounded-full bg-[var(--ds-color-action-primary)]" />
                  )}
                </button>
              ))}
            </div>
          )}
          {errors.participants && (
            <p className="mt-1 text-xs text-[var(--ds-color-danger)]">
              {errors.participants.message}
            </p>
          )}
        </div>

        <div className="sst-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[var(--ds-color-text-primary)]">
                Registro Fotográfico da Equipe
              </h2>
              <p className="text-xs text-[var(--ds-color-text-muted)]">
                Use a câmera do celular para registrar presença e evidência do
                DDS.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[var(--ds-color-action-primary)] px-3 py-2 text-sm font-medium text-white hover:brightness-110">
              <Camera className="h-4 w-4" />
              Adicionar Foto
              <input
                type="file"
                accept="image/*"
                aria-label="Selecionar fotos da equipe para o DDS"
                multiple
                disabled={ddsReadOnly}
                className="hidden"
                onChange={handleTeamPhotoChange}
              />
            </label>
          </div>

          {teamPhotos.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)] py-6 text-center text-sm text-[var(--ds-color-text-muted)]">
              Nenhuma foto adicionada. Recomendado: anexar pelo menos 1 foto da
              equipe.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {teamPhotos.map((photo, index) => (
                <div
                  key={`${index}-${photo.hash.slice(0, 12)}`}
                  className="relative overflow-hidden rounded-lg border"
                >
                  <NextImage
                    src={photo.imageData}
                    alt={`Foto da equipe ${index + 1}`}
                    width={600}
                    height={300}
                    className="h-36 w-full object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-[10px] text-white">
                    Hash: {photo.hash.slice(0, 12)}...
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setTeamPhotos((prev) =>
                        prev.filter((_, i) => i !== index),
                      )
                    }
                    className="absolute right-2 top-2 rounded-md bg-[var(--ds-color-surface-base)]/90 p-1 text-[var(--ds-color-danger)] hover:bg-[var(--ds-color-surface-base)]"
                    title="Remover foto"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {Object.keys(photoReuseWarnings).length > 0 && (
            <div className="mt-4 space-y-2 rounded-lg border border-[color:var(--ds-color-warning)]/25 bg-[color:var(--ds-color-warning)]/8 px-4 py-3 text-xs text-[var(--ds-color-warning)]">
              <p className="font-semibold">
                Alerta de possível reuso de imagem:
              </p>
              {Object.entries(photoReuseWarnings).map(([hash, ref]) => (
                <p key={hash}>
                  Hash {hash.slice(0, 12)}... já apareceu no DDS &quot;
                  {ref.tema}&quot; (
                  {safeToLocaleDateString(ref.data, "pt-BR", undefined, "data indisponível")}).
                </p>
              ))}
              <div className="pt-2">
                <label className="mb-1 block text-xs font-semibold text-[var(--ds-color-text-primary)]">
                  Justificativa de exceção (obrigatória para salvar)
                </label>
                <textarea
                  value={photoReuseJustification}
                  onChange={(event) =>
                    setPhotoReuseJustification(event.target.value)
                  }
                  className="w-full rounded-md border border-[color:var(--ds-color-warning)]/35 bg-[var(--ds-color-surface-base)] px-3 py-2 text-xs text-[var(--ds-color-text-primary)] focus:border-[var(--ds-color-warning)] focus:outline-none"
                  rows={3}
                  placeholder="Explique por que a mesma foto está sendo reutilizada neste DDS."
                />
              </div>
            </div>
          )}
        </div>

        <DocumentVideoPanel
          title="Vídeos governados"
          description="Anexe vídeos do DDS como evidência operacional governada, com acesso seguro e trilha auditável."
          documentId={id}
          canManage={canManageDds}
          locked={ddsVideoLocked}
          lockMessage={ddsVideoLockMessage}
          attachments={documentVideos.attachments}
          loading={documentVideos.loading}
          uploading={documentVideos.uploading}
          removingId={documentVideos.removingId}
          onUpload={documentVideos.handleUpload}
          onRemove={documentVideos.handleRemove}
          resolveAccess={documentVideos.resolveAccess}
        />

        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-[var(--ds-color-border-default)] px-6 py-2 text-sm font-medium text-[var(--ds-color-text-secondary)] hover:bg-[var(--ds-color-surface-muted)]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={ddsReadOnly || loading || isSubmitting || !isValid}
            className="flex items-center space-x-2 rounded-lg bg-[var(--ds-color-action-primary)] px-6 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            <span>{loading ? "Salvando..." : "Salvar DDS"}</span>
          </button>
        </div>
        </fieldset>
      </form>

      {isSignatureModalOpen && currentSigningUser && (
        <SignatureModal
          isOpen={isSignatureModalOpen}
          onClose={() => setIsSignatureModalOpen(false)}
          onSave={handleSaveSignature}
          userName={currentSigningUser.nome}
        />
      )}
    </div>
  );
}

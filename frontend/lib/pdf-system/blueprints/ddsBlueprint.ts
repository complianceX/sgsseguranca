import type { Dds } from "@/services/ddsService";
import { DDS_STATUS_LABEL } from "@/services/ddsService";
import { formatVideoBytes } from "@/lib/videos/documentVideos";
import type {
  DdsApprovalAction,
  DdsApprovalRecord,
} from "@/services/ddsService";
import type { Signature } from "@/services/signaturesService";
import type { GovernedDocumentVideoAttachment } from "@/lib/videos/documentVideos";
import type { AutoTableFn, PdfContext } from "../core/types";
import { formatDate, formatDateTime, sanitize } from "../core/format";
import {
  drawDocumentIdentityRail,
  drawEvidenceGallery,
  drawExecutiveSummaryStrip,
  drawGovernanceClosingBlock,
  drawMetadataGrid,
  drawNarrativeSection,
  drawSemanticTable,
} from "../components";
import { drawParticipantTable } from "../tables";

const TEAM_PHOTO_REUSE_JUSTIFICATION_TYPE = "team_photo_reuse_justification";
const TEAM_PHOTO_SIGNATURE_PATTERN = /^team_photo_\d+$/i;

// Mapeamento de tipos técnicos de assinatura para rótulos legíveis em PT-BR.
const SIGNATURE_TYPE_LABEL: Record<string, string> = {
  digital: "Participante",
  facilitador: "Facilitador",
  supervisor: "Supervisor",
  gestor: "Gestor",
  coordenador: "Coordenador",
  auditor: "Auditor",
  responsavel: "Responsável",
  lider: "Líder",
  encarregado: "Encarregado",
  tecnico: "Técnico",
  operador: "Operador",
};

function resolveSignatureRole(type?: string): string {
  if (!type) return "Signatário";
  const key = type.toLowerCase().trim();
  return SIGNATURE_TYPE_LABEL[key] ?? sanitize(type);
}

type TeamPhotoEvidence = {
  imageData?: string;
  capturedAt?: string;
  hash?: string;
  metadata?: {
    latitude?: number;
    longitude?: number;
    accuracy?: number;
  };
};

type DdsParticipantLike = { nome?: string };

const APPROVAL_STATUS_LABEL: Record<DdsApprovalAction, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Reprovado",
  canceled: "Cancelado",
  reopened: "Reaberto",
};

function approvalStatusLabel(action?: string | null): string {
  if (!action) return "Não registrado";
  return APPROVAL_STATUS_LABEL[action as DdsApprovalAction] ?? sanitize(action);
}

function approvalActorLabel(event?: DdsApprovalRecord): string {
  return sanitize(event?.actor?.nome || event?.actor_user_id || "Sistema");
}

function eventHashPreview(hash?: string | null): string {
  return hash ? `${hash.slice(0, 18)}...` : "Não registrado";
}

function signatureHashPreview(hash?: string | null): string {
  return hash ? `${hash.slice(0, 18)}...` : "Não registrada";
}

function compactPdfFileName(value?: string | null): string {
  const fileName = sanitize(value || "video");
  if (fileName.length <= 24) {
    return fileName;
  }
  const extensionIndex = fileName.lastIndexOf(".");
  const extension =
    extensionIndex > 0 ? fileName.slice(extensionIndex).slice(0, 8) : "";
  const base = extension ? fileName.slice(0, extensionIndex) : fileName;
  return `${base.slice(0, Math.max(12, 21 - extension.length))}...${extension}`;
}

function findDecisionEvent(
  events: DdsApprovalRecord[],
  cycle: number | null | undefined,
  levelOrder: number,
): DdsApprovalRecord | undefined {
  return [...events]
    .reverse()
    .find(
      (event) =>
        event.cycle === cycle &&
        event.level_order === levelOrder &&
        ["approved", "rejected", "canceled"].includes(event.action),
    );
}

function isTeamPhotoSignature(type?: string): boolean {
  return Boolean(type && TEAM_PHOTO_SIGNATURE_PATTERN.test(type));
}

function parseTeamPhoto(signature: Signature): TeamPhotoEvidence | null {
  const payload = String(signature.signature_data || "").trim();
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as
      | (TeamPhotoEvidence & { image_data?: string; captured_at?: string })
      | null;
    if (!parsed) {
      return null;
    }

    const imageData = String(
      parsed.imageData || parsed.image_data || "",
    ).trim();
    if (!imageData) {
      return null;
    }

    return {
      imageData,
      capturedAt:
        typeof parsed.capturedAt === "string"
          ? parsed.capturedAt
          : typeof parsed.captured_at === "string"
            ? parsed.captured_at
            : signature.created_at,
      hash: typeof parsed.hash === "string" ? parsed.hash : undefined,
      metadata: parsed.metadata
        ? {
            latitude:
              typeof parsed.metadata.latitude === "number"
                ? parsed.metadata.latitude
                : undefined,
            longitude:
              typeof parsed.metadata.longitude === "number"
                ? parsed.metadata.longitude
                : undefined,
            accuracy:
              typeof parsed.metadata.accuracy === "number"
                ? parsed.metadata.accuracy
                : undefined,
          }
        : undefined,
    };
  } catch {
    if (payload.startsWith("data:image/")) {
      return {
        imageData: payload,
        capturedAt: signature.created_at,
      };
    }
    return null;
  }
}

export async function drawDdsBlueprint(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  dds: Dds,
  signatures: Signature[],
  videoAttachments: GovernedDocumentVideoAttachment[],
  code: string,
  validationUrl: string,
) {
  const participantCount =
    dds.participant_count ?? dds.participants?.length ?? 0;
  const hasFinalPdfMetadata = Boolean(
    dds.document_code ||
    dds.final_pdf_hash_sha256 ||
    dds.pdf_generated_at ||
    dds.emitted_by ||
    dds.emitted_ip,
  );
  const teamPhotos = signatures
    .filter((signature) => isTeamPhotoSignature(signature.type))
    .map((signature) => parseTeamPhoto(signature))
    .filter((photo): photo is TeamPhotoEvidence => Boolean(photo));
  const participantSignatures = signatures.filter(
    (signature) =>
      !isTeamPhotoSignature(signature.type) &&
      signature.type !== TEAM_PHOTO_REUSE_JUSTIFICATION_TYPE,
  );

  drawDocumentIdentityRail(ctx, {
    documentType: "DDS",
    criticality: "Moderada",
    documentClass: dds.is_modelo ? "Modelo" : "Operacional",
  });

  drawExecutiveSummaryStrip(ctx, {
    title: "Síntese executiva",
    summary:
      "Registro de alinhamento de segurança antes da operação, com foco em tema, facilitação, participação e evidência de governança.",
    metrics: [
      { label: "Tema", value: sanitize(dds.tema), tone: "info" },
      {
        label: "Status",
        value: DDS_STATUS_LABEL[dds.status] ?? sanitize(dds.status),
        tone: dds.status === "rascunho" ? "warning" : "success",
      },
      {
        label: "Participantes",
        value: participantCount,
        tone: participantCount > 0 ? "success" : "warning",
      },
      {
        label: "Facilitador",
        value: sanitize(dds.facilitador?.nome),
        tone: "default",
      },
      { label: "Site", value: sanitize(dds.site?.nome), tone: "default" },
      {
        label: "Fotos",
        value: teamPhotos.length,
        tone: teamPhotos.length > 0 ? "success" : "warning",
      },
    ],
  });

  drawNarrativeSection(ctx, {
    title: "Tema completo do DDS",
    content: dds.tema,
  });

  drawNarrativeSection(ctx, {
    title: "Conteúdo do DDS",
    content: dds.conteudo,
  });

  drawMetadataGrid(ctx, {
    title: "Contexto documental",
    columns: 2,
    fields: [
      { label: "Empresa", value: dds.company?.razao_social || dds.company_id },
      { label: "Data do DDS", value: formatDate(dds.data) },
      { label: "Site / Obra", value: dds.site?.nome || dds.site_id },
      { label: "Facilitador", value: dds.facilitador?.nome },
      { label: "Modelo reutilizável", value: dds.is_modelo ? "Sim" : "Não" },
      { label: "Revisão", value: `v${dds.version ?? 1}` },
      { label: "Criado em", value: formatDateTime(dds.created_at) },
      { label: "Última atualização", value: formatDateTime(dds.updated_at) },
    ],
  });

  if (hasFinalPdfMetadata) {
    drawMetadataGrid(ctx, {
      title: "Rastreabilidade do PDF final",
      columns: 2,
      fields: [
        { label: "Código documental", value: code },
        {
          label: "Hash SHA-256 do PDF",
          value: dds.final_pdf_hash_sha256
            ? `${dds.final_pdf_hash_sha256.slice(0, 32)}...`
            : "Gerado no registro governado após emissão",
        },
        { label: "PDF gerado em", value: formatDateTime(dds.pdf_generated_at) },
        { label: "Emitido por", value: dds.emitted_by?.nome },
        { label: "IP de emissão", value: dds.emitted_ip },
      ],
    });
  }

  // Seção de auditoria — exibida apenas quando o DDS foi auditado.
  if (
    dds.status === "auditado" &&
    (dds.resultado_auditoria || dds.data_auditoria || dds.auditado_por)
  ) {
    drawMetadataGrid(ctx, {
      title: "Resultado da auditoria",
      columns: 2,
      fields: [
        { label: "Auditado por", value: dds.auditado_por?.nome },
        { label: "Data da auditoria", value: formatDate(dds.data_auditoria) },
        { label: "Resultado", value: dds.resultado_auditoria },
      ],
    });

    if (dds.notas_auditoria) {
      drawNarrativeSection(ctx, {
        title: "Notas da auditoria",
        content: dds.notas_auditoria,
      });
    }
  }

  if (dds.approval_flow && dds.approval_flow.activeCycle != null) {
    const approvalFlow = dds.approval_flow;
    const activeCycleEvents = approvalFlow.events.filter(
      (event) => event.cycle === approvalFlow.activeCycle,
    );
    const finalApprovalEvent = [...activeCycleEvents]
      .reverse()
      .find((event) => event.action === "approved");
    const latestEvent = approvalFlow.events[approvalFlow.events.length - 1];

    drawMetadataGrid(ctx, {
      title: "Fluxo de aprovação rastreável",
      columns: 2,
      fields: [
        {
          label: "Status do fluxo",
          value: approvalStatusLabel(approvalFlow.status),
        },
        {
          label: "Ciclo ativo",
          value: approvalFlow.activeCycle
            ? `Ciclo ${approvalFlow.activeCycle}`
            : "Não iniciado",
        },
        {
          label: "Níveis configurados",
          value: approvalFlow.steps.length,
        },
        {
          label: "Último evento",
          value: latestEvent
            ? `${approvalStatusLabel(latestEvent.action)} em ${formatDateTime(latestEvent.event_at)}`
            : "Sem eventos",
        },
        {
          label: "Aprovador final",
          value: approvalActorLabel(finalApprovalEvent),
        },
        {
          label: "Hash final da trilha",
          value: eventHashPreview(latestEvent?.event_hash),
        },
      ],
    });

    if (approvalFlow.steps.length > 0) {
      drawSemanticTable(ctx, {
        title: "Etapas de aprovação",
        tone: "action",
        autoTable,
        head: [
          [
            "Nível",
            "Etapa",
            "Perfil",
            "Status",
            "Decisão",
            "Assinatura",
            "Hash",
          ],
        ],
        body: approvalFlow.steps.map((step) => {
          const decisionEvent = findDecisionEvent(
            approvalFlow.events,
            approvalFlow.activeCycle,
            step.level_order,
          );
          return [
            step.level_order,
            sanitize(step.title),
            sanitize(step.approver_role),
            approvalStatusLabel(step.status),
            decisionEvent
              ? `${approvalActorLabel(decisionEvent)} | ${formatDateTime(decisionEvent.event_at)}`
              : "Pendente",
            step.actor_signature_hash
              ? `${signatureHashPreview(step.actor_signature_hash)} | ${formatDateTime(step.actor_signature_signed_at)}`
              : "Sem assinatura",
            eventHashPreview(step.event_hash),
          ];
        }),
        overrides: {
          tableWidth: ctx.contentWidth - 4,
          columnStyles: {
            0: { cellWidth: 12 },
            1: { cellWidth: 35 },
            2: { cellWidth: 24 },
            3: { cellWidth: 18 },
            4: { cellWidth: 37 },
            5: { cellWidth: 39 },
            6: { cellWidth: 24 },
          },
        },
      });
    }

    if (approvalFlow.events.length > 0) {
      drawSemanticTable(ctx, {
        title: "Histórico técnico de aprovação",
        tone: "default",
        autoTable,
        head: [
          [
            "Data/hora",
            "Ação",
            "Ator",
            "IP",
            "Assinatura",
            "Hash anterior",
            "Hash do evento",
          ],
        ],
        body: approvalFlow.events.map((event) => [
          formatDateTime(event.event_at),
          approvalStatusLabel(event.action),
          approvalActorLabel(event),
          sanitize(event.decided_ip || "Não registrado"),
          event.actor_signature_hash
            ? [
                signatureHashPreview(event.actor_signature_hash),
                event.actor_signature_signed_at
                  ? formatDateTime(event.actor_signature_signed_at)
                  : null,
                event.actor_signature_timestamp_authority || null,
              ]
                .filter(Boolean)
                .join(" | ")
            : "Sem assinatura",
          eventHashPreview(event.previous_event_hash),
          eventHashPreview(event.event_hash),
        ]),
        overrides: {
          tableWidth: ctx.contentWidth - 4,
          columnStyles: {
            0: { cellWidth: 24 },
            1: { cellWidth: 16 },
            2: { cellWidth: 24 },
            3: { cellWidth: 16 },
            4: { cellWidth: 46 },
            5: { cellWidth: 24 },
            6: { cellWidth: 24 },
          },
        },
      });
    }
  }

  // Justificativa de reutilização de fotos — exibida apenas quando presente.
  if (dds.photo_reuse_justification) {
    drawNarrativeSection(ctx, {
      title: "Justificativa de reutilização de fotos",
      content: dds.photo_reuse_justification,
    });
  }

  drawParticipantTable(
    ctx,
    autoTable,
    `Participantes (${participantCount})`,
    (dds.participants || []).map((participant: DdsParticipantLike) => ({
      name: participant.nome,
    })),
  );

  await drawEvidenceGallery(ctx, {
    title: "Registro fotográfico da equipe",
    items: teamPhotos.map((photo, index) => {
      const metaParts = [
        photo.capturedAt
          ? `Capturada em: ${formatDateTime(photo.capturedAt)}`
          : undefined,
        photo.hash ? `Hash: ${String(photo.hash).slice(0, 32)}...` : undefined,
        photo.metadata?.latitude != null && photo.metadata?.longitude != null
          ? `GPS: ${photo.metadata.latitude.toFixed(4)}° / ${photo.metadata.longitude.toFixed(4)}°${photo.metadata.accuracy ? ` (±${photo.metadata.accuracy}m)` : ""}`
          : undefined,
      ];

      return {
        title: `Foto da equipe ${index + 1}`,
        description:
          "Evidência fotográfica registrada no DDS para comprovar participação da equipe e contexto de campo.",
        meta: metaParts.filter(Boolean).join(" | "),
        source: photo.imageData,
      };
    }),
  });

  const availableVideos = (videoAttachments || []).filter(
    (video) => video.availability === "stored" || video.availability === "registered_without_signed_url",
  );
  if (availableVideos.length > 0) {
    drawSemanticTable(ctx, {
      title: `Vídeos governados (${availableVideos.length})`,
      tone: "default",
      autoTable,
      head: [["Arquivo", "Tipo", "Tamanho", "Enviado em", "Hash"]],
      body: availableVideos.map((video) => [
        compactPdfFileName(video.original_name),
        sanitize(video.mime_type || "-"),
        formatVideoBytes(video.size_bytes),
        formatDateTime(video.uploaded_at || video.created_at),
        video.file_hash ? `${video.file_hash.slice(0, 16)}...` : "-",
      ]),
      overrides: {
        tableWidth: ctx.contentWidth - 4,
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 24 },
          2: { cellWidth: 20 },
          3: { cellWidth: 38 },
          4: { cellWidth: 42 },
        },
      },
    });
  }

  await drawGovernanceClosingBlock(ctx, {
    signatures: participantSignatures.map((signature) => ({
      label: resolveSignatureRole(signature.type),
      name: sanitize(signature.user?.nome || signature.type),
      role: resolveSignatureRole(signature.type),
      date: formatDate(signature.signed_at || signature.created_at),
      image: signature.signature_data,
    })),
    code,
    url: validationUrl,
    hash: dds.final_pdf_hash_sha256 || undefined,
    title: "Governança e autenticidade",
    subtitle:
      "Valide o DDS, o fluxo de aprovação e a assinatura final no portal público.",
  });
}

import type { Dds } from "@/services/ddsService";
import { DDS_STATUS_LABEL } from "@/services/ddsService";
import type { Signature } from "@/services/signaturesService";
import type { AutoTableFn, PdfContext } from "../core/types";
import { formatDate, formatDateTime, sanitize } from "../core/format";
import {
  drawDocumentIdentityRail,
  drawEvidenceGallery,
  drawExecutiveSummaryStrip,
  drawGovernanceClosingBlock,
  drawMetadataGrid,
  drawNarrativeSection,
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
};

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
  code: string,
  validationUrl: string,
) {
  const participantCount = dds.participants?.length ?? 0;
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
    documentClass: "Operacional",
  });

  drawExecutiveSummaryStrip(ctx, {
    title: "Síntese executiva",
    summary:
      "Registro de alinhamento de segurança antes da operação, com foco em tema, facilitação, participação e evidência de governança.",
    metrics: [
      { label: "Tema", value: sanitize(dds.tema), tone: "info" },
      { label: "Status", value: DDS_STATUS_LABEL[dds.status] ?? sanitize(dds.status), tone: dds.status === "rascunho" ? "warning" : "success" },
      { label: "Participantes", value: participantCount, tone: participantCount > 0 ? "success" : "warning" },
      { label: "Facilitador", value: sanitize(dds.facilitador?.nome), tone: "default" },
      { label: "Site", value: sanitize(dds.site?.nome), tone: "default" },
      { label: "Fotos", value: teamPhotos.length, tone: teamPhotos.length > 0 ? "success" : "warning" },
    ],
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
      { label: "Criado em", value: formatDateTime(dds.created_at) },
      { label: "Última atualização", value: formatDateTime(dds.updated_at) },
    ],
  });

  // Seção de auditoria — exibida apenas quando o DDS foi auditado.
  if (dds.status === "auditado" && (dds.resultado_auditoria || dds.data_auditoria || dds.auditado_por)) {
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

  drawNarrativeSection(ctx, {
    title: "Conteúdo do DDS",
    content: dds.conteudo,
  });

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
    (dds.participants || []).map((participant) => ({ name: participant.nome })),
  );

  await drawEvidenceGallery(ctx, {
    title: "Registro fotográfico da equipe",
    items: teamPhotos.map((photo, index) => ({
      title: `Foto da equipe ${index + 1}`,
      description:
        "Evidência fotográfica registrada no DDS para comprovar participação da equipe e contexto de campo.",
      meta: [
        photo.capturedAt
          ? `Capturada em: ${formatDateTime(photo.capturedAt)}`
          : undefined,
        photo.hash ? `Hash: ${String(photo.hash).slice(0, 32)}...` : undefined,
      ]
        .filter(Boolean)
        .join(" | "),
      source: photo.imageData,
    })),
  });

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
    title: "Governança e autenticidade",
    subtitle: "Valide por QR Code ou código no portal público.",
  });
}

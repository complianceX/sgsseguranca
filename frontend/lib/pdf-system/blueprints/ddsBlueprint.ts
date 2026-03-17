import type { Dds } from "@/services/ddsService";
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
    criticality: "moderate",
    documentClass: "operational",
  });

  drawExecutiveSummaryStrip(ctx, {
    title: "Sintese executiva",
    summary:
      "Registro de alinhamento de seguranca antes da operacao, com foco em tema, facilitacao, participacao e evidencia de governanca.",
    metrics: [
      { label: "Tema", value: sanitize(dds.tema), tone: "info" },
      { label: "Status", value: sanitize(dds.status), tone: "warning" },
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
      { label: "Tema", value: dds.tema },
      { label: "Empresa", value: dds.company?.razao_social || dds.company_id },
      { label: "Data", value: formatDate(dds.data) },
      { label: "Site/Obra", value: dds.site?.nome || dds.site_id },
      { label: "Facilitador", value: dds.facilitador?.nome },
      { label: "Participantes", value: participantCount },
      { label: "Status", value: dds.status },
      { label: "Modelo", value: dds.is_modelo ? "Sim" : "Nao" },
    ],
  });

  drawNarrativeSection(ctx, {
    title: "Conteudo do DDS",
    content: dds.conteudo,
  });

  drawParticipantTable(
    ctx,
    autoTable,
    `Participantes (${participantCount})`,
    (dds.participants || []).map((participant) => ({ name: participant.nome })),
  );

  await drawEvidenceGallery(ctx, {
    title: "Registro fotografico da equipe",
    items: teamPhotos.map((photo, index) => ({
      title: `Foto da equipe ${index + 1}`,
      description:
        "Evidencia fotografica registrada no DDS para comprovar participacao da equipe e contexto de campo.",
      meta: [
        photo.capturedAt
          ? `Capturada em: ${formatDateTime(photo.capturedAt)}`
          : undefined,
        photo.hash ? `Hash: ${String(photo.hash).slice(0, 16)}...` : undefined,
      ]
        .filter(Boolean)
        .join(" | "),
      source: photo.imageData,
    })),
  });

  await drawGovernanceClosingBlock(ctx, {
    signatures: participantSignatures.map((signature) => ({
      label: sanitize(signature.type),
      name: sanitize(signature.user?.nome || signature.type),
      role: sanitize(signature.type),
      date: formatDate(signature.signed_at || signature.created_at),
      image: signature.signature_data,
    })),
    code,
    url: validationUrl,
    title: "Governanca e autenticidade",
    subtitle: "Valide por QR Code ou codigo no portal publico.",
  });
}

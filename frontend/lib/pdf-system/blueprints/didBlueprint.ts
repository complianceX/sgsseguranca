import type { Did } from '@/services/didsService';
import type { AutoTableFn, PdfContext } from '../core/types';
import { formatDate, formatDateTime, sanitize } from '../core/format';
import {
  drawDocumentIdentityRail,
  drawExecutiveSummaryStrip,
  drawGovernanceClosingBlock,
  drawMetadataGrid,
  drawNarrativeSection,
} from '../components';
import { drawParticipantTable } from '../tables';

function buildStatusTone(status: string) {
  if (status === 'executado') return 'success' as const;
  if (status === 'alinhado') return 'info' as const;
  if (status === 'rascunho') return 'warning' as const;
  return 'default' as const;
}

function buildCriticality(did: Did) {
  if (did.status === 'arquivado') return 'Arquivado';
  if (did.status === 'executado') return 'Controlada';
  if (did.status === 'alinhado') return 'Moderada';
  return 'Monitorado';
}

export async function drawDidBlueprint(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  did: Did,
  code: string,
  validationUrl: string,
) {
  const participantCount = did.participants?.length ?? 0;

  drawDocumentIdentityRail(ctx, {
    documentType: 'DID',
    criticality: buildCriticality(did),
    documentClass: 'Operacional',
  });

  drawExecutiveSummaryStrip(ctx, {
    title: 'Síntese executiva',
    summary:
      'Registro operacional de alinhamento da atividade programada para o dia, consolidando planejamento, riscos e controles do turno.',
    metrics: [
      {
        label: 'Atividade principal',
        value: sanitize(did.atividade_principal),
        tone: 'info',
      },
      { label: 'Turno', value: sanitize(did.turno), tone: 'default' },
      {
        label: 'Status',
        value: sanitize(did.status),
        tone: buildStatusTone(did.status),
      },
      {
        label: 'Participantes',
        value: participantCount,
        tone: participantCount > 0 ? 'success' : 'warning',
      },
      {
        label: 'Responsável',
        value: sanitize(did.responsavel?.nome),
        tone: 'default',
      },
      { label: 'Site', value: sanitize(did.site?.nome), tone: 'default' },
    ],
  });

  drawMetadataGrid(ctx, {
    title: 'Contexto documental',
    columns: 2,
    fields: [
      { label: 'Título', value: did.titulo },
      { label: 'Empresa', value: did.company?.razao_social || did.company_id },
      { label: 'Data', value: formatDate(did.data) },
      { label: 'Site / Obra', value: did.site?.nome || did.site_id },
      { label: 'Frente de trabalho', value: did.frente_trabalho },
      { label: 'Criado em', value: formatDateTime(did.created_at) },
      { label: 'Última atualização', value: formatDateTime(did.updated_at) },
    ],
  });

  drawNarrativeSection(ctx, {
    title: 'Descrição e objetivo',
    content: did.descricao,
  });

  drawNarrativeSection(ctx, {
    title: 'Atividades planejadas',
    content: did.atividades_planejadas,
  });

  drawNarrativeSection(ctx, {
    title: 'Riscos operacionais',
    content: did.riscos_operacionais,
  });

  drawNarrativeSection(ctx, {
    title: 'Controles planejados',
    content: did.controles_planejados,
  });

  drawNarrativeSection(ctx, {
    title: 'EPIs e EPCs aplicáveis',
    content: did.epi_epc_aplicaveis,
  });

  drawNarrativeSection(ctx, {
    title: 'Observações',
    content: did.observacoes,
  });

  drawParticipantTable(
    ctx,
    autoTable,
    `Participantes (${participantCount})`,
    (did.participants || []).map((participant) => ({
      name: participant.nome,
    })),
  );

  await drawGovernanceClosingBlock(ctx, {
    signatures: [],
    code,
    url: validationUrl,
    title: 'Governança e autenticidade',
    subtitle: 'Valide o documento pelo QR Code ou pelo código público.',
  });
}

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
    criticality: 'moderate',
    documentClass: 'operational',
  });

  drawExecutiveSummaryStrip(ctx, {
    title: 'Sintese executiva',
    summary:
      'Registro operacional de alinhamento da atividade programada para o dia, consolidando planejamento, riscos e controles do turno.',
    metrics: [
      {
        label: 'Atividade principal',
        value: sanitize(did.atividade_principal),
        tone: 'info',
      },
      { label: 'Turno', value: sanitize(did.turno), tone: 'default' },
      { label: 'Status', value: sanitize(did.status), tone: 'warning' },
      {
        label: 'Participantes',
        value: participantCount,
        tone: participantCount > 0 ? 'success' : 'warning',
      },
      {
        label: 'Responsavel',
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
      { label: 'Titulo', value: did.titulo },
      { label: 'Empresa', value: did.company?.razao_social || did.company_id },
      { label: 'Data', value: formatDate(did.data) },
      { label: 'Site', value: did.site?.nome || did.site_id },
      { label: 'Responsavel', value: did.responsavel?.nome || did.responsavel_id },
      { label: 'Frente de trabalho', value: did.frente_trabalho },
      { label: 'Turno', value: did.turno },
      { label: 'Status', value: did.status },
      { label: 'Participantes', value: participantCount },
      { label: 'Atualizado em', value: formatDateTime(did.updated_at) },
    ],
  });

  drawNarrativeSection(ctx, {
    title: 'Descricao e objetivo',
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
    title: 'EPIs e EPCs aplicaveis',
    content: did.epi_epc_aplicaveis,
  });

  drawNarrativeSection(ctx, {
    title: 'Observacoes',
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
    title: 'Governanca e autenticidade',
    subtitle: 'Valide o documento pelo QR Code ou pelo codigo publico.',
  });
}

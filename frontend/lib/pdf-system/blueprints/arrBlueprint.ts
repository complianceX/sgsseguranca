import type { Arr } from '@/services/arrsService';
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
  if (status === 'tratada') return 'success' as const;
  if (status === 'analisada') return 'info' as const;
  if (status === 'rascunho') return 'warning' as const;
  return 'default' as const;
}

function buildCriticality(arr: Arr) {
  if (arr.status === 'arquivada') return 'Arquivado';
  if (arr.nivel_risco === 'critico') return 'Crítico';
  if (arr.nivel_risco === 'alto') return 'Alto';
  if (arr.nivel_risco === 'medio') return 'Moderado';
  return 'Baixo';
}

export async function drawArrBlueprint(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  arr: Arr,
  code: string,
  validationUrl: string,
) {
  const participantCount = arr.participants?.length ?? 0;

  drawDocumentIdentityRail(ctx, {
    documentType: 'ARR',
    criticality: buildCriticality(arr),
    documentClass: 'Operacional',
  });

  drawExecutiveSummaryStrip(ctx, {
    title: 'Síntese executiva',
    summary:
      'Registro enxuto para formalizar uma análise rápida de risco, a condição observada em campo e o tratamento imediato definido pela equipe.',
    metrics: [
      {
        label: 'Atividade principal',
        value: sanitize(arr.atividade_principal),
        tone: 'info',
      },
      {
        label: 'Nível de risco',
        value: sanitize(arr.nivel_risco),
        tone: arr.nivel_risco === 'critico' || arr.nivel_risco === 'alto'
          ? 'warning'
          : 'default',
      },
      {
        label: 'Probabilidade',
        value: sanitize(arr.probabilidade),
        tone: 'default',
      },
      {
        label: 'Severidade',
        value: sanitize(arr.severidade),
        tone: 'default',
      },
      {
        label: 'Status',
        value: sanitize(arr.status),
        tone: buildStatusTone(arr.status),
      },
      {
        label: 'Participantes',
        value: participantCount,
        tone: participantCount > 0 ? 'success' : 'warning',
      },
    ],
  });

  drawMetadataGrid(ctx, {
    title: 'Contexto documental',
    columns: 2,
    fields: [
      { label: 'Título', value: arr.titulo },
      { label: 'Empresa', value: arr.company?.razao_social || arr.company_id },
      { label: 'Data', value: formatDate(arr.data) },
      { label: 'Site / Obra', value: arr.site?.nome || arr.site_id },
      { label: 'Frente de trabalho', value: arr.frente_trabalho },
      { label: 'Responsável', value: arr.responsavel?.nome || arr.responsavel_id },
      { label: 'Criado em', value: formatDateTime(arr.created_at) },
      { label: 'Última atualização', value: formatDateTime(arr.updated_at) },
    ],
  });

  drawNarrativeSection(ctx, {
    title: 'Descrição / contexto',
    content: arr.descricao,
  });

  drawNarrativeSection(ctx, {
    title: 'Condição observada',
    content: arr.condicao_observada,
  });

  drawNarrativeSection(ctx, {
    title: 'Risco identificado',
    content: arr.risco_identificado,
  });

  drawNarrativeSection(ctx, {
    title: 'Controles imediatos',
    content: arr.controles_imediatos,
  });

  drawNarrativeSection(ctx, {
    title: 'Ação recomendada',
    content: arr.acao_recomendada,
  });

  drawNarrativeSection(ctx, {
    title: 'EPIs e EPCs aplicáveis',
    content: arr.epi_epc_aplicaveis,
  });

  drawNarrativeSection(ctx, {
    title: 'Observações',
    content: arr.observacoes,
  });

  drawParticipantTable(
    ctx,
    autoTable,
    `Participantes (${participantCount})`,
    (arr.participants || []).map((participant) => ({
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

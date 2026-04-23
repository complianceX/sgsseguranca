/**
 * Ferramentas (tools) do Agente SST.
 *
 * Dois artefatos:
 * 1. SST_TOOL_DEFINITIONS - definicoes no formato Anthropic API
 * 2. SstToolsExecutor - servico NestJS que executa as ferramentas
 *
 * Stubs marcados com is_stub=true — sem dados em tempo real.
 * O service usa STUB_TOOL_NAMES para reduzir confidence automaticamente.
 *
 * Para conectar uma ferramenta stub:
 *   1. Injete o service no construtor
 *   2. Substitua o metodo stub pela implementacao real
 *   3. Remova o nome de STUB_TOOL_NAMES em sst-agent.types.ts
 */

import { Injectable, Logger } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { TrainingsService } from '../../trainings/trainings.service';
import { MedicalExamsService } from '../../medical-exams/medical-exams.service';
import { CatsService } from '../../cats/cats.service';
import { NonConformitiesService } from '../../nonconformities/nonconformities.service';
import { ServiceOrdersService } from '../../service-orders/service-orders.service';
import { AprsService } from '../../aprs/aprs.service';
import { EpisService } from '../../epis/epis.service';
import { SstToolResult } from './sst-agent.types';
export { sanitizeForAi } from '../openai-payload-boundary.util';

// ---------------------------------------------------------------------------
// Sanitização de PII — rede de segurança (LGPD)
// A minimização primária ocorre em cada método de ferramenta.
// Esta função é a última defesa antes de enviar dados para a OpenAI.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Definicoes de ferramentas para a API da Anthropic
// ---------------------------------------------------------------------------

export const SST_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'buscar_treinamentos_pendentes',
    description:
      'Busca treinamentos com prazo de validade proximo ou vencido. DADOS REAIS do sistema.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dias: { type: 'number', description: 'Janela de dias. Padrao: 30.' },
      },
    },
  },
  {
    name: 'buscar_exames_medicos_pendentes',
    description:
      'Busca exames medicos (ASOs/PCMSO) proximos do vencimento ou vencidos. ' +
      'Referencia: NR-7. DADOS REAIS do sistema.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dias: { type: 'number', description: 'Janela de dias. Padrao: 30.' },
      },
    },
  },
  {
    name: 'buscar_estatisticas_cats',
    description:
      'Busca estatisticas de CATs: total, por tipo, por gravidade, evolucao mensal. DADOS REAIS.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'gerar_resumo_sst',
    description:
      'Gera resumo geral do status SST da empresa. DADOS PARCIALMENTE REAIS.' +
      ' Use como ponto de partida para diagnosticos gerais.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'buscar_nao_conformidades',
    description:
      'Nao conformidades abertas ou em andamento. ' +
      'ATENCAO: integracao em desenvolvimento - retorna orientacao de acesso.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          description: 'aberta, em_andamento, concluida, cancelada.',
        },
      },
    },
  },
  {
    name: 'buscar_epis',
    description:
      'EPIs cadastrados e validade do CA (Certificado de Aprovacao). Referencia: NR-6. DADOS REAIS.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dias: {
          type: 'number',
          description:
            'Janela de dias para CA proximo do vencimento. Padrao: 30.',
        },
      },
    },
  },
  {
    name: 'buscar_riscos',
    description:
      'Riscos ocupacionais identificados nas APRs e PTAs. Referencia: NR-1, NR-9 (PGR). ' +
      'ATENCAO: integracao em desenvolvimento.',
    input_schema: {
      type: 'object' as const,
      properties: {
        setor_id: {
          type: 'string',
          description: 'ID do setor/obra (opcional).',
        },
      },
    },
  },
  {
    name: 'buscar_ordens_de_servico',
    description:
      'Ordens de Servico (NR-1) ativas ou pendentes. ' +
      'ATENCAO: integracao em desenvolvimento.',
    input_schema: { type: 'object' as const, properties: {} },
  },
];

type OpenAiToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties?: Record<string, unknown>;
    };
  };
};

type LooseRecord = Record<string, unknown>;

const isLooseRecord = (value: unknown): value is LooseRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const OPENAI_TOOL_DEFINITIONS: OpenAiToolDefinition[] =
  SST_TOOL_DEFINITIONS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description ?? '',
      parameters: {
        type: 'object',
        properties:
          'input_schema' in tool &&
          tool.input_schema &&
          'properties' in tool.input_schema
            ? (tool.input_schema.properties as Record<string, unknown>)
            : {},
      },
    },
  }));

// ---------------------------------------------------------------------------
// Executor de ferramentas
// ---------------------------------------------------------------------------

@Injectable()
export class SstToolsExecutor {
  private readonly logger = new Logger(SstToolsExecutor.name);

  constructor(
    private readonly trainingsService: TrainingsService,
    private readonly medicalExamsService: MedicalExamsService,
    private readonly catsService: CatsService,
    private readonly nonConformitiesService: NonConformitiesService,
    private readonly serviceOrdersService: ServiceOrdersService,
    private readonly aprsService: AprsService,
    private readonly episService: EpisService,
  ) {}

  private toLooseRecordArray(value: unknown): LooseRecord[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(isLooseRecord);
  }

  private toSafeString(value: unknown): string {
    if (typeof value === 'string') {
      return value.trim();
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }

    return '';
  }

  /**
   * Executa uma ferramenta pelo nome.
   * Erros sao capturados — nunca propaga excecao para o agente.
   */
  async execute(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<SstToolResult> {
    this.logger.debug(
      `[SstTool] ${toolName} | input: ${JSON.stringify(input)}`,
    );

    try {
      switch (toolName) {
        case 'buscar_treinamentos_pendentes':
          return await this.buscarTreinamentosPendentes(
            Number(input.dias ?? 30),
          );

        case 'buscar_exames_medicos_pendentes':
          return await this.buscarExamesMedicosPendentes(
            Number(input.dias ?? 30),
          );

        case 'buscar_estatisticas_cats':
          return await this.buscarEstatisticasCats();

        case 'gerar_resumo_sst':
          return await this.gerarResumoSst();

        case 'buscar_nao_conformidades':
          return await this.buscarNaoConformidades(
            input.status as string | undefined,
          );

        case 'buscar_epis':
          return await this.buscarEpis(Number(input.dias ?? 30));

        case 'buscar_riscos':
          return await this.buscarRiscos(input.setor_id as string | undefined);

        case 'buscar_ordens_de_servico':
          return await this.buscarOrdensDeServico();

        default:
          this.logger.warn(`[SstTool] Ferramenta desconhecida: ${toolName}`);
          return {
            success: false,
            error: `Ferramenta nao reconhecida: ${toolName}`,
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[SstTool] Erro em ${toolName}: ${message}`);
      return { success: false, error: `Erro ao consultar dados: ${message}` };
    }
  }

  // -------------------------------------------------------------------------
  // Implementacoes reais (dados do sistema)
  // -------------------------------------------------------------------------

  private async buscarTreinamentosPendentes(
    dias: number,
  ): Promise<SstToolResult> {
    const summary = await this.trainingsService.findExpirySummary();
    // summary contém apenas contagens agregadas — sem nomes ou dados individuais
    return {
      success: true,
      is_stub: false,
      data: {
        ...summary,
        janela_dias: dias,
        link: '/dashboard/trainings',
        norma: 'NR-1 e legislacao especifica por categoria de treinamento.',
        sanitized_for_ai: true,
      },
    };
  }

  private async buscarExamesMedicosPendentes(
    dias: number,
  ): Promise<SstToolResult> {
    const summary = await this.medicalExamsService.findExpirySummary();
    // summary contém apenas contagens agregadas (NR-7) — sem nome, CPF ou resultado individual
    return {
      success: true,
      is_stub: false,
      data: {
        ...summary,
        janela_dias: dias,
        link: '/dashboard/medical-exams',
        norma: 'NR-7 (PCMSO): exames periodicos obrigatorios conforme PCMSO.',
        sanitized_for_ai: true,
      },
    };
  }

  private async buscarEstatisticasCats(): Promise<SstToolResult> {
    const stats = await this.catsService.getStatistics();
    // stats contém apenas totais e agrupamentos — sem trabalhador identificado
    return {
      success: true,
      is_stub: false,
      data: {
        ...stats,
        link: '/dashboard/kpis',
        aviso:
          'CAT deve ser emitida em ate 1 dia util apos o acidente (CLT art. 22). ' +
          'Casos fatais exigem comunicacao imediata ao INSS.',
        sanitized_for_ai: true,
      },
    };
  }

  private async gerarResumoSst(): Promise<SstToolResult> {
    const [treinamentos, exames] = await Promise.allSettled([
      this.trainingsService.findExpirySummary(),
      this.medicalExamsService.findExpirySummary(),
    ]);

    return {
      success: true,
      is_stub: false,
      data: {
        treinamentos:
          treinamentos.status === 'fulfilled'
            ? treinamentos.value
            : { erro: 'Servico indisponivel.' },
        exames_medicos:
          exames.status === 'fulfilled'
            ? exames.value
            : { erro: 'Servico indisponivel.' },
        modulos_sistema: {
          treinamentos: '/dashboard/trainings',
          exames_medicos: '/dashboard/medical-exams',
          nao_conformidades: '/dashboard/nonconformities',
          epis: '/dashboard/epis',
          kpis: '/dashboard/kpis',
          mapa_de_risco: '/dashboard/risk-map',
          ordens_de_servico: '/dashboard/service-orders',
        },
        aviso: 'Resumo parcial. NCs, EPIs, Riscos e OS estao em integracao.',
        sanitized_for_ai: true,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Implementacoes reais — conectadas (antes stubs)
  // -------------------------------------------------------------------------

  private async buscarNaoConformidades(
    status?: string,
  ): Promise<SstToolResult> {
    const summary = await this.nonConformitiesService.summarizeByStatus(status);
    // Retorna apenas totais e agrupamentos — sem descrição ou responsável individual
    return {
      success: true,
      is_stub: false,
      data: {
        total: summary.total,
        filtrado: summary.filtered,
        filtro_status: summary.filterStatus,
        por_status: summary.byStatus,
        link: '/dashboard/nonconformities',
        referencia:
          'NR-1: nao conformidades devem ser registradas e tratadas no SGS.',
        sanitized_for_ai: true,
      },
    };
  }

  private async buscarEpis(dias: number): Promise<SstToolResult> {
    const summary = await this.episService.findCaExpirySummary(dias);
    // summary retorna contagens de CAs vencidos/próximos — sem dados de trabalhadores
    return {
      success: true,
      is_stub: false,
      data: {
        ...summary,
        link: '/dashboard/epis',
        referencia:
          'NR-6, item 6.3: empregador deve exigir EPI com CA valido emitido pelo MTE.',
        sanitized_for_ai: true,
      },
    };
  }

  private async buscarRiscos(setorId?: string): Promise<SstToolResult> {
    const { matrix } = await this.aprsService.getRiskMatrix(setorId);
    const normalizedMatrix = this.toLooseRecordArray(matrix);
    const total = normalizedMatrix.reduce(
      (acc, risk) => acc + Number(risk.count ?? 0),
      0,
    );
    const alto = normalizedMatrix.filter(
      (risk) => Number(risk.prob ?? 0) * Number(risk.sev ?? 0) >= 10,
    );
    // matrix contém: categoria, probabilidade, severidade, count — sem trabalhadores
    return {
      success: true,
      is_stub: false,
      data: {
        total_riscos: total,
        riscos_alto_nivel: alto.length,
        matrix: normalizedMatrix,
        setor_id: setorId ?? null,
        link: '/dashboard/risk-map',
        referencia:
          'NR-1: GRO — PGR exige identificacao e avaliacao de riscos ocupacionais.',
        sanitized_for_ai: true,
      },
    };
  }

  private async buscarOrdensDeServico(): Promise<SstToolResult> {
    const page = await this.serviceOrdersService.findPaginated({
      status: 'ativo',
      limit: 50,
    });
    // LGPD: remover responsavel.nome (PII) — enviar apenas número, título e site
    const orders = this.toLooseRecordArray(page.data).map((serviceOrder) => {
      const site = isLooseRecord(serviceOrder.site) ? serviceOrder.site : null;
      return {
        numero: this.toSafeString(serviceOrder.numero),
        titulo: this.toSafeString(serviceOrder.titulo),
        data_emissao: serviceOrder.data_emissao,
        site: this.toSafeString(site?.nome) || null,
        // responsavel omitido intencionalmente (LGPD — nome é PII)
      };
    });
    return {
      success: true,
      is_stub: false,
      data: {
        total_ativas: page.total,
        ordens: orders,
        link: '/dashboard/service-orders',
        referencia:
          'NR-1, item 1.5.4: OS obrigatoria para orientar trabalhadores sobre riscos.',
        sanitized_for_ai: true,
      },
    };
  }
}

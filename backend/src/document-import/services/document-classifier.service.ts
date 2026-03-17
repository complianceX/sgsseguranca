import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../../ai/ai.service';

interface ClassificationResult {
  tipoDocumento: string;
  score: number;
  keywords: string[];
}

@Injectable()
export class DocumentClassifierService {
  private readonly logger = new Logger(DocumentClassifierService.name);

  private readonly documentPatterns = {
    DDS: {
      keywords: [
        'dialogo diario de seguranca',
        'dds',
        'tema',
        'participantes',
        'facilitador',
        'dialogo',
        'seguranca',
      ],
      weight: 0.95,
    },
    APR: {
      keywords: [
        'análise preliminar de risco',
        'apr',
        'risco',
        'atividade',
        'equipamento',
        'epi',
        'nr-6',
        'nr-12',
        'perigo',
        'medida de controle',
        'apto',
        'inapto',
      ],
      weight: 1.0,
    },
    PT: {
      keywords: [
        'permissao de trabalho',
        'pt',
        'trabalho em altura',
        'espaco confinado',
        'trabalho a quente',
        'aprovacao',
        'liberacao',
      ],
      weight: 0.98,
    },
    PGR: {
      keywords: [
        'programa de gerenciamento de riscos',
        'pgr',
        'gestão de riscos',
        'mapa de riscos',
        'ppra',
        'pcmat',
        'nr-1',
        'nr-9',
        'avaliação ambiental',
        'controle médico',
      ],
      weight: 0.9,
    },
    PCMSO: {
      keywords: [
        'programa de controle médico de saúde ocupacional',
        'pcmso',
        'aso',
        'exame médico',
        'nr-7',
        'saúde ocupacional',
        'clínico',
        'laboratorial',
        'aptidão',
        'periódico',
        'admissional',
        'demissional',
        'retorno ao trabalho',
      ],
      weight: 0.95,
    },
    ASO: {
      keywords: [
        'atestado de saúde ocupacional',
        'aso',
        'exame admissional',
        'exame periódico',
        'exame demissional',
        'médico',
        'clínico',
        'apto',
        'inapto',
        'restrições',
        'nr-7',
        'cargo',
        'função',
        'resultados exames',
      ],
      weight: 0.85,
    },
    CHECKLIST: {
      keywords: [
        'checklist',
        'lista de verificação',
        'item',
        'conforme',
        'não conforme',
        'ok',
        'nok',
        'observações',
        'vistoria',
        'inspeção',
        'diária',
        'equipamento',
        'ferramenta',
        'área',
        'segurança',
      ],
      weight: 0.8,
    },
    INSPECTION: {
      keywords: [
        'relatorio fotografico',
        'registro fotografico',
        'evidencias',
        'inspecao de rotina',
        'fotos',
        'setor',
        'subestacao',
      ],
      weight: 0.82,
    },
    NC: {
      keywords: [
        'nao conformidade',
        'não conformidade',
        'desvio',
        'acao corretiva',
        'plano de acao',
        'tratativa',
      ],
      weight: 0.84,
    },
  };

  constructor(private readonly aiService: AiService) {}

  async classifyDocument(text: string): Promise<ClassificationResult> {
    this.logger.log('Iniciando classificação do documento...');

    const normalizedText = this.normalizeText(text);
    const results: ClassificationResult[] = [];

    // Tenta IA primeiro (JSON estrito)
    const aiResult = await this.classifyWithAI(normalizedText);
    if (aiResult) {
      return aiResult;
    }

    for (const [documentType, pattern] of Object.entries(
      this.documentPatterns,
    )) {
      const score = this.calculateMatchScore(
        normalizedText,
        pattern.keywords,
        pattern.weight,
      );
      const foundKeywords = this.findMatchingKeywords(
        normalizedText,
        pattern.keywords,
      );

      if (score > 0.3) {
        // Threshold mínimo para considerar
        results.push({
          tipoDocumento: documentType,
          score,
          keywords: foundKeywords,
        });
      }
    }

    if (results.length === 0) {
      this.logger.warn('Documento não pôde ser classificado');
      return {
        tipoDocumento: 'DESCONHECIDO',
        score: 0,
        keywords: [],
      };
    }

    // Ordena por score descendente
    results.sort((a, b) => b.score - a.score);

    const bestMatch = results[0];

    this.logger.log(
      `Documento classificado como: ${bestMatch.tipoDocumento} (score: ${bestMatch.score.toFixed(2)})`,
    );

    return bestMatch;
  }

  private async classifyWithAI(
    normalizedText: string,
  ): Promise<ClassificationResult | null> {
    try {
      const prompt = `
Classifique o documento abaixo como um dos tipos: "DDS", "APR", "PT", "CHECKLIST", "INSPECTION", "NC", "PGR", "PCMSO", "ASO", "OUTRO".
Retorne apenas JSON no formato: {"tipo": "DDS", "score": number, "motivos": ["motivo1","motivo2"]}.

Texto:
${normalizedText.slice(0, 8000)}
`;
      const response = await this.aiService.generateJson<
        Record<string, unknown>
      >(prompt, 400);

      const tipo =
        typeof response?.tipo === 'string' ? response.tipo : undefined;
      const score =
        typeof response?.score === 'number'
          ? response.score
          : typeof response?.score === 'string'
            ? Number(response.score)
            : undefined;
      const motivos = Array.isArray(response?.motivos)
        ? (response.motivos as unknown[]).filter(
            (m): m is string => typeof m === 'string',
          )
        : [];

      if (tipo) {
        const scoreValue = Number.isFinite(score) ? (score as number) : 0.8;
        return {
          tipoDocumento: tipo.toUpperCase(),
          score: scoreValue,
          keywords: motivos,
        };
      }
      return null;
    } catch (err) {
      this.logger.warn(
        `Classificação via IA falhou, usando fallback regex: ${
          (err as Error).message
        }`,
      );
      return null;
    }
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9\s]/g, ' ') // Remove caracteres especiais
      .replace(/\s+/g, ' ') // Normaliza espaços
      .trim();
  }

  private calculateMatchScore(
    text: string,
    keywords: string[],
    weight: number,
  ): number {
    let score = 0;
    let matches = 0;

    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        matches++;
        // Pontuação baseada na posição da keyword (mais relevante no início)
        const position = text.indexOf(keyword);
        const positionScore = Math.max(0, 1 - position / text.length);
        score += positionScore;
      }
    }

    // Normaliza pelo número máximo possível de matches
    const maxPossibleMatches = keywords.length;
    const matchRatio = matches / maxPossibleMatches;

    // Combina match ratio com peso do tipo de documento
    return (matchRatio * 0.7 + score * 0.3) * weight;
  }

  private findMatchingKeywords(text: string, keywords: string[]): string[] {
    return keywords.filter((keyword) => text.includes(keyword));
  }

  getDocumentTypeDescription(tipoDocumento: string): string {
    const descriptions: Record<string, string> = {
      DDS: 'Diálogo Diário de Segurança',
      APR: 'Análise Preliminar de Risco',
      PT: 'Permissão de Trabalho',
      INSPECTION: 'Relatório Fotográfico de Inspeção',
      RELATORIO: 'Relatório Fotográfico de Inspeção',
      NC: 'Não Conformidade',
      PGR: 'Programa de Gerenciamento de Riscos',
      PCMSO: 'Programa de Controle Médico de Saúde Ocupacional',
      ASO: 'Atestado de Saúde Ocupacional',
      CHECKLIST: 'Checklist de Segurança',
      DESCONHECIDO: 'Tipo de Documento Desconhecido',
    };

    return descriptions[tipoDocumento] || 'Documento não identificado';
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { DocumentAnalysisDto } from '../dto/document-analysis.dto';
import { AiService } from '../../ai/ai.service';

@Injectable()
export class DocumentInterpreterService {
  private readonly logger = new Logger(DocumentInterpreterService.name);

  constructor(private readonly aiService: AiService) {}

  async interpretDocument(
    text: string,
    tipoDocumento: string,
  ): Promise<DocumentAnalysisDto> {
    this.logger.log(`Interpretando documento do tipo: ${tipoDocumento}`);

    const normalizedText = this.normalizeText(text);

    const aiExtraction = await this.extractWithAI(
      normalizedText,
      tipoDocumento,
    );
    const campos: Record<string, unknown> = aiExtraction || {};

    const analysis: DocumentAnalysisDto = {
      empresa:
        this.pickString(campos, 'empresa') ||
        this.extractCompany(normalizedText),
      cnpj: this.pickString(campos, 'cnpj') || this.extractCnpj(normalizedText),
      data:
        this.pickDateFromObject(campos, 'data') ||
        this.extractDate(normalizedText),
      responsavelTecnico:
        this.pickString(campos, 'responsavel') ||
        this.pickString(campos, 'responsavelTecnico') ||
        this.extractResponsavelTecnico(normalizedText),
      nrsCitadas:
        this.pickStringArray(campos['nrsCitadas']) ||
        this.extractNrs(normalizedText),
      riscos:
        this.pickStringArray(campos['riscos']) ||
        this.extractRiscos(normalizedText, tipoDocumento),
      epis:
        this.pickStringArray(campos['epis']) ||
        this.extractEpis(normalizedText),
      assinaturas:
        this.pickStringArray(campos['assinaturas']) ||
        this.extractAssinaturas(normalizedText),
      tipoDocumento,
      tipoNormalizado: this.pickString(campos, 'tipoNormalizado'),
      camposEstruturados: aiExtraction || undefined,
      scoreConfianca:
        this.pickNumber(campos, 'scoreConfianca') ||
        this.calculateConfidenceScore(normalizedText, tipoDocumento),
      tema: this.pickString(campos, 'tema'),
      conteudo: this.pickString(campos, 'conteudo'),
      resumo: this.pickString(campos, 'resumo'),
    };

    this.logger.log('Interpretação concluída');
    return analysis;
  }

  private async extractWithAI(
    normalizedText: string,
    tipoDocumento: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const basePrompt = `
Você é um assistente de SST. Extraia campos do documento abaixo e retorne JSON estrito.
Campos comuns: empresa, cnpj, data (YYYY-MM-DD), responsavel, participantes (array nome/funcao), tema, resumo, riscos (array), epis (array).
Tipo: ${tipoDocumento}
Retorne apenas JSON, sem texto extra.

Documento:
${normalizedText.slice(0, 9000)}
`;

      const promptPorTipo: Record<string, string> = {
        DDS: `
Tipo DDS. Campos esperados:
{
  "tipo": "DDS",
  "empresa": "...",
  "cnpj": "...",
  "data": "YYYY-MM-DD",
  "tema": "...",
  "responsavel": "...",
  "participantes": [{"nome": "...", "funcao": "..."}]
}
`,
        APR: `
Tipo APR. Campos esperados:
{
  "tipo": "APR",
  "empresa": "...",
  "cnpj": "...",
  "data": "YYYY-MM-DD",
  "responsavel": "...",
  "atividade": "...",
  "riscos": ["..."],
  "epis": ["..."],
  "participantes": [{"nome": "...", "funcao": "..."}]
}
`,
        PGR: `
Tipo PGR. Campos esperados:
{
  "tipo": "PGR",
  "empresa": "...",
  "cnpj": "...",
  "data": "YYYY-MM-DD",
  "responsavel": "...",
  "riscos": ["..."],
  "nrsCitadas": ["NR-..."],
  "resumo": "..."
}
`,
      };

      const prompt =
        basePrompt + (promptPorTipo[tipoDocumento] || promptPorTipo.DDS);

      const extraction = await this.aiService.generateJson<
        Record<string, unknown>
      >(prompt, 1200);
      return extraction || null;
    } catch (err) {
      this.logger.warn(
        `Extração via IA falhou, usando heurísticas locais: ${
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
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractCompany(text: string): string {
    const companyPatterns = [
      /empresa[:\s]+([^\n.]+)/i,
      /razão social[:\s]+([^\n.]+)/i,
      /nome da empresa[:\s]+([^\n.]+)/i,
      /contratante[:\s]+([^\n.]+)/i,
    ];

    for (const pattern of companyPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return '';
  }

  private extractCnpj(text: string): string {
    const cnpjPatterns = [
      /cnpj[:\s]*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i,
      /cnpj[:\s]*(\d{14})/i,
      /cadastro nacional da pessoa jurídica[:\s]*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i,
    ];

    for (const pattern of cnpjPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].replace(/\D/g, ''); // Remove não-dígitos
      }
    }

    return '';
  }

  private extractDate(text: string): Date | null {
    const datePatterns = [
      /data[:\s]*(\d{2}[/-]\d{2}[/-]\d{4})/i,
      /em\s+(\d{1,2}\s+de\s+[a-z]+\s+de\s+\d{4})/i,
      /(\d{2}[/-]\d{2}[/-]\d{4})/,
      /(\d{1,2}\s+de\s+[a-z]+\s+de\s+\d{4})/i,
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        try {
          const dateStr = match[1].replace(/de\s+/g, '').replace(/\s+/g, '-');
          return new Date(dateStr);
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  private extractResponsavelTecnico(text: string): string {
    const patterns = [
      /responsável técnico[:\s]+([^\n.]+)/i,
      /rt[:\s]+([^\n.]+)/i,
      /engenheiro[:\s]+([^\n.]+)/i,
      /técnico[:\s]+([^\n.]+)/i,
      /crea[:\s]*[\w\s]+\(([^)]+)\)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return '';
  }

  private extractNrs(text: string): string[] {
    const nrPattern = /nr[-\s]*(\d+)/gi;
    const nrs = new Set<string>();

    let match: RegExpExecArray | null;
    while ((match = nrPattern.exec(text)) !== null) {
      nrs.add(`NR-${match[1]}`);
    }

    return Array.from(nrs);
  }

  private extractRiscos(text: string, _tipoDocumento: string): string[] {
    const riscos = new Set<string>();
    const riskKeywords = [
      'químico',
      'físico',
      'biológico',
      'ergonômico',
      'acidente',
      'queda',
      'eletricidade',
      'incêndio',
      'explosão',
      'ruído',
      'vibração',
      'radiação',
      'temperatura',
      'pressão',
      'cortante',
      'perfurante',
      'inflamável',
      'tóxico',
      'corrosivo',
      'poeira',
      'fumaça',
      'vapor',
      'gás',
      'névoa',
      'neblina',
      'fadiga',
      'repetitividade',
      'postura',
      'levantamento',
      'esforço',
    ];

    for (const keyword of riskKeywords) {
      if (text.includes(keyword)) {
        riscos.add(keyword.charAt(0).toUpperCase() + keyword.slice(1));
      }
    }

    return Array.from(riscos);
  }

  private extractEpis(text: string): string[] {
    const epis = new Set<string>();
    const epiPatterns = [
      /epi[:\s]+([^\n.]+)/gi,
      /equipamento de proteção individual[:\s]+([^\n.]+)/gi,
      /(capacete|óculos|luva|botina|mascara|protetor auricular|cinto)/gi,
    ];

    for (const pattern of epiPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach((match) => epis.add(match.trim()));
      }
    }

    return Array.from(epis);
  }

  private extractAssinaturas(text: string): string[] {
    const signatures = new Set<string>();
    const signaturePatterns = [
      /assinatura[:\s]+([^\n.]+)/gi,
      /assinado por[:\s]+([^\n.]+)/gi,
      /(\b[a-z]+\s+[a-z]+\b)(?=\s+assin)/gi,
    ];

    for (const pattern of signaturePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach((match) => signatures.add(match.trim()));
      }
    }

    return Array.from(signatures);
  }

  private calculateConfidenceScore(
    text: string,
    tipoDocumento: string,
  ): number {
    let score = 0;

    // Pontuação baseada na presença de informações críticas
    if (this.extractCompany(text)) score += 0.2;
    if (this.extractCnpj(text)) score += 0.2;
    if (this.extractDate(text)) score += 0.15;
    if (this.extractResponsavelTecnico(text)) score += 0.15;
    if (this.extractNrs(text).length > 0) score += 0.1;
    if (this.extractAssinaturas(text).length > 0) score += 0.2;

    // Ajusta baseado no tipo de documento
    const typeMultipliers: Record<string, number> = {
      APR: 1.0,
      PGR: 0.9,
      PCMSO: 0.95,
      ASO: 0.85,
      CHECKLIST: 0.8,
      RELATORIO: 0.75,
      DESCONHECIDO: 0.5,
    };

    return Math.min(1, score) * (typeMultipliers[tipoDocumento] || 0.5);
  }

  private pickStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const filtered = value.filter((v): v is string => typeof v === 'string');
    return filtered.length > 0 ? filtered : undefined;
  }

  private pickDate(value: unknown): Date | null {
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (value instanceof Date) {
      return value;
    }
    return null;
  }

  private pickDateFromObject(
    source: Record<string, unknown>,
    key: string,
  ): Date | null {
    return this.pickDate(source?.[key]);
  }

  private pickString(
    source: Record<string, unknown>,
    key: string,
  ): string | undefined {
    const value = source?.[key];
    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }

  private pickNumber(
    source: Record<string, unknown>,
    key: string,
  ): number | undefined {
    const value = source?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }
}

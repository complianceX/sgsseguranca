import { Injectable, Logger } from '@nestjs/common';
import { DocumentAnalysisDto } from '../dto/document-analysis.dto';
import {
  DocumentValidationResultDto,
  DocumentValidationStatus,
} from '../dto/document-analysis.dto';

@Injectable()
export class DocumentValidationService {
  private readonly logger = new Logger(DocumentValidationService.name);

  validateDocument(analysis: DocumentAnalysisDto): DocumentValidationResultDto {
    this.logger.log('Iniciando validação do documento...');

    const pendencias: string[] = [];
    let scoreBase = analysis.scoreConfianca || 0.5;

    // Validações específicas por tipo de documento
    switch (analysis.tipoDocumento) {
      case 'DDS':
        pendencias.push(...this.validateDds(analysis));
        break;
      case 'APR':
        pendencias.push(...this.validateApr(analysis));
        break;
      case 'PT':
        pendencias.push(...this.validatePt(analysis));
        break;
      case 'PGR':
        pendencias.push(...this.validatePgr(analysis));
        break;
      case 'PCMSO':
        pendencias.push(...this.validatePcmso(analysis));
        break;
      case 'ASO':
        pendencias.push(...this.validateAso(analysis));
        break;
      case 'CHECKLIST':
        pendencias.push(...this.validateChecklist(analysis));
        break;
      case 'INSPECTION':
      case 'RELATORIO':
        pendencias.push(...this.validateInspection(analysis));
        break;
      case 'NC':
        pendencias.push(...this.validateNc(analysis));
        break;
      default:
        pendencias.push('Tipo de documento não reconhecido');
        scoreBase *= 0.7;
    }

    // Validações gerais obrigatórias
    pendencias.push(...this.validateGeneralRequirements(analysis));

    // Calcula score final baseado nas pendências
    const finalScore = this.calculateFinalScore(scoreBase, pendencias);

    // Determina status com base no score e pendências críticas
    const status = this.determineValidationStatus(finalScore, pendencias);

    const result: DocumentValidationResultDto = {
      status,
      pendencias,
      scoreConfianca: finalScore,
    };

    this.logger.log(
      `Validação concluída: ${status} (score: ${finalScore.toFixed(2)})`,
    );

    return result;
  }

  private validateApr(analysis: DocumentAnalysisDto): string[] {
    const pendencias: string[] = [];

    if (!analysis.data) {
      pendencias.push('Data da análise de risco não identificada');
    }

    if (!analysis.responsavelTecnico) {
      pendencias.push('Responsável técnico não identificado');
    }

    if (!analysis.riscos || analysis.riscos.length === 0) {
      pendencias.push('Nenhum risco identificado na análise');
    }

    if (
      (!analysis.epis || analysis.epis.length === 0) &&
      analysis.riscos &&
      analysis.riscos.length > 0
    ) {
      pendencias.push('EPIs não especificados para os riscos identificados');
    }

    return pendencias;
  }

  private validateDds(analysis: DocumentAnalysisDto): string[] {
    const pendencias: string[] = [];

    if (!analysis.data) {
      pendencias.push('Data do DDS não identificada');
    }

    if (!analysis.responsavelTecnico && !analysis.responsavel) {
      pendencias.push('Responsável pelo DDS não identificado');
    }

    if (!analysis.camposEstruturados?.participantes) {
      pendencias.push('Participantes do DDS não identificados');
    }

    return pendencias;
  }

  private validatePt(analysis: DocumentAnalysisDto): string[] {
    const pendencias: string[] = [];

    if (!analysis.data) {
      pendencias.push('Data da permissão de trabalho não identificada');
    }

    if (!analysis.responsavelTecnico && !analysis.responsavel) {
      pendencias.push('Responsável pela PT não identificado');
    }

    if (!analysis.riscos || analysis.riscos.length === 0) {
      pendencias.push('Riscos da PT não identificados');
    }

    return pendencias;
  }

  private validatePgr(analysis: DocumentAnalysisDto): string[] {
    const pendencias: string[] = [];

    if (!analysis.empresa) {
      pendencias.push('Nome da empresa não identificado');
    }

    if (!analysis.cnpj) {
      pendencias.push('CNPJ da empresa não identificado');
    }

    if (!analysis.nrsCitadas || analysis.nrsCitadas.length === 0) {
      pendencias.push('Nenhuma NR citada no programa');
    }

    return pendencias;
  }

  private validatePcmso(analysis: DocumentAnalysisDto): string[] {
    const pendencias: string[] = [];

    if (!analysis.empresa) {
      pendencias.push('Nome da empresa não identificado');
    }

    if (!analysis.cnpj) {
      pendencias.push('CNPJ da empresa não identificado');
    }

    if (!analysis.responsavelTecnico) {
      pendencias.push('Médico coordenador não identificado');
    }

    return pendencias;
  }

  private validateAso(analysis: DocumentAnalysisDto): string[] {
    const pendencias: string[] = [];

    if (!analysis.data) {
      pendencias.push('Data do exame não identificada');
    }

    if (!analysis.responsavelTecnico) {
      pendencias.push('Médico responsável não identificado');
    }

    if (!analysis.assinaturas || analysis.assinaturas.length === 0) {
      pendencias.push('Assinatura do médico não identificada');
    }

    return pendencias;
  }

  private validateChecklist(analysis: DocumentAnalysisDto): string[] {
    const pendencias: string[] = [];

    if (!analysis.data) {
      pendencias.push('Data da inspeção não identificada');
    }

    if (!analysis.responsavelTecnico) {
      pendencias.push('Inspetor não identificado');
    }

    return pendencias;
  }

  private validateInspection(analysis: DocumentAnalysisDto): string[] {
    const pendencias: string[] = [];

    if (!analysis.data) {
      pendencias.push('Data do relatório fotográfico não identificada');
    }

    if (!analysis.responsavelTecnico) {
      pendencias.push('Responsável pela inspeção não identificado');
    }

    if (!analysis.resumo && !analysis.tema) {
      pendencias.push('Tema ou resumo da inspeção não identificado');
    }

    return pendencias;
  }

  private validateNc(analysis: DocumentAnalysisDto): string[] {
    const pendencias: string[] = [];

    if (!analysis.data) {
      pendencias.push('Data da não conformidade não identificada');
    }

    if (!analysis.responsavelTecnico && !analysis.responsavel) {
      pendencias.push('Responsável pela não conformidade não identificado');
    }

    if (!analysis.riscos || analysis.riscos.length === 0) {
      pendencias.push(
        'Desvio ou risco relacionado à não conformidade não identificado',
      );
    }

    return pendencias;
  }

  private validateGeneralRequirements(analysis: DocumentAnalysisDto): string[] {
    const pendencias: string[] = [];

    // Validações críticas que afetam todos os tipos de documentos
    if (!analysis.empresa) {
      pendencias.push('Informação da empresa não encontrada');
    }

    if (!analysis.data) {
      pendencias.push('Data do documento não identificada');
    }

    if (!analysis.responsavelTecnico) {
      pendencias.push('Responsável técnico não identificado');
    }

    if (!analysis.assinaturas || analysis.assinaturas.length === 0) {
      pendencias.push('Assinaturas não detectadas');
    }

    return pendencias;
  }

  private calculateFinalScore(baseScore: number, pendencias: string[]): number {
    let score = baseScore;

    // Penalizações baseadas no número e tipo de pendências
    const criticalPendencias = pendencias.filter(
      (p) =>
        p.includes('não identificada') ||
        p.includes('não encontrada') ||
        p.includes('não detectadas'),
    );

    const warningPendencias = pendencias.filter(
      (p) => p.includes('não especificados') || p.includes('não citada'),
    );

    // Penalizações
    score -= criticalPendencias.length * 0.15;
    score -= warningPendencias.length * 0.05;

    // Garante que o score fique entre 0 e 1
    return Math.max(0, Math.min(1, score));
  }

  private determineValidationStatus(
    score: number,
    pendencias: string[],
  ): DocumentValidationStatus {
    const criticalPendencias = pendencias.filter(
      (p) =>
        p.includes('não identificada') ||
        p.includes('não encontrada') ||
        p.includes('não detectadas'),
    );

    if (criticalPendencias.length > 2 || score < 0.4) {
      return DocumentValidationStatus.CRITICO;
    }

    if (score >= 0.7 && criticalPendencias.length === 0) {
      return DocumentValidationStatus.VALIDO;
    }

    return DocumentValidationStatus.INCOMPLETO;
  }

  getValidationRecommendations(pendencias: string[]): string[] {
    const recommendations: string[] = [];

    pendencias.forEach((pendencia) => {
      if (pendencia.includes('Data')) {
        recommendations.push(
          'Verifique se a data está claramente indicada no documento',
        );
      } else if (pendencia.includes('Responsável')) {
        recommendations.push(
          'Certifique-se de que o nome do responsável técnico está legível',
        );
      } else if (pendencia.includes('Assinatura')) {
        recommendations.push('A assinatura deve estar presente e legível');
      } else if (pendencia.includes('CNPJ')) {
        recommendations.push(
          'O CNPJ deve estar claramente indicado no documento',
        );
      } else if (pendencia.includes('Empresa')) {
        recommendations.push(
          'O nome da empresa deve estar presente no documento',
        );
      }
    });

    return recommendations;
  }
}

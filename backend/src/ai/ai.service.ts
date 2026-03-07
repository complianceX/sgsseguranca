import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor() {
    this.logger.log('✅ AiService initialized (simplified version)');
  }

  async generateChecklist(_params: any) {
    this.logger.warn('AI generateChecklist called - returning mock data');
    await Promise.resolve();
    return {
      id: 'mock-checklist-id',
      titulo: 'Checklist Gerado',
      itens: [
        { item: 'Verificar equipamento', status: 'ok', observacao: '' },
        { item: 'Conferir EPIs', status: 'ok', observacao: '' },
      ],
    };
  }

  async generateDds() {
    this.logger.warn('AI generateDds called - returning mock data');
    await Promise.resolve();
    return {
      tema: 'Segurança no Trabalho',
      conteudo: 'Tema gerado automaticamente sobre segurança.',
      explanation: 'Mock DDS para desenvolvimento',
    };
  }

  async analyzeRisk(_params: any) {
    this.logger.warn('AI analyzeRisk called - returning mock data');
    await Promise.resolve();
    return {
      nivel: 'médio',
      recomendacoes: ['Usar EPIs adequados', 'Seguir procedimentos'],
    };
  }

  async getInsights() {
    this.logger.warn('AI getInsights called - returning mock data');
    await Promise.resolve();
    return {
      safetyScore: 85,
      summary:
        'Sistema operando normalmente. Continue monitorando os indicadores de conformidade.',
      timestamp: new Date().toISOString(),
      insights: [
        {
          type: 'info',
          title: 'Monitoramento',
          message: 'Mantenha as inspeções periódicas em dia para garantir a conformidade.',
          action: '/dashboard/inspections',
        },
        {
          type: 'warning',
          title: 'EPIs',
          message: 'Verifique a validade dos Certificados de Aprovação (CA) dos EPIs cadastrados.',
          action: '/dashboard/epis',
        },
        {
          type: 'success',
          title: 'Treinamentos',
          message: 'Certifique-se de que os treinamentos obrigatórios estejam atualizados.',
          action: '/dashboard/trainings',
        },
      ],
    };
  }

  async analyzeApr(_description: string) {
    this.logger.warn('AI analyzeApr called - returning mock data');
    await Promise.resolve();
    return {
      riscos: ['Queda de nível', 'Ruído'],
      controles: ['Uso de cinto', 'Protetor auricular'],
    };
  }

  async analyzePt(_data: any) {
    this.logger.warn('AI analyzePt called - returning mock data');
    await Promise.resolve();
    return {
      conforme: true,
      recomendacoes: ['Verificar validade dos EPIs'],
    };
  }

  async analyzeChecklist(_id: string) {
    this.logger.warn('AI analyzeChecklist called - returning mock data');
    await Promise.resolve();
    return {
      conformidade: 85,
      pontos_atencao: ['Item 3 não conforme recorrente'],
    };
  }

  async generateJson<T>(
    prompt: string,
    _schemaOrMaxTokens: string | number,
  ): Promise<T> {
    this.logger.warn('AI generateJson called - returning mock data');
    await Promise.resolve();
    try {
      // Mock para quando o prompt parecer ser de classificação de documento
      if (
        prompt.toLowerCase().includes('classifique') ||
        prompt.toLowerCase().includes('documento')
      ) {
        return {
          tipo: 'outro',
          confianca: 0.9,
          entidades: {},
        } as unknown as T;
      }

      // Mock genérico
      return {} as T;
    } catch (error) {
      this.logger.error('Erro ao gerar JSON mock:', error);
      throw error;
    }
  }
}

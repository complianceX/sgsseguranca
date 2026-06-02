import { Injectable } from '@nestjs/common';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ControlHierarchy =
  | 'ELIMINATION'
  | 'SUBSTITUTION'
  | 'ENGINEERING'
  | 'ADMINISTRATIVE'
  | 'PPE';

export interface SuggestedControl {
  hierarchy: ControlHierarchy;
  title: string;
  description: string;
}

@Injectable()
export class RiskCalculationService {
  calculateScore(
    probability?: number | null,
    severity?: number | null,
    exposure?: number | null,
  ): number | null {
    if (!probability || !severity || !exposure) {
      return null;
    }

    const sanitizedProbability = Math.max(0, Number(probability));
    const sanitizedSeverity = Math.max(0, Number(severity));
    const sanitizedExposure = Math.max(0, Number(exposure));
    return sanitizedProbability * sanitizedSeverity * sanitizedExposure;
  }

  classifyByScore(score?: number | null): RiskLevel | null {
    if (score === null || score === undefined) {
      return null;
    }
    if (score >= 61) return 'CRITICAL';
    if (score >= 31) return 'HIGH';
    if (score >= 11) return 'MEDIUM';
    return 'LOW';
  }

  suggestControls(input: {
    riskLevel?: RiskLevel | null;
    activity?: string | null;
    condition?: string | null;
  }): SuggestedControl[] {
    const riskLevel = input.riskLevel || 'LOW';
    const activity = (input.activity || '').toLowerCase();
    const condition = (input.condition || '').toLowerCase();

    const controls: SuggestedControl[] = [
      {
        hierarchy: 'ELIMINATION',
        title: 'Eliminar a exposição',
        description:
          'Avaliar se a tarefa pode ser reprogramada, isolada ou executada sem exposição ao perigo.',
      },
      {
        hierarchy: 'SUBSTITUTION',
        title: 'Substituir processo ou insumo',
        description:
          'Substituir ferramenta, produto ou método por alternativa de menor risco.',
      },
      {
        hierarchy: 'ENGINEERING',
        title: 'Aplicar barreiras e dispositivos',
        description:
          'Usar EPC, enclausuramento, travamento, sensores e segregação física da área.',
      },
      {
        hierarchy: 'ADMINISTRATIVE',
        title: 'Formalizar controles operacionais',
        description:
          'Garantir PT, APR, isolamento, supervisão e treinamento válido para a equipe.',
      },
      {
        hierarchy: 'PPE',
        title: 'Confirmar EPI compatível',
        description:
          'Selecionar e inspecionar EPI adequado antes do início da tarefa.',
      },
    ];

    if (activity.includes('altura')) {
      controls[2].description =
        'Instalar linha de vida, guarda-corpo e pontos de ancoragem certificados.';
      controls[4].description =
        'Validar cinto paraquedista, talabarte duplo e capacete com jugular.';
    }

    if (activity.includes('elétr') || condition.includes('energia')) {
      controls[1].description =
        'Avaliar execução com energia desenergizada ou uso de tecnologia de menor tensão.';
      controls[2].description =
        'Aplicar bloqueio, etiquetagem, barreiras dielétricas e aterramento temporário.';
    }

    if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
      return controls;
    }

    return controls.slice(2);
  }
}

import { Injectable } from '@nestjs/common';
import { ConfidenceLevel, SstAgentResponse } from '../ai/sst-agent/sst-agent.types';
import { SophieEngineService } from './sophie.engine.service';

@Injectable()
export class SophieLocalChatService {
  constructor(private readonly engine: SophieEngineService) {}

  chat(question: string): SstAgentResponse {
    // Heurística simples: tenta extrair "atividade" de uma pergunta livre.
    // Se não conseguir, responde com roteiro de coleta (para manter legibilidade em campo).
    const q = (question || '').trim();
    const lower = q.toLowerCase();

    const activityGuess = this.extractAfter(lower, ['atividade:', 'atividade =', 'atividade ']) || '';
    const setorGuess = this.extractAfter(lower, ['setor:', 'setor =', 'setor ']) || '';
    const maquinaGuess = this.extractAfter(lower, ['maquina:', 'máquina:', 'maquina =', 'máquina =']) || '';
    const processoGuess = this.extractAfter(lower, ['processo:', 'processo =']) || '';
    const materialGuess = this.extractAfter(lower, ['material:', 'material =']) || '';
    const ambienteGuess = this.extractAfter(lower, ['ambiente:', 'ambiente =']) || '';

    const hasAny =
      Boolean(activityGuess) ||
      Boolean(setorGuess) ||
      Boolean(maquinaGuess) ||
      Boolean(processoGuess) ||
      Boolean(materialGuess) ||
      Boolean(ambienteGuess);

    if (!hasAny) {
      return {
        answer:
          'Para eu analisar com precisão, me informe pelo menos: atividade, setor e máquina/processo. Exemplo:\n' +
          'atividade: soldagem\nsetor: manutenção\nmáquina: máquina de solda\nambiente: interno/externo\n' +
          'Se quiser, também informe probabilidade (1-5) e severidade (1-5) para eu calcular a matriz.',
        confidence: ConfidenceLevel.MEDIUM,
        needsHumanReview: false,
        sources: [],
        suggestedActions: [
          { label: 'Criar APR', href: '/dashboard/aprs/new', priority: 'high' },
          { label: 'Criar PGR', href: '/dashboard/reports', priority: 'medium' },
        ],
        warnings: [],
        toolsUsed: ['sophie_kb_rules'],
      };
    }

    const analysis = this.engine.analyze({
      atividade: activityGuess || undefined,
      setor: setorGuess || undefined,
      maquina: maquinaGuess || undefined,
      processo: processoGuess || undefined,
      material: materialGuess || undefined,
      ambiente: ambienteGuess || undefined,
    });

    const sources = analysis.normas;
    const perigos = analysis.perigos;
    const controles = analysis.controles;

    const answerLines: string[] = [];
    if (activityGuess) answerLines.push(`Atividade analisada: ${activityGuess}`);
    if (setorGuess) answerLines.push(`Setor: ${setorGuess}`);
    if (maquinaGuess) answerLines.push(`Máquina/Equip.: ${maquinaGuess}`);
    if (ambienteGuess) answerLines.push(`Ambiente: ${ambienteGuess}`);
    answerLines.push('');
    answerLines.push('Perigos identificados:');
    answerLines.push(...(perigos.length ? perigos.map((p) => `- ${p}`) : ['- (nenhum mapeamento encontrado na base)']));
    answerLines.push('');
    answerLines.push('Medidas de controle (prioridade por hierarquia):');
    if (controles.eliminacao.length) {
      answerLines.push('1) Eliminação');
      answerLines.push(...controles.eliminacao.map((c) => `- ${c}`));
    }
    if (controles.substituicao.length) {
      answerLines.push('2) Substituição');
      answerLines.push(...controles.substituicao.map((c) => `- ${c}`));
    }
    if (controles.engenharia.length) {
      answerLines.push('3) Engenharia/EPC');
      answerLines.push(...controles.engenharia.map((c) => `- ${c}`));
    }
    if (controles.administrativas.length) {
      answerLines.push('4) Administrativas');
      answerLines.push(...controles.administrativas.map((c) => `- ${c}`));
    }
    if (controles.epi.length) {
      answerLines.push('5) EPI (última barreira)');
      answerLines.push(...controles.epi.map((c) => `- ${c}`));
    }

    const confidence =
      analysis.matchedRuleIds.length > 0 ? ConfidenceLevel.HIGH : ConfidenceLevel.LOW;

    return {
      answer: answerLines.join('\n'),
      confidence,
      needsHumanReview: false,
      sources,
      suggestedActions: [
        { label: 'Criar APR', href: '/dashboard/aprs/new', priority: 'high' },
        { label: 'Abrir NRs', href: '/dashboard/reports', priority: 'low' },
      ],
      warnings:
        confidence === ConfidenceLevel.LOW
          ? ['Base SOPHIE não encontrou regras para esta descrição. Revise manualmente e complemente a base.']
          : [],
      toolsUsed: ['sophie_kb_rules'],
    };
  }

  private extractAfter(text: string, markers: string[]) {
    for (const m of markers) {
      const idx = text.indexOf(m);
      if (idx === -1) continue;
      const after = text.slice(idx + m.length).trim();
      if (!after) continue;
      // pega primeira linha/sentença curta
      const line = after.split('\n')[0];
      return line.split('. ')[0].trim();
    }
    return '';
  }
}


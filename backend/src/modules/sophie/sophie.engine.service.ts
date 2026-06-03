import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  SophieAnalyzeInput,
  SophieAnalyzeResult,
  SophieKnowledgeBase,
  SophieRule,
} from './sophie.types';

type SynonymsMap = Record<string, string>;

@Injectable()
export class SophieEngineService {
  private readonly logger = new Logger(SophieEngineService.name);
  private kb: SophieKnowledgeBase = { rules: [] };
  private synonyms: SynonymsMap = {};
  private kbVersion: {
    name: string;
    version: string;
    updated_at: string;
  } | null = null;

  constructor() {
    this.loadKbFromDisk();
  }

  getVersion() {
    return (
      this.kbVersion ?? {
        name: 'sophie-kb',
        version: 'unknown',
        updated_at: 'unknown',
      }
    );
  }

  analyze(input: SophieAnalyzeInput): SophieAnalyzeResult {
    const normalized = this.normalizeInput(input);

    const matched: SophieRule[] = [];
    for (const rule of this.kb.rules) {
      if (this.ruleMatches(rule, normalized)) {
        matched.push(rule);
      }
    }

    const matchedRuleIds = matched.map((r) => r.id);
    const perigos = this.unique(
      matched.flatMap((r) => r.outputs.perigos || []),
    );
    const agentes = this.unique(
      matched.flatMap((r) => r.outputs.agentes || []),
    );
    const normas = this.unique(matched.flatMap((r) => r.outputs.normas || []));

    const controles: SophieAnalyzeResult['controles'] = {
      eliminacao: [],
      substituicao: [],
      engenharia: [],
      administrativas: [],
      epi: [],
    };
    for (const rule of matched) {
      const c = rule.outputs.controles;
      if (!c) continue;
      controles.eliminacao.push(...(c.eliminacao || []));
      controles.substituicao.push(...(c.substituicao || []));
      controles.engenharia.push(...(c.engenharia || []));
      controles.administrativas.push(...(c.administrativas || []));
      controles.epi.push(...(c.epi || []));
    }

    const result: SophieAnalyzeResult = {
      matchedRuleIds,
      perigos,
      agentes,
      normas,
      controles: {
        eliminacao: this.unique(controles.eliminacao),
        substituicao: this.unique(controles.substituicao),
        engenharia: this.unique(controles.engenharia),
        administrativas: this.unique(controles.administrativas),
        epi: this.unique(controles.epi),
      },
    };

    if (
      typeof input.probabilidade === 'number' &&
      typeof input.severidade === 'number'
    ) {
      const nivel = input.probabilidade * input.severidade;
      result.probabilidade = input.probabilidade;
      result.severidade = input.severidade;
      result.nivel_de_risco = nivel;
      result.classificacao = this.classifyRiskLevel(nivel);
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private loadKbFromDisk() {
    const baseDir = path.join(__dirname, 'kb');
    try {
      const rulesPath = path.join(baseDir, 'rules.json');
      const synonymsPath = path.join(baseDir, 'synonyms.json');
      const versionPath = path.join(baseDir, 'version.json');

      const rulesRaw = fs.readFileSync(rulesPath, 'utf8');
      const synonymsRaw = fs.readFileSync(synonymsPath, 'utf8');
      const versionRaw = fs.readFileSync(versionPath, 'utf8');

      const rulesJson = JSON.parse(rulesRaw) as SophieKnowledgeBase;
      const synonymsJson = JSON.parse(synonymsRaw) as SynonymsMap;
      const versionJson = JSON.parse(versionRaw) as {
        name: string;
        version: string;
        updated_at: string;
      };

      this.kb = {
        rules: Array.isArray(rulesJson.rules) ? rulesJson.rules : [],
      };
      this.synonyms = synonymsJson ?? {};
      this.kbVersion = versionJson ?? null;

      this.logger.log(
        `SOPHIE KB carregada: rules=${this.kb.rules.length} version=${this.kbVersion?.version ?? 'unknown'}`,
      );
    } catch (err) {
      this.kb = { rules: [] };
      this.synonyms = {};
      this.kbVersion = null;
      this.logger.error(
        `Falha ao carregar SOPHIE KB do disco: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private normalizeInput(input: SophieAnalyzeInput) {
    const norm = (value?: string) => this.normalizeText(value);
    return {
      atividade: this.applySynonyms(norm(input.atividade)),
      setor: this.applySynonyms(norm(input.setor)),
      maquina: this.applySynonyms(norm(input.maquina)),
      processo: this.applySynonyms(norm(input.processo)),
      material: this.applySynonyms(norm(input.material)),
      ambiente: this.applySynonyms(norm(input.ambiente)),
    };
  }

  private ruleMatches(
    rule: SophieRule,
    input: ReturnType<SophieEngineService['normalizeInput']>,
  ) {
    const matchesContains = (
      haystack: string | undefined,
      needles?: string[],
    ) => {
      if (!needles || needles.length === 0) return true;
      if (!haystack) return false;
      return needles.some((needle) => {
        const n = this.applySynonyms(this.normalizeText(needle));
        return n ? haystack.includes(n) : false;
      });
    };

    return (
      matchesContains(input.atividade, rule.when.atividade_contains) &&
      matchesContains(input.setor, rule.when.setor_contains) &&
      matchesContains(input.maquina, rule.when.maquina_contains) &&
      matchesContains(input.processo, rule.when.processo_contains) &&
      matchesContains(input.material, rule.when.material_contains) &&
      matchesContains(input.ambiente, rule.when.ambiente_contains)
    );
  }

  private normalizeText(value?: string) {
    if (!value) return '';
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/\s+/g, ' ')
      .trim();
  }

  private applySynonyms(value: string) {
    if (!value) return value;
    // substituicao simples por termo inteiro
    const direct = this.synonyms[value];
    if (direct) return direct;

    // substituicao por tokens (mantem frase)
    const tokens = value.split(' ');
    const mapped = tokens.map((t) => this.synonyms[t] || t);
    return mapped.join(' ');
  }

  private unique<T>(items: T[]) {
    return Array.from(new Set(items));
  }

  private classifyRiskLevel(score: number) {
    if (score <= 4) return 'baixo' as const;
    if (score <= 9) return 'moderado' as const;
    if (score <= 16) return 'alto' as const;
    return 'critico' as const;
  }
}

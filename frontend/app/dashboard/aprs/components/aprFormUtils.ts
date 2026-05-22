/**
 * Funções utilitárias para AprForm
 * Extraídas para melhorar organização e testabilidade
 */

import type { Apr } from "@/services/aprsService";
import type { AprFormData } from "./aprForm.schema";

export type AprFormRiskRow = NonNullable<AprFormData["itens_risco"]>[number];
export type AprDocumentRiskLevel =
  | "insignificante"
  | "baixo"
  | "medio"
  | "alto"
  | "critico";

export type AprDocumentRiskSummary = {
  counts: Record<AprDocumentRiskLevel, number>;
  total: number;
  highestLabel: string;
  criticalCount: number;
};

/**
 * Cria uma linha de risco vazia para o formulário
 */
export function createEmptyRiskRow(): AprFormRiskRow {
  return {
    atividade_processo: "",
    etapa: "",
    agente_ambiental: "",
    condicao_perigosa: "",
    fontes_circunstancias: "",
    possiveis_lesoes: "",
    probabilidade: "",
    severidade: "",
    categoria_risco: "",
    medidas_prevencao: "",
    epc: "",
    epi: "",
    permissao_trabalho: "",
    normas_relacionadas: "",
    responsavel: "",
    prazo: "",
    status_acao: "",
  };
}

/**
 * Verifica se valor tem conteúdo
 */
export function hasText(value: unknown): boolean {
  return String(value ?? "").trim().length > 0;
}

/**
 * Normaliza token de documento (lowercase, sem acentos)
 */
export function normalizeDocumentToken(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Extrai número da escala de risco
 */
export function parseRiskScaleNumber(value: unknown): number {
  const match = String(value ?? "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

/**
 * Inferir nível de risco do documento
 */
export function inferAprDocumentRiskLevel(
  item?: AprFormRiskRow,
): AprDocumentRiskLevel {
  const category = normalizeDocumentToken(item?.categoria_risco);

  if (category.includes("critic")) return "critico";
  if (category.includes("substancial") || category.includes("alto")) {
    return "alto";
  }
  if (
    category.includes("atencao") ||
    category.includes("medio") ||
    category.includes("moderad")
  ) {
    return "medio";
  }
  if (category.includes("aceitavel") || category.includes("baixo")) {
    return "baixo";
  }
  if (category.includes("insignificante")) return "insignificante";

  const probability = parseRiskScaleNumber(item?.probabilidade);
  const severity = parseRiskScaleNumber(item?.severidade);
  const score = probability * severity;

  if (!score) return "insignificante";
  if (score >= 9) return "critico";
  if (score >= 6) return "alto";
  if (score >= 3) return "medio";
  return "baixo";
}

/**
 * Divide string em tokens
 */
export function splitDocumentTokens(value: unknown): string[] {
  return String(value ?? "")
    .split(/[,\n;|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Remove tokens duplicados
 */
export function uniqueDocumentTokens(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeDocumentToken(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Formata data para padrão brasileiro
 */
export function formatDocumentDate(value?: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "Não definida";

  const datePart = raw.includes("T") ? raw.slice(0, 10) : raw;
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("pt-BR");
}

/**
 * Formata período (data início até data fim)
 */
export function formatDocumentPeriod(start?: unknown, end?: unknown): string {
  const startLabel = formatDocumentDate(start);
  const endLabel = formatDocumentDate(end);

  if (startLabel === "Não definida" && endLabel === "Não definida") {
    return "Não definido";
  }

  if (startLabel === endLabel || endLabel === "Não definida") {
    return startLabel;
  }

  return `${startLabel} até ${endLabel}`;
}

/**
 * Normaliza linha de risco com valores padrão
 */
export function normalizeRiskRow(
  row?: Partial<AprFormRiskRow>,
): AprFormRiskRow {
  return {
    ...createEmptyRiskRow(),
    ...row,
  } as AprFormRiskRow;
}

/**
 * Mapeia item de risco persistido para linha do formulário
 */
export function mapPersistedRiskItemToFormRow(
  item: NonNullable<Apr["risk_items"]>[number],
): AprFormRiskRow {
  return normalizeRiskRow({
    atividade_processo: item.atividade || "",
    etapa: item.etapa || "",
    agente_ambiental: item.agente_ambiental || "",
    condicao_perigosa: item.condicao_perigosa || "",
    fontes_circunstancias: item.fonte_circunstancia || "",
    possiveis_lesoes: item.lesao || "",
    probabilidade:
      item.probabilidade !== undefined && item.probabilidade !== null
        ? String(item.probabilidade)
        : "",
    severidade:
      item.severidade !== undefined && item.severidade !== null
        ? String(item.severidade)
        : "",
    categoria_risco: item.categoria_risco || "",
    medidas_prevencao: item.medidas_prevencao || "",
    epc: item.epc || "",
    epi: item.epi || "",
    permissao_trabalho: item.permissao_trabalho || "",
    normas_relacionadas: item.normas_relacionadas || "",
    responsavel: item.responsavel || "",
    prazo: item.prazo || "",
    status_acao: item.status_acao || "",
  });
}

/**
 * Cria chave única para linha de risco
 */
export function buildRiskRowKey(
  row?: Partial<AprFormRiskRow>,
): string {
  const normalized = normalizeRiskRow(row);
  const parts = [
    String(normalized.atividade_processo ?? "").slice(0, 10),
    String(normalized.condicao_perigosa ?? "").slice(0, 10),
    String(normalized.categoria_risco ?? "").slice(0, 10),
  ];
  return parts.filter(Boolean).join("-").slice(0, 50) || "novo-risco";
}

export function dedupeById<T extends { id: string }>(items: T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

export function isUuidLike(value?: string | null): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  );
}

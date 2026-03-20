import type { Company } from "@/services/companiesService";
import type { Site } from "@/services/sitesService";
import type { User } from "@/services/usersService";
import type {
  AprExcelImportPreview,
  AprRiskItemInput,
} from "@/services/aprsService";
import { calculateAprRiskEvaluation } from "./apr-risk-matrix";

export type AprEditableRiskRow = {
  atividade_processo: string;
  agente_ambiental: string;
  condicao_perigosa: string;
  fontes_circunstancias: string;
  possiveis_lesoes: string;
  probabilidade: string;
  severidade: string;
  categoria_risco: string;
  medidas_prevencao: string;
  responsavel: string;
  prazo: string;
  status_acao: string;
};

type AprImportLookups = {
  companies: Company[];
  sites: Site[];
  users: User[];
  selectedCompanyId?: string;
};

export type ApplyAprImportPreviewResult = {
  fieldValues: Partial<{
    numero: string;
    titulo: string;
    descricao: string;
    data_inicio: string;
    data_fim: string;
    company_id: string;
    site_id: string;
    elaborador_id: string;
  }>;
  riskItems: AprEditableRiskRow[];
  unresolved: Array<"company" | "site" | "elaborador">;
};

export function normalizeAprImportLookupLabel(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function normalizeAprImportedRiskItem(item: AprRiskItemInput): AprEditableRiskRow {
  const evaluation = calculateAprRiskEvaluation(
    item.probabilidade,
    item.severidade,
  );

  return {
    atividade_processo: item.atividade_processo || "",
    agente_ambiental: item.agente_ambiental || "",
    condicao_perigosa: item.condicao_perigosa || "",
    fontes_circunstancias:
      item.fonte_circunstancia || item.fontes_circunstancias || "",
    possiveis_lesoes: item.possiveis_lesoes || "",
    probabilidade:
      item.probabilidade !== undefined ? String(item.probabilidade) : "",
    severidade: item.severidade !== undefined ? String(item.severidade) : "",
    categoria_risco: evaluation.categoria || item.categoria_risco || "",
    medidas_prevencao: item.medidas_prevencao || "",
    responsavel: item.responsavel || "",
    prazo: item.prazo || "",
    status_acao: item.status_acao || "",
  };
}

function matchCompany(
  preview: AprExcelImportPreview,
  companies: Company[],
): Company | undefined {
  const importedCnpj = normalizeAprImportLookupLabel(preview.draft.cnpj);
  if (importedCnpj) {
    const byCnpj = companies.find(
      (company) =>
        normalizeAprImportLookupLabel(company.cnpj).replace(/\D/g, "") ===
        importedCnpj.replace(/\D/g, ""),
    );
    if (byCnpj) {
      return byCnpj;
    }
  }

  const importedCompanyName = normalizeAprImportLookupLabel(
    preview.draft.company_name,
  );
  if (!importedCompanyName) {
    return undefined;
  }

  return companies.find(
    (company) =>
      normalizeAprImportLookupLabel(company.razao_social) === importedCompanyName,
  );
}

export function applyAprImportPreview(
  preview: AprExcelImportPreview,
  lookups: AprImportLookups,
): ApplyAprImportPreviewResult {
  const fieldValues: ApplyAprImportPreviewResult["fieldValues"] = {};
  const unresolved: ApplyAprImportPreviewResult["unresolved"] = [];

  if (preview.draft.numero) fieldValues.numero = preview.draft.numero;
  if (preview.draft.titulo) fieldValues.titulo = preview.draft.titulo;
  if (preview.draft.descricao) fieldValues.descricao = preview.draft.descricao;
  if (preview.draft.data_inicio) fieldValues.data_inicio = preview.draft.data_inicio;
  if (preview.draft.data_fim) fieldValues.data_fim = preview.draft.data_fim;

  const matchedCompany = matchCompany(preview, lookups.companies);
  const resolvedCompanyId = matchedCompany?.id || lookups.selectedCompanyId || "";
  const hasImportedCompanySignal = Boolean(
    preview.draft.company_name || preview.draft.cnpj,
  );

  if (matchedCompany) {
    fieldValues.company_id = matchedCompany.id;
  } else if (preview.draft.company_name || preview.draft.cnpj) {
    unresolved.push("company");
  }

  const candidateSites = resolvedCompanyId && (!hasImportedCompanySignal || matchedCompany)
    ? lookups.sites.filter((site) => site.company_id === resolvedCompanyId)
    : lookups.sites;
  const importedSiteName = normalizeAprImportLookupLabel(preview.draft.site_name);
  if (importedSiteName) {
    const matchedSite = candidateSites.find(
      (site) => normalizeAprImportLookupLabel(site.nome) === importedSiteName,
    );
    if (matchedSite) {
      fieldValues.site_id = matchedSite.id;
      if (!fieldValues.company_id) {
        fieldValues.company_id = matchedSite.company_id;
      }
    } else {
      unresolved.push("site");
    }
  }

  const candidateUsers = fieldValues.company_id
    ? lookups.users.filter((user) => user.company_id === fieldValues.company_id)
    : lookups.users;
  const importedElaboradorName = normalizeAprImportLookupLabel(
    preview.draft.elaborador_name,
  );
  if (importedElaboradorName) {
    const matchedElaborador = candidateUsers.find(
      (user) => normalizeAprImportLookupLabel(user.nome) === importedElaboradorName,
    );
    if (matchedElaborador) {
      fieldValues.elaborador_id = matchedElaborador.id;
    } else {
      unresolved.push("elaborador");
    }
  }

  return {
    fieldValues,
    riskItems:
      preview.draft.risk_items.length > 0
        ? preview.draft.risk_items.map(normalizeAprImportedRiskItem)
        : [],
    unresolved: Array.from(new Set(unresolved)),
  };
}

import type {
  DossierContext,
  EmployeeDossierContext,
  SiteDossierContext,
} from "@/services/dossiersService";
import type { AutoTableFn, PdfContext } from "../core/types";
import { formatDate, formatDateTime, sanitize } from "../core/format";
import {
  drawDocumentIdentityRail,
  drawExecutiveSummaryStrip,
  drawGovernanceClosingBlock,
  drawMetadataGrid,
  drawNarrativeSection,
  drawSemanticTable,
} from "../components";

function isEmployeeContext(
  context: DossierContext,
): context is EmployeeDossierContext {
  return context.kind === "employee";
}

function buildExecutiveSummary(context: DossierContext) {
  if (isEmployeeContext(context)) {
    return {
      title: "Leitura executiva do dossiê do colaborador",
      summary:
        "Consolidação institucional de capacitações, entregas de EPI, liberações críticas, CATs e rastreabilidade documental do trabalhador.",
      metrics: [
        {
          label: "Colaborador",
          value: sanitize(context.subject.nome),
          tone: "default" as const,
        },
        {
          label: "Treinamentos",
          value: context.summary.trainings,
          tone: "info" as const,
        },
        {
          label: "EPIs",
          value: context.summary.assignments,
          tone: "success" as const,
        },
        { label: "PTs", value: context.summary.pts, tone: "warning" as const },
        { label: "CATs", value: context.summary.cats, tone: "danger" as const },
        {
          label: "Anexos",
          value: context.summary.attachments,
          tone: "info" as const,
        },
      ],
    };
  }

  return {
    title: "Leitura executiva do dossiê da obra/setor",
    summary:
      "Consolidação institucional de efetivo, treinamentos, EPIs, permissões e CATs vinculados ao escopo operacional da unidade.",
    metrics: [
      {
        label: "Obra/Setor",
        value: sanitize(context.subject.nome),
        tone: "default" as const,
      },
      {
        label: "Colaboradores",
        value: context.workers.length,
        tone: "info" as const,
      },
      {
        label: "Treinamentos",
        value: context.summary.trainings,
        tone: "info" as const,
      },
      {
        label: "EPIs",
        value: context.summary.assignments,
        tone: "success" as const,
      },
      { label: "PTs", value: context.summary.pts, tone: "warning" as const },
      { label: "CATs", value: context.summary.cats, tone: "danger" as const },
    ],
  };
}

function drawEmployeeSections(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  context: EmployeeDossierContext,
) {
  drawMetadataGrid(ctx, {
    title: "Identificação do colaborador",
    columns: 2,
    fields: [
      { label: "Nome", value: context.subject.nome },
      { label: "CPF", value: context.subject.cpf || "-" },
      { label: "Função", value: context.subject.funcao || "-" },
      { label: "Perfil", value: context.subject.profileName || "-" },
      { label: "Obra/Setor", value: context.subject.siteName || "-" },
      { label: "Empresa", value: context.companyName || context.companyId },
      { label: "Status", value: context.subject.status ? "Ativo" : "Inativo" },
      { label: "Emitido em", value: formatDateTime(context.generatedAt) },
    ],
  });

  drawSemanticTable(ctx, {
    title: "Treinamentos e validade",
    tone: "attendance",
    autoTable,
    head: [["Treinamento", "NR/Código", "Conclusão", "Vencimento", "Status"]],
    body:
      context.trainings.length > 0
        ? context.trainings.map((item) => [
            item.nome,
            item.nrCodigo || "-",
            formatDate(item.dataConclusao),
            formatDate(item.dataVencimento),
            item.status,
          ])
        : [["-", "-", "-", "-", "Nenhum treinamento encontrado"]],
    semanticRules: { profile: "audit", columns: [4] },
  });

  drawSemanticTable(ctx, {
    title: "Controle de EPIs",
    tone: "action",
    autoTable,
    head: [["EPI", "CA", "Validade CA", "Status", "Entrega", "Devolução"]],
    body:
      context.assignments.length > 0
        ? context.assignments.map((item) => [
            item.epiNome,
            item.ca || "-",
            formatDate(item.validadeCa),
            item.status,
            formatDate(item.entregueEm),
            formatDate(item.devolvidoEm),
          ])
        : [["-", "-", "-", "-", "-", "Nenhuma ficha de EPI encontrada"]],
    semanticRules: { profile: "checklist", columns: [3] },
  });

  drawSemanticTable(ctx, {
    title: "Permissões de trabalho relacionadas",
    tone: "default",
    autoTable,
    head: [["Número", "Título", "Status", "Responsável", "Período"]],
    body:
      context.pts.length > 0
        ? context.pts.map((item) => [
            item.numero,
            item.titulo,
            item.status,
            item.responsavel || "-",
            `${formatDateTime(item.dataInicio)} até ${formatDateTime(item.dataFim)}`,
          ])
        : [["-", "-", "-", "-", "Nenhuma PT relacionada"]],
    semanticRules: { profile: "pt", columns: [2] },
  });

  drawSemanticTable(ctx, {
    title: "CATs relacionadas",
    tone: "risk",
    autoTable,
    head: [["Número", "Status", "Gravidade", "Data", "Descrição"]],
    body:
      context.cats.length > 0
        ? context.cats.map((item) => [
            item.numero,
            item.status,
            item.gravidade,
            formatDateTime(item.dataOcorrencia),
            item.descricao || "-",
          ])
        : [["-", "-", "-", "-", "Nenhuma CAT relacionada"]],
    semanticRules: { profile: "audit", columns: [1, 2] },
    overrides: {
      styles: { fontSize: 8, cellPadding: 2.1 },
      columnStyles: {
        4: { cellWidth: 58 },
      },
    },
  });
}

function drawSiteSections(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  context: SiteDossierContext,
) {
  drawMetadataGrid(ctx, {
    title: "Identificação da obra/setor",
    columns: 2,
    fields: [
      { label: "Nome", value: context.subject.nome },
      { label: "Empresa", value: context.companyName || context.companyId },
      { label: "Endereço", value: context.subject.endereco || "-" },
      {
        label: "Cidade/UF",
        value:
          [context.subject.cidade, context.subject.estado]
            .filter(Boolean)
            .join(" - ") || "-",
      },
      { label: "Status", value: context.subject.status ? "Ativo" : "Inativo" },
      { label: "Emitido em", value: formatDateTime(context.generatedAt) },
    ],
  });

  drawSemanticTable(ctx, {
    title: "Equipe vinculada",
    tone: "attendance",
    autoTable,
    head: [["Colaborador", "Função", "Perfil", "Status"]],
    body:
      context.workers.length > 0
        ? context.workers.map((item) => [
            item.nome,
            item.funcao || "-",
            item.profileName || "-",
            item.status ? "Ativo" : "Inativo",
          ])
        : [["-", "-", "-", "Nenhum colaborador vinculado"]],
    semanticRules: { profile: "audit", columns: [3] },
  });

  drawSemanticTable(ctx, {
    title: "Treinamentos do escopo",
    tone: "attendance",
    autoTable,
    head: [["Treinamento", "Colaborador", "Conclusão", "Vencimento", "Status"]],
    body:
      context.trainings.length > 0
        ? context.trainings.map((item) => [
            item.nome,
            item.workerName || "-",
            formatDate(item.dataConclusao),
            formatDate(item.dataVencimento),
            item.status,
          ])
        : [["-", "-", "-", "-", "Nenhum treinamento encontrado"]],
    semanticRules: { profile: "audit", columns: [4] },
  });

  drawSemanticTable(ctx, {
    title: "Entregas de EPI do escopo",
    tone: "action",
    autoTable,
    head: [["Colaborador", "EPI", "Status", "Entrega", "Devolução"]],
    body:
      context.assignments.length > 0
        ? context.assignments.map((item) => [
            item.workerName || "-",
            item.epiNome,
            item.status,
            formatDate(item.entregueEm),
            formatDate(item.devolvidoEm),
          ])
        : [["-", "-", "-", "-", "Nenhuma ficha de EPI encontrada"]],
    semanticRules: { profile: "checklist", columns: [2] },
  });

  drawSemanticTable(ctx, {
    title: "PTs e CATs vinculadas",
    tone: "default",
    autoTable,
    head: [["Tipo", "Número", "Status", "Responsável/Colaborador", "Data"]],
    body:
      context.pts.length > 0 || context.cats.length > 0
        ? [
            ...context.pts.map((item) => [
              "PT",
              item.numero,
              item.status,
              item.responsavel || "-",
              formatDateTime(item.dataInicio),
            ]),
            ...context.cats.map((item) => [
              "CAT",
              item.numero,
              item.status,
              item.workerName || "-",
              formatDateTime(item.dataOcorrencia),
            ]),
          ]
        : [["-", "-", "-", "-", "Nenhum documento relacionado"]],
    semanticRules: { profile: "audit", columns: [2] },
  });
}

export async function drawDossierBlueprint(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  context: DossierContext,
  code: string,
  validationUrl: string,
) {
  drawDocumentIdentityRail(ctx, {
    documentType:
      context.kind === "employee"
        ? "Dossiê do colaborador"
        : "Dossiê da obra/setor",
    criticality: "controlled",
    validity: formatDateTime(context.generatedAt),
    documentClass: "executive",
  });

  drawExecutiveSummaryStrip(ctx, buildExecutiveSummary(context));

  if (isEmployeeContext(context)) {
    drawEmployeeSections(ctx, autoTable, context);
  } else {
    drawSiteSections(ctx, autoTable, context);
  }

  drawSemanticTable(ctx, {
    title: "Índice de anexos e documentos relacionados",
    tone: "default",
    autoTable,
    head: [["Tipo", "Referência", "Arquivo", "URL/Chave"]],
    body:
      context.attachmentLines.length > 0
        ? context.attachmentLines.map((item) => [
            item.tipo,
            item.referencia,
            item.arquivo,
            item.url,
          ])
        : [["-", "-", "-", "Nenhum anexo relacionado"]],
    semanticRules: { profile: "audit", columns: [0] },
    overrides: {
      styles: { fontSize: 7.6, cellPadding: 2 },
      columnStyles: {
        2: { cellWidth: 40 },
        3: { cellWidth: 78 },
      },
    },
  });

  drawNarrativeSection(ctx, {
    title: "Síntese institucional",
    content:
      context.kind === "employee"
        ? `Dossiê consolidado do colaborador ${context.subject.nome}, com visão executiva de capacitações, EPIs, permissões críticas, CATs e evidências anexas.`
        : `Dossiê consolidado da unidade ${context.subject.nome}, com visão executiva de efetivo, treinamentos, EPIs, permissões de trabalho, CATs e evidências vinculadas ao escopo.`,
  });

  await drawGovernanceClosingBlock(ctx, {
    code,
    url: validationUrl,
    signatures: isEmployeeContext(context)
      ? [
          {
            label: "Titular do dossiê",
            name: sanitize(context.subject.nome),
            role: sanitize(context.subject.funcao || "Colaborador"),
            date: context.generatedAt,
            image: null,
          },
        ]
      : [
          {
            label: "Escopo validado",
            name: sanitize(context.subject.nome),
            role: "Obra/Setor",
            date: context.generatedAt,
            image: null,
          },
        ],
    title: "Governança e autenticidade",
    subtitle:
      "Valide o código público do dossiê para confirmar o escopo institucional desta emissão sob demanda.",
  });
}

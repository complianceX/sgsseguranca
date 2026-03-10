import {
  NC_STATUS_LABEL,
  normalizeNcStatus,
  type NonConformity,
} from "@/services/nonConformitiesService";
import { pdfDocToBase64 } from "./pdfBase64";
import {
  applyFooter,
  buildDocumentCode,
  buildPdfFilename,
  buildValidationUrl,
  drawBadge,
  drawHeader,
  drawInfoCard,
  drawModernTable,
  drawSignatureCard,
  drawTextCard,
  drawValidationCard,
  formatDate,
  formatDateTime,
  sanitize,
} from "./pdfLayout";

type PdfOptions = { save?: boolean; output?: "base64" };
type PdfOutputDoc = { output: (type: "datauri" | "dataurl") => string };

export async function generateNonConformityPdf(
  nc: NonConformity,
  options?: PdfOptions,
): Promise<void | { base64: string; filename: string }> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const code = buildDocumentCode("NC", nc.id || nc.codigo_nc);
  let y = drawHeader(doc, {
    title: "RELATÓRIO DE NÃO CONFORMIDADE",
    subtitle: "Registro e tratativa de desvio",
    date: formatDate(nc.data_identificacao),
    code,
    logoText: "CX",
  });

  y = drawBadge(
    doc,
    y,
    "Status da NC",
    NC_STATUS_LABEL[normalizeNcStatus(nc.status)],
    "danger",
  );
  y = drawInfoCard(doc, y, "Informações da não conformidade", [
    { label: "Código", value: sanitize(nc.codigo_nc) },
    { label: "Tipo", value: sanitize(nc.tipo) },
    { label: "Data identificação", value: formatDate(nc.data_identificacao) },
    { label: "Local / Setor", value: sanitize(nc.local_setor_area) },
    { label: "Atividade", value: sanitize(nc.atividade_envolvida) },
    { label: "Responsável da área", value: sanitize(nc.responsavel_area) },
    { label: "Auditor", value: sanitize(nc.auditor_responsavel) },
  ]);

  if (nc.classificacao?.length) {
    y = drawTextCard(doc, y, "Classificação", nc.classificacao.join("; "));
  }

  y = drawTextCard(doc, y, "Descrição da não conformidade", nc.descricao);
  y = drawTextCard(doc, y, "Evidência observada", nc.evidencia_observada);
  y = drawTextCard(doc, y, "Condição insegura", nc.condicao_insegura);
  y = drawTextCard(doc, y, "Ato inseguro", nc.ato_inseguro);
  y = drawTextCard(doc, y, "Risco / perigo", nc.risco_perigo);
  y = drawTextCard(doc, y, "Risco associado", nc.risco_associado);

  if (nc.risco_consequencias?.length || nc.risco_nivel) {
    y = drawInfoCard(doc, y, "Análise de risco", [
      {
        label: "Consequências",
        value: sanitize(nc.risco_consequencias?.join("; ")),
      },
      { label: "Nível de risco", value: sanitize(nc.risco_nivel) },
    ]);
  }

  if (
    nc.requisito_nr ||
    nc.requisito_item ||
    nc.requisito_procedimento ||
    nc.requisito_politica
  ) {
    y = drawInfoCard(doc, y, "Requisito não atendido", [
      { label: "NR", value: sanitize(nc.requisito_nr) },
      { label: "Item", value: sanitize(nc.requisito_item) },
      {
        label: "Procedimento",
        value: sanitize(nc.requisito_procedimento),
      },
      { label: "Política", value: sanitize(nc.requisito_politica) },
    ]);
  }

  if (nc.causa?.length) {
    y = drawTextCard(
      doc,
      y,
      "Causas identificadas",
      `${nc.causa.join("; ")}${nc.causa_outro ? ` (${nc.causa_outro})` : ""}`,
    );
  }

  const actions: string[][] = [];
  if (nc.acao_imediata_descricao) {
    actions.push([
      "Imediata",
      sanitize(nc.acao_imediata_descricao),
      sanitize(nc.acao_imediata_responsavel),
      sanitize(nc.acao_imediata_data),
      sanitize(nc.acao_imediata_status),
    ]);
  }
  if (nc.acao_definitiva_descricao) {
    actions.push([
      "Definitiva",
      sanitize(nc.acao_definitiva_descricao),
      sanitize(nc.acao_definitiva_responsavel),
      sanitize(nc.acao_definitiva_prazo),
      "-",
    ]);
  }

  if (actions.length) {
    y = drawModernTable(
      doc,
      autoTable,
      y,
      "Plano de ação",
      [["Tipo", "Descrição", "Responsável", "Prazo/Data", "Status"]],
      actions,
    );
  }

  if (
    nc.acao_preventiva_medidas ||
    nc.acao_preventiva_treinamento ||
    nc.acao_preventiva_revisao_procedimento ||
    nc.acao_preventiva_melhoria_processo ||
    nc.acao_preventiva_epc_epi
  ) {
    y = drawInfoCard(doc, y, "Ações preventivas", [
      {
        label: "Medidas",
        value: sanitize(nc.acao_preventiva_medidas),
      },
      {
        label: "Treinamento",
        value: sanitize(nc.acao_preventiva_treinamento),
      },
      {
        label: "Revisão de procedimento",
        value: sanitize(nc.acao_preventiva_revisao_procedimento),
      },
      {
        label: "Melhoria de processo",
        value: sanitize(nc.acao_preventiva_melhoria_processo),
      },
      {
        label: "EPC / EPI",
        value: sanitize(nc.acao_preventiva_epc_epi),
      },
    ]);
  }

  y = drawTextCard(doc, y, "Verificação / resultado", nc.verificacao_resultado);
  y = drawTextCard(
    doc,
    y,
    "Evidências de verificação",
    nc.verificacao_evidencias,
  );
  y = drawInfoCard(doc, y, "Validação final", [
    {
      label: "Data da verificação",
      value: sanitize(
        nc.verificacao_data ? formatDate(nc.verificacao_data) : "",
      ),
    },
    {
      label: "Responsável pela validação",
      value: sanitize(nc.verificacao_responsavel),
    },
  ]);
  y = drawTextCard(doc, y, "Observações gerais", nc.observacoes_gerais);

  if (nc.anexos?.length) {
    y = drawModernTable(
      doc,
      autoTable,
      y,
      "Anexos e registros",
      [["Referência"]],
      nc.anexos.map((item) => [
        item?.startsWith("data:image")
          ? "Imagem capturada em campo"
          : sanitize(item),
      ]),
      { styles: { fontSize: 8, cellPadding: 2 } },
    );
  }

  y = drawSignatureCard(doc, y, [
    { label: "Responsável pela Área", role: "Responsável" },
    { label: "Técnico / Auditor", role: "TST / Auditor" },
    { label: "Gestão", role: "Gestão" },
  ]);
  await drawValidationCard(doc, y, code, buildValidationUrl(code));
  applyFooter(doc, {
    code,
    generatedAt: formatDateTime(new Date().toISOString()),
  });

  const filename = buildPdfFilename(
    "NC",
    sanitize(nc.codigo_nc || code),
    nc.data_identificacao,
  );
  if (options?.save === false && options?.output === "base64") {
    return { base64: pdfDocToBase64(doc as PdfOutputDoc), filename };
  }
  doc.save(filename);
}

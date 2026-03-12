import type { Inspection } from "@/services/inspectionsService";
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
  drawTextCard,
  drawValidationCard,
  formatDate,
  formatDateTime,
  sanitize,
} from "./pdfLayout";

type PdfOptions = { save?: boolean; output?: "base64" };
type PdfOutputDoc = { output: (type: "datauri" | "dataurl") => string };

export async function generateInspectionPdf(
  inspection: Inspection,
  options?: PdfOptions,
): Promise<void | { base64: string; filename: string }> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const code = buildDocumentCode(
    "INS",
    inspection.id || inspection.tipo_inspecao,
  );
  let y = drawHeader(doc, {
    title: "RELATÓRIO DE INSPEÇÃO",
    subtitle: "Inspeção de Segurança do Trabalho",
    date: formatDate(inspection.data_inspecao),
    code,
    logoText: "GST",
  });

  y = drawBadge(
    doc,
    y,
    "Tema / tipo",
    sanitize(inspection.tipo_inspecao),
    "secondary",
  );
  y = drawInfoCard(doc, y, "Informações da inspeção", [
    { label: "Tipo", value: sanitize(inspection.tipo_inspecao) },
    { label: "Setor / Área", value: sanitize(inspection.setor_area) },
    { label: "Data", value: formatDate(inspection.data_inspecao) },
    { label: "Horário", value: sanitize(inspection.horario) },
    { label: "Responsável", value: sanitize(inspection.responsavel?.nome) },
    { label: "Site / Obra", value: sanitize(inspection.site?.nome) },
    { label: "Objetivo", value: sanitize(inspection.objetivo) },
  ]);

  if (inspection.descricao_local_atividades) {
    y = drawTextCard(
      doc,
      y,
      "Local e atividades observadas",
      inspection.descricao_local_atividades,
    );
  }

  if (inspection.metodologia?.length) {
    y = drawTextCard(
      doc,
      y,
      "Metodologia",
      inspection.metodologia.map((item) => `• ${item}`).join("\n"),
    );
  }

  if (inspection.perigos_riscos?.length) {
    y = drawModernTable(
      doc,
      autoTable,
      y,
      "Perigos e riscos identificados",
      [["Grupo", "Perigo / Fator", "Expostos", "Risco", "Ações", "Prazo"]],
      inspection.perigos_riscos.map((item) => [
        sanitize(item.grupo_risco),
        sanitize(item.perigo_fator_risco),
        sanitize(item.trabalhadores_expostos),
        sanitize(item.nivel_risco),
        sanitize(item.acoes_necessarias),
        sanitize(item.prazo),
      ]),
      { styles: { fontSize: 7, cellPadding: 2 } },
    );
  }

  if (inspection.plano_acao?.length) {
    y = drawModernTable(
      doc,
      autoTable,
      y,
      "Plano de ação",
      [["Ação", "Responsável", "Prazo", "Status"]],
      inspection.plano_acao.map((item) => [
        sanitize(item.acao),
        sanitize(item.responsavel),
        sanitize(item.prazo),
        sanitize(item.status),
      ]),
    );
  }

  if (inspection.evidencias?.length) {
    y = drawModernTable(
      doc,
      autoTable,
      y,
      "Evidências registradas",
      [["Descrição", "Referência"]],
      inspection.evidencias.map((item) => [
        sanitize(item.descricao),
        item.url?.startsWith("data:image")
          ? "Imagem capturada em campo"
          : sanitize(item.url || "Sem link informado"),
      ]),
      { styles: { fontSize: 8, cellPadding: 2 } },
    );

    // Render imagens das evidências logo após a tabela, para facilitar impressão
    // e manter o relatório completo mesmo offline.
    const toDataUrl = async (url: string, idx: number) => {
      if (url.startsWith("data:")) return url;

      // Tenta baixar via API (mesma origem) para evitar CORS de buckets.
      if (inspection.id) {
        try {
          const apiUrl = `/api/v1/inspections/${inspection.id}/evidences/${idx}/file`;
          const apiResp = await fetch(apiUrl, { credentials: "include" });
          if (apiResp.ok) {
            const blob = await apiResp.blob();
            return await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }
        } catch (err) {
          console.warn("Fallback para URL assinada da evidência:", err);
        }
      }

      const response = await fetch(url);
      const blob = await response.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    };

    const maxWidth = 180;
    const maxHeight = 120;
    for (const [index, item] of inspection.evidencias.entries()) {
      if (!item.url) continue;

      const ensureSpace = (required: number) => {
        if (y + required > 270) {
          doc.addPage();
          y = 20;
        }
      };

      ensureSpace(maxHeight + 25);
      const label = `Evidência ${index + 1}`;
      doc.setFontSize(12);
      doc.setTextColor(30, 30, 30);
      doc.text(label, 20, y);
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      doc.text(sanitize(item.descricao || "Sem descrição"), 20, y + 6);

      try {
        const dataUrl = await toDataUrl(item.url, index);
        const props = doc.getImageProperties(dataUrl as any);
        const ratio = Math.min(
          maxWidth / props.width,
          maxHeight / props.height,
          1,
        );
        const renderWidth = props.width * ratio;
        const renderHeight = props.height * ratio;
        const x = 20;
        const yPos = y + 12;
        doc.addImage(
          dataUrl,
          props.fileType || "PNG",
          x,
          yPos,
          renderWidth,
          renderHeight,
        );
        y = yPos + renderHeight + 12;
      } catch (err) {
        doc.setTextColor(170, 50, 50);
        doc.text("Não foi possível carregar esta imagem.", 20, y + 14);
        y += 24;
      } finally {
        doc.setTextColor(0, 0, 0);
      }
    }
  }

  y = drawTextCard(doc, y, "Conclusão", inspection.conclusao);
  await drawValidationCard(doc, y, code, buildValidationUrl(code));
  applyFooter(doc, {
    code,
    generatedAt: formatDateTime(new Date().toISOString()),
  });

  const filename = buildPdfFilename(
    "INSPECAO",
    `${inspection.tipo_inspecao}_${inspection.setor_area}`,
    inspection.data_inspecao,
  );
  if (options?.save === false && options?.output === "base64") {
    return { base64: pdfDocToBase64(doc as PdfOutputDoc), filename };
  }
  doc.save(filename);
}

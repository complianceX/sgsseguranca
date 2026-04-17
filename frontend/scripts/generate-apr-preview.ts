import * as fs from "fs";
import * as path from "path";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  applyFooterGovernance,
  buildDocumentCode,
  buildValidationUrl,
  createPdfContext,
  drawAprBlueprint,
  drawPageBackground,
  formatDateTime,
} from "../lib/pdf-system/index";

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  const outputDir = path.join(process.cwd(), "artifacts", "apr-preview");
  ensureDir(outputDir);

  const apr = {
    id: "apr-preview-001",
    numero: "APR-2026-UX-001",
    titulo: "APR de prévia visual",
    descricao:
      "Documento de prévia para validar matriz de risco e paleta normativa em tela e PDF.",
    data_inicio: new Date().toISOString(),
    data_fim: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    status: "Aprovada",
    versao: 1,
    company_id: "EMP-001",
    company: { razao_social: "SGS Segurança" },
    site_id: "SITE-001",
    site: { nome: "Obra Centro" },
    elaborador_id: "USR-001",
    elaborador: { nome: "Equipe SST" },
    participants: [{ nome: "Técnico A" }, { nome: "Supervisor B" }],
    classificacao_resumo: {
      total: 4,
      aceitavel: 1,
      atencao: 1,
      substancial: 1,
      critico: 1,
    },
    itens_risco: [
      {
        atividade_processo: "Inspeção de área",
        agente_ambiental: "Risco ergonômico",
        condicao_perigosa: "Postura inadequada",
        fontes_circunstancias: "Levantamento manual",
        probabilidade: "1",
        severidade: "1",
        categoria_risco: "Aceitável",
        medidas_prevencao: "Ajuste de postura e pausa ativa",
      },
      {
        atividade_processo: "Trânsito interno",
        agente_ambiental: "Movimentação de equipamentos",
        condicao_perigosa: "Conflito com empilhadeira",
        fontes_circunstancias: "Corredor compartilhado",
        probabilidade: "2",
        severidade: "2",
        categoria_risco: "Atenção",
        medidas_prevencao: "Faixa segregada e sinalização",
      },
      {
        atividade_processo: "Manutenção elétrica",
        agente_ambiental: "Energia elétrica",
        condicao_perigosa: "Contato com circuito energizado",
        fontes_circunstancias: "Painel de comando",
        probabilidade: "2",
        severidade: "3",
        categoria_risco: "Substancial",
        medidas_prevencao: "LOTO e teste de ausência de tensão",
      },
      {
        atividade_processo: "Trabalho em altura",
        agente_ambiental: "Queda",
        condicao_perigosa: "Sem linha de vida",
        fontes_circunstancias: "Acesso à cobertura",
        probabilidade: "3",
        severidade: "3",
        categoria_risco: "Crítico",
        medidas_prevencao: "Linha de vida certificada e bloqueio da frente",
      },
    ],
  };

  const signatures = [
    {
      type: "Responsável técnico",
      user: { nome: "Eng. Segurança" },
      created_at: new Date().toISOString(),
      signed_at: new Date().toISOString(),
      signature_data: null,
    },
  ];

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const ctx = createPdfContext(doc, "compliance");
  const code = buildDocumentCode("APR", apr.numero);

  drawPageBackground(ctx);
  await drawAprBlueprint(
    ctx,
    autoTable,
    apr as never,
    signatures as never,
    code,
    buildValidationUrl(code),
  );

  applyFooterGovernance(ctx, {
    code,
    generatedAt: formatDateTime(new Date().toISOString()),
    draft: false,
  });

  const pdfPath = path.join(outputDir, "apr-preview.pdf");
  fs.writeFileSync(pdfPath, Buffer.from(doc.output("arraybuffer")));
  // eslint-disable-next-line no-console
  console.log(pdfPath);
}

void main();

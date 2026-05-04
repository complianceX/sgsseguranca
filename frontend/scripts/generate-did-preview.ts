import * as fs from "fs";
import * as path from "path";
import { generateDidPdf } from "../lib/pdf/didGenerator";
import type { Did } from "../services/didsService";

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  const now = new Date().toISOString();
  const did: Did = {
    id: "did-preview-001",
    titulo: "DID - Alinhamento de Frente de Serviço",
    descricao:
      "Prévia visual para validação de layout, espaçamento e bloco de governança.",
    data: now,
    turno: "Manhã",
    frente_trabalho: "Área de Carga e Descarga",
    atividade_principal: "Movimentação de materiais e organização da área",
    atividades_planejadas:
      "Checklist inicial da área, briefing de segurança e segregação de rota de pedestres.",
    riscos_operacionais:
      "Atropelamento por equipamentos móveis, queda de materiais e colisão em ponto cego.",
    controles_planejados:
      "Sinalização ativa, spotter dedicado, isolamento de área e verificação de EPIs.",
    epi_epc_aplicaveis: "Capacete, óculos, colete refletivo, botas e cones de isolamento.",
    observacoes:
      "Reforçar DDS para novos colaboradores e revisar plano de tráfego ao final do turno.",
    company_id: "company-preview-001",
    site_id: "site-preview-001",
    responsavel_id: "user-resp-001",
    participants: [
      {
        id: "user-001",
        nome: "Carlos Andrade",
        email: "carlos.andrade@sgs.local",
        cpf: "00000000000",
        role: "TST",
        company_id: "company-preview-001",
        profile_id: "profile-001",
        created_at: now,
        updated_at: now,
      },
      {
        id: "user-002",
        nome: "Marina Souza",
        email: "marina.souza@sgs.local",
        cpf: "11111111111",
        role: "Supervisor",
        company_id: "company-preview-001",
        profile_id: "profile-001",
        created_at: now,
        updated_at: now,
      },
    ],
    status: "alinhado",
    created_at: now,
    updated_at: now,
    site: { id: "site-preview-001", nome: "Obra Central" },
    responsavel: { id: "user-resp-001", nome: "Renato Lima" },
    company: {
      id: "company-preview-001",
      razao_social: "SGS Segurança do Trabalho",
      logo_url: null,
    },
  };

  const base64 = await generateDidPdf(did, {
    save: false,
    output: "base64",
    draftWatermark: false,
  });

  if (!base64) {
    throw new Error("Falha ao gerar base64 do PDF DID.");
  }

  const outputDir = path.join(process.cwd(), "temp");
  ensureDir(outputDir);
  const pdfPath = path.join(outputDir, "did-pdf-visual-review-2026-05-04-v2.pdf");
  fs.writeFileSync(pdfPath, Buffer.from(base64, "base64"));
  console.log(pdfPath);
}

void main();

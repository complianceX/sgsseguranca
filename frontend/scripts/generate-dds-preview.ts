import * as fs from "fs";
import * as path from "path";
import { generateDdsPdf } from "../lib/pdf/ddsGenerator";
import type { Dds } from "../services/ddsService";
import type { Signature } from "../services/signaturesService";

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  const now = new Date().toISOString();
  const dds: Dds = {
    id: "dds-preview-001",
    tema: "DDS - Rotas segregadas e movimentação interna",
    conteudo:
      "Alinhamento diário sobre riscos de circulação mista, reforço de sinalização e checklist antes da liberação da área.",
    data: now,
    status: "publicado",
    company_id: "company-preview-001",
    site_id: "site-preview-001",
    facilitador_id: "user-fac-001",
    participants: [
      {
        id: "user-001",
        nome: "Carlos Andrade",
        email: "carlos.andrade@sgs.local",
        cpf: "00000000000",
        role: "Operador",
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
        role: "Encarregada",
        company_id: "company-preview-001",
        profile_id: "profile-001",
        created_at: now,
        updated_at: now,
      },
    ],
    participant_count: 2,
    document_code: "DDS-2026-EVIEW001",
    final_pdf_hash_sha256:
      "0f5c3ab62022c2d8f89b39535f308f7f11bd5c95ce4b7ab6e5f97e11726aa0aa",
    pdf_generated_at: now,
    emitted_ip: "192.168.10.22",
    validation_token: "preview-token",
    is_modelo: false,
    version: 1,
    created_at: now,
    updated_at: now,
    site: { nome: "Obra Central" },
    facilitador: { nome: "Renato Lima" },
    emitted_by: { nome: "Renato Lima" },
    company: {
      razao_social: "SGS Segurança do Trabalho",
      logo_url: null,
    },
  };

  const signatures: Signature[] = [
    {
      id: "sig-1",
      user_id: "user-001",
      user: { nome: "Carlos Andrade" },
      document_id: dds.id,
      document_type: "DDS",
      signature_data: "HMAC_PENDING",
      type: "digital",
      signature_hash: "a2f83bb98da1adf3c3c6f4b6b0a41d8e9a9b27b6f0a91f1bd41f63fbfd8dbe31",
      created_at: now,
      signed_at: now,
      timestamp_authority: "SGS-AUTH",
    },
    {
      id: "sig-2",
      user_id: "user-002",
      user: { nome: "Marina Souza" },
      document_id: dds.id,
      document_type: "DDS",
      signature_data: "HMAC_PENDING",
      type: "digital",
      signature_hash: "b3d9a7fb0dcca801e5e970fb45ea74a16f6d29b8b23e40f4d11f846a8d001f62",
      created_at: now,
      signed_at: now,
      timestamp_authority: "SGS-AUTH",
    },
  ];

  const base64 = await generateDdsPdf(dds, signatures, {
    save: false,
    output: "base64",
    draftWatermark: false,
  });

  if (!base64) {
    throw new Error("Falha ao gerar base64 do PDF DDS.");
  }

  const outputDir = path.join(process.cwd(), "temp");
  ensureDir(outputDir);
  const pdfPath = path.join(
    outputDir,
    "dds-pdf-visual-review-2026-05-04-v2.pdf",
  );
  fs.writeFileSync(pdfPath, Buffer.from(base64, "base64"));
  console.log(pdfPath);
}

void main();

import * as fs from "fs";
import * as path from "path";
import { generateDdsPdf } from "../lib/pdf/ddsGenerator";
import type { Dds } from "../services/ddsService";
import type { Signature } from "../services/signaturesService";
import type { GovernedDocumentVideoAttachment } from "../lib/videos/documentVideos";

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  process.env.NEXT_PUBLIC_APP_URL =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

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
      id: "sig-photo-1",
      user_id: "user-001",
      document_id: dds.id,
      document_type: "DDS",
      type: "team_photo_1",
      signature_data: JSON.stringify({
        imageData:
          "data:image/jpeg;base64,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",
        capturedAt: now,
        hash: "a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0001",
        metadata: {
          userAgent: "preview-script",
          latitude: -9.6658,
          longitude: -35.7353,
          accuracy: 7,
        },
      }),
      created_at: now,
      signed_at: now,
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

  const videos: GovernedDocumentVideoAttachment[] = [
    {
      id: "video-1",
      company_id: dds.company_id,
      module: "dds",
      document_type: "DDS",
      document_id: dds.id,
      original_name: "evidencia-equipe-turno-a.mp4",
      mime_type: "video/mp4",
      size_bytes: 18432000,
      file_hash: "f0e1d2c3b4a5968778695a4b3c2d1e0ffedcba98765432100123456789abcdef",
      storage_key: "documents/preview/dds/video-1.mp4",
      uploaded_by_id: "user-fac-001",
      uploaded_at: now,
      duration_seconds: 42,
      processing_status: "ready",
      availability: "stored",
      created_at: now,
      updated_at: now,
      removed_at: null,
      removed_by_id: null,
    },
  ];

  const base64 = await generateDdsPdf(dds, signatures, videos, {
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

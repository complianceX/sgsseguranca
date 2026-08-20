import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Dds } from "@/services/ddsService";
import type { Signature } from "@/services/signaturesService";
import { generateDdsPdf } from "./ddsGenerator";

describe("DDS golden PDF", () => {
  it(
    "gera PDFs auditáveis com 5, 30, 100 e 300 participantes sintéticos",
    async () => {
      const outputDirectory = path.resolve(process.cwd(), "../output/pdf");
      mkdirSync(outputDirectory, { recursive: true });

      for (const participantCount of [5, 30, 100, 300]) {
        const participants = Array.from({ length: participantCount }, (_, index) => ({
          id: `synthetic-user-${String(index + 1).padStart(3, "0")}`,
          nome: `Participante sintético ${String(index + 1).padStart(3, "0")}`,
          email: `participant-${index + 1}@invalid.test`,
          cpf: null,
          funcao: index % 2 === 0 ? "Operador" : "Supervisor",
          role: "COLABORADOR",
          company_id: "00000000-0000-4000-8000-000000000001",
          profile_id: "synthetic-profile",
          created_at: "2026-08-16T11:00:00.000Z",
          updated_at: "2026-08-16T12:00:00.000Z",
        }));
        const signatures: Signature[] = participants.map((participant, index) => ({
          id: `synthetic-signature-${String(index + 1).padStart(3, "0")}`,
          document_id: `synthetic-dds-${participantCount}-2026-08-16`,
          document_type: "DDS",
          user_id: participant.id,
          user: { nome: participant.nome, funcao: participant.funcao },
          signature_data: "synthetic-signature-evidence",
          type: "digital",
          signed_at: "2026-08-16T12:00:00.000Z",
          created_at: "2026-08-16T12:00:00.000Z",
        }));
        const dds: Dds = {
          id: `synthetic-dds-${participantCount}-2026-08-16`,
          tema: "Prevenção de quedas, bloqueio e comunicação de riscos",
          conteudo:
            "Fixture sintética para validar paginação, assinatura, governança e legibilidade do PDF.",
          data: "2026-08-16",
          status: "auditado",
          company_id: "00000000-0000-4000-8000-000000000001",
          site_id: "00000000-0000-4000-8000-000000000002",
          facilitador_id: "synthetic-facilitator",
          participants,
          participant_count: participants.length,
          document_code: `DDS-2026-08-16-${participantCount}`,
          validation_token: "synthetic-validation-token",
          final_pdf_hash_sha256: "a".repeat(64),
          pdf_generated_at: "2026-08-16T12:10:00.000Z",
          created_at: "2026-08-16T11:00:00.000Z",
          updated_at: "2026-08-16T12:10:00.000Z",
          site: { nome: "Obra sintética de testes" },
          facilitador: { nome: "Facilitador sintético" },
          company: { razao_social: "SGS Loadtest Synthetic" },
        };

        const base64 = await generateDdsPdf(dds, signatures, [], {
          save: false,
          output: "base64",
        });

        expect(base64).toMatch(/^[A-Za-z0-9+/]+=*$/);
        const pdfBytes = Buffer.from(String(base64), "base64");
        expect(pdfBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
        expect(pdfBytes.length).toBeGreaterThan(5_000);

        const filename = participantCount === 30
          ? "dds-golden-2026-08-16.pdf"
          : `dds-stress-${participantCount}-2026-08-16.pdf`;
        writeFileSync(path.join(outputDirectory, filename), pdfBytes);
      }
    },
    120_000,
  );
});

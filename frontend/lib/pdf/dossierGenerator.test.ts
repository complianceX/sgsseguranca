import type {
  EmployeeDossierContext,
  SiteDossierContext,
} from "@/services/dossiersService";
import { generateDossierPdf } from "./dossierGenerator";

const employeeContext: EmployeeDossierContext = {
  id: "abcdef12-3456-7890-abcd-ef1234567890",
  code: "DOS-EMP-ABCDEF12",
  kind: "employee",
  companyId: "company-1",
  companyName: "Gandra Tecnologia",
  generatedAt: "2026-03-19T12:00:00.000Z",
  summary: {
    trainings: 1,
    assignments: 1,
    pts: 1,
    cats: 1,
    attachments: 2,
    officialDocuments: 2,
    pendingOfficialDocuments: 1,
    supportingAttachments: 2,
  },
  truncation: {
    limit: 500,
    truncated: false,
    datasets: {
      trainings: false,
      assignments: false,
      pts: false,
      cats: false,
      workers: false,
    },
  },
  attachmentLines: [
    {
      tipo: "Treinamento",
      referencia: "NR-35",
      arquivo: "certificado.pdf",
      url: "storage/training/certificado.pdf",
    },
  ],
  governedDocumentLines: [
    {
      modulo: "pt",
      modulo_label: "PT",
      referencia: "PT-001",
      codigo_documento: "PT-2026-0001",
      arquivo: "pt-final.pdf",
      disponibilidade: "ready",
      emitido_em: "2026-03-19T12:00:00.000Z",
    },
    {
      modulo: "cat",
      modulo_label: "CAT",
      referencia: "CAT-001",
      codigo_documento: "CAT-2026-0001",
      arquivo: "cat-final.pdf",
      disponibilidade: "registered_without_signed_url",
      emitido_em: "2026-03-19T12:00:00.000Z",
    },
  ],
  pendingGovernedDocumentLines: [
    {
      modulo: "pt",
      modulo_label: "PT",
      referencia: "PT-099",
      status_atual: "Pendente",
      pendencia: "Documento oficial ainda não possui PDF final governado emitido.",
    },
  ],
  subject: {
    id: "abcdef12-3456-7890-abcd-ef1234567890",
    nome: "Maria Souza",
    funcao: "Tecnica de seguranca",
    status: true,
    profileName: "TST",
    siteName: "Obra Central",
    cpf: "123.456.789-09",
    updatedAt: "2026-03-19T12:00:00.000Z",
  },
  trainings: [
    {
      id: "tr-1",
      nome: "NR-35",
      nrCodigo: "NR35",
      dataConclusao: "2026-01-10T00:00:00.000Z",
      dataVencimento: "2027-01-10T00:00:00.000Z",
      status: "Valido",
    },
  ],
  assignments: [
    {
      id: "as-1",
      epiNome: "Capacete",
      ca: "12345",
      validadeCa: "2027-02-01T00:00:00.000Z",
      status: "entregue",
      entregueEm: "2026-03-01T00:00:00.000Z",
      devolvidoEm: null,
    },
  ],
  pts: [
    {
      id: "pt-1",
      numero: "PT-001",
      titulo: "Trabalho em altura",
      status: "Aprovada",
      responsavel: "Carlos Silva",
      dataInicio: "2026-03-19T08:00:00.000Z",
      dataFim: "2026-03-19T17:00:00.000Z",
    },
  ],
  cats: [
    {
      id: "cat-1",
      numero: "CAT-001",
      status: "fechada",
      gravidade: "leve",
      dataOcorrencia: "2026-02-01T10:00:00.000Z",
      descricao: "Lesao leve sem afastamento.",
    },
  ],
};

const siteContext: SiteDossierContext = {
  id: "12345678-aaaa-bbbb-cccc-123456789012",
  code: "DOS-SIT-12345678",
  kind: "site",
  companyId: "company-1",
  companyName: "Gandra Tecnologia",
  generatedAt: "2026-03-19T12:00:00.000Z",
  summary: {
    trainings: 2,
    assignments: 2,
    pts: 1,
    cats: 1,
    attachments: 1,
    officialDocuments: 3,
    pendingOfficialDocuments: 1,
    supportingAttachments: 1,
  },
  truncation: {
    limit: 500,
    truncated: false,
    datasets: {
      trainings: false,
      assignments: false,
      pts: false,
      cats: false,
      workers: false,
    },
  },
  attachmentLines: [
    {
      tipo: "Treinamento",
      referencia: "NR-35",
      arquivo: "certificado.pdf",
      url: "storage/trainings/certificado.pdf",
    },
  ],
  governedDocumentLines: [
    {
      modulo: "apr",
      modulo_label: "APR",
      referencia: "APR-001",
      codigo_documento: "APR-2026-0001",
      arquivo: "apr-final.pdf",
      disponibilidade: "ready",
      emitido_em: "2026-03-19T12:00:00.000Z",
    },
    {
      modulo: "pt",
      modulo_label: "PT",
      referencia: "PT-001",
      codigo_documento: "PT-2026-0001",
      arquivo: "pt-final.pdf",
      disponibilidade: "ready",
      emitido_em: "2026-03-19T12:00:00.000Z",
    },
    {
      modulo: "inspection",
      modulo_label: "Inspeção",
      referencia: "Rotina - Obra Central",
      codigo_documento: "INS-2026-0001",
      arquivo: "inspection-final.pdf",
      disponibilidade: "ready",
      emitido_em: "2026-03-19T12:00:00.000Z",
    },
  ],
  pendingGovernedDocumentLines: [
    {
      modulo: "dds",
      modulo_label: "DDS",
      referencia: "DDS diário",
      status_atual: "rascunho",
      pendencia: "Documento oficial ainda não possui PDF final governado emitido.",
    },
  ],
  subject: {
    id: "12345678-aaaa-bbbb-cccc-123456789012",
    nome: "Obra Central",
    endereco: "Av. Principal, 100",
    cidade: "Sao Paulo",
    estado: "SP",
    status: true,
    updatedAt: "2026-03-19T12:00:00.000Z",
  },
  workers: [
    {
      id: "worker-1",
      nome: "Maria Souza",
      funcao: "Tecnica de seguranca",
      profileName: "TST",
      status: true,
    },
  ],
  trainings: [
    {
      id: "tr-1",
      nome: "NR-35",
      workerName: "Maria Souza",
      dataConclusao: "2026-01-10T00:00:00.000Z",
      dataVencimento: "2027-01-10T00:00:00.000Z",
      status: "Valido",
    },
  ],
  assignments: [
    {
      id: "as-1",
      workerName: "Maria Souza",
      epiNome: "Capacete",
      status: "entregue",
      entregueEm: "2026-03-01T00:00:00.000Z",
      devolvidoEm: null,
    },
  ],
  pts: [
    {
      id: "pt-1",
      numero: "PT-001",
      titulo: "Trabalho em altura",
      status: "Aprovada",
      responsavel: "Carlos Silva",
      dataInicio: "2026-03-19T08:00:00.000Z",
      dataFim: "2026-03-19T17:00:00.000Z",
    },
  ],
  cats: [
    {
      id: "cat-1",
      numero: "CAT-001",
      status: "fechada",
      gravidade: "leve",
      workerName: "Maria Souza",
      dataOcorrencia: "2026-02-01T10:00:00.000Z",
    },
  ],
};

describe("dossierGenerator", () => {
  it("gera o PDF do dossie do colaborador sem quebrar", async () => {
    const result = (await generateDossierPdf(employeeContext, {
      save: false,
      output: "base64",
    })) as { base64: string; filename: string };

    expect(result.filename).toContain(
      "DOSSIE_COLABORADOR-MARIA-SOUZA_19-03-2026.pdf",
    );
    expect(result.base64.length).toBeGreaterThan(100);
  });

  it("gera o PDF do dossie da unidade sem quebrar", async () => {
    const result = (await generateDossierPdf(siteContext, {
      save: false,
      output: "base64",
    })) as { base64: string; filename: string };

    expect(result.filename).toContain(
      "DOSSIE_UNIDADE-OBRA-CENTRAL_19-03-2026.pdf",
    );
    expect(result.base64.length).toBeGreaterThan(100);
  });
});

jest.mock("@/services/rdosService", () => ({
  RDO_ACTIVITY_GOVERNED_PHOTO_REF_PREFIX: "gst:rdo-activity-photo:",
  rdosService: {
    getActivityPhotoAccess: jest.fn(),
  },
}));

jest.mock("@/lib/pdf/pdfFile", () => ({
  fetchImageAsDataUrl: jest.fn(),
  pdfDocToBase64: jest.requireActual("@/lib/pdf/pdfBase64").pdfDocToBase64,
}));

import { buildRdoDocumentCode, generateRdoPdf } from './rdoGenerator';
import type { Rdo } from '@/services/rdosService';
import { fetchImageAsDataUrl } from "@/lib/pdf/pdfFile";
import { rdosService } from "@/services/rdosService";

const baseRdo: Rdo = {
  id: 'abcdef12-3456-7890-abcd-ef1234567890',
  numero: 'RDO-202603-001',
  data: '2026-03-16',
  status: 'aprovado',
  company_id: 'company-1',
  company: { id: 'company-1', razao_social: 'Gandra Tecnologia' },
  site_id: 'site-1',
  site: { id: 'site-1', nome: 'Obra Alta Floresta' },
  responsavel_id: 'user-1',
  responsavel: { id: 'user-1', nome: 'Carlos Silva' },
  clima_manha: 'ensolarado',
  clima_tarde: 'nublado',
  houve_acidente: false,
  houve_paralisacao: false,
  mao_de_obra: [],
  equipamentos: [],
  materiais_recebidos: [],
  servicos_executados: [],
  ocorrencias: [],
  created_at: '2026-03-16T12:00:00.000Z',
  updated_at: '2026-03-16T12:00:00.000Z',
};

function buildActivityPhotoReference(
  fileKey = "documents/company-1/rdo-activity-photos/rdo-1/photo.jpg",
) {
  return `gst:rdo-activity-photo:${Buffer.from(
    JSON.stringify({
      v: 1,
      kind: "governed-storage",
      scope: "activity",
      fileKey,
      originalName: "photo.jpg",
      mimeType: "image/jpeg",
      uploadedAt: "2026-03-16T10:00:00.000Z",
      sizeBytes: 2048,
    }),
    "utf8",
  ).toString("base64url")}`;
}

describe('rdoGenerator', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (rdosService.getActivityPhotoAccess as jest.Mock).mockResolvedValue({
      url: "https://example.com/rdo-photo.jpg",
    });
    (fetchImageAsDataUrl as jest.Mock).mockResolvedValue(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6Xg8kAAAAASUVORK5CYII=",
    );
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('alinha o document code do RDO com o padrao ISO usado no registry', () => {
    expect(
      buildRdoDocumentCode(baseRdo.id, baseRdo.data),
    ).toBe('RDO-2026-12-ABCDEF12');
  });

  it('gera o PDF do RDO sem quebrar e com filename esperado', async () => {
    const result = (await generateRdoPdf(
      {
        ...baseRdo,
        servicos_executados: [
          {
            descricao: "Concretagem da laje",
            percentual_concluido: 80,
            fotos: [buildActivityPhotoReference()],
          },
        ],
      },
      {
        save: false,
        output: 'base64',
      },
    )) as { base64: string; filename: string };

    expect(result.filename).toContain('RDO_RDO-202603-001_16-03-2026.pdf');
    expect(result.base64.length).toBeGreaterThan(100);
    expect(rdosService.getActivityPhotoAccess).toHaveBeenCalledWith(
      baseRdo.id,
      0,
      0,
    );
  });

  it('falha na emissão oficial quando uma foto governada nao pode ser resolvida', async () => {
    (fetchImageAsDataUrl as jest.Mock).mockRejectedValueOnce(
      new Error("foto indisponivel"),
    );

    await expect(
      generateRdoPdf(
        {
          ...baseRdo,
          servicos_executados: [
            {
              descricao: "Concretagem da laje",
              percentual_concluido: 80,
              fotos: [buildActivityPhotoReference()],
            },
          ],
        },
        {
          save: false,
          output: "base64",
          draftWatermark: false,
        },
      ),
    ).rejects.toThrow(/Evidência fotográfica/i);
  });
});

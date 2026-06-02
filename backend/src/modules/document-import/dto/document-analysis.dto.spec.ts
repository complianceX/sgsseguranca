import 'reflect-metadata';

import {
  DocumentValidationStatus,
  toDocumentImportResponseDto,
} from './document-analysis.dto';
import { DocumentImportStatus } from '../entities/document-import-status.enum';

describe('toDocumentImportResponseDto', () => {
  it('serializa datas para string e normaliza colecoes opcionais', () => {
    const payload = toDocumentImportResponseDto({
      success: true,
      documentId: 'doc-1',
      tipoDocumento: 'APR',
      tipoDocumentoDescricao: 'APR',
      analysis: {
        empresa: 'Empresa Teste',
        data: new Date('2026-03-20T10:00:00.000Z'),
        riscos: undefined,
        epis: ['Capacete'],
        nrsCitadas: undefined,
        assinaturas: undefined,
      },
      validation: {
        status: DocumentValidationStatus.INCOMPLETO,
        pendencias: ['Campo ausente'],
        scoreConfianca: 0.77,
      },
      metadata: {
        tamanhoArquivo: 128,
        quantidadeTexto: 64,
        hash: 'hash-1',
        timestamp: new Date('2026-03-20T10:00:00.000Z'),
        validacao: {
          status: DocumentValidationStatus.INCOMPLETO,
          pendencias: ['Campo ausente'],
          scoreConfianca: 0.77,
        },
        status: DocumentImportStatus.COMPLETED,
        autoCreateDds: {
          state: 'failed',
          requestedAt: new Date('2026-03-20T10:01:00.000Z'),
          completedAt: new Date('2026-03-20T10:01:30.000Z'),
          error: 'dds downstream failed',
        },
      },
    });

    expect(payload.analysis).toMatchObject({
      empresa: 'Empresa Teste',
      data: '2026-03-20T10:00:00.000Z',
      riscos: [],
      epis: ['Capacete'],
      nrsCitadas: [],
      assinaturas: [],
    });
    expect(payload.validation).toEqual({
      status: DocumentValidationStatus.INCOMPLETO,
      pendencias: ['Campo ausente'],
      scoreConfianca: 0.77,
    });
    expect(payload.metadata).toMatchObject({
      tamanhoArquivo: 128,
      quantidadeTexto: 64,
      hash: 'hash-1',
      timestamp: '2026-03-20T10:00:00.000Z',
      status: DocumentImportStatus.COMPLETED,
      validacao: {
        status: DocumentValidationStatus.INCOMPLETO,
        pendencias: ['Campo ausente'],
        scoreConfianca: 0.77,
      },
      autoCreateDds: {
        state: 'failed',
        requestedAt: '2026-03-20T10:01:00.000Z',
        completedAt: '2026-03-20T10:01:30.000Z',
        error: 'dds downstream failed',
      },
    });
  });
});

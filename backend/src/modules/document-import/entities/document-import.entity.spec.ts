import { getMetadataArgsStorage } from 'typeorm';
import { DocumentImport } from './document-import.entity';

describe('DocumentImport entity metadata', () => {
  it('declares explicit SQL types for nullable string columns used by migrations', () => {
    const columns = getMetadataArgsStorage().columns.filter(
      (column) => column.target === DocumentImport,
    );

    expect(
      columns.find((column) => column.propertyName === 'tipoDocumento')?.options
        .type,
    ).toBe('varchar');
    expect(
      columns.find((column) => column.propertyName === 'nomeArquivo')?.options
        .type,
    ).toBe('varchar');
    expect(
      columns.find((column) => column.propertyName === 'idempotencyKey')
        ?.options.type,
    ).toBe('varchar');
    expect(
      columns.find((column) => column.propertyName === 'mimeType')?.options
        .type,
    ).toBe('varchar');
    expect(
      columns.find((column) => column.propertyName === 'processingJobId')
        ?.options.type,
    ).toBe('varchar');
  });
});

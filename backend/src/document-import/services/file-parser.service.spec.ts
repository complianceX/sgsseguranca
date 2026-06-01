import { PayloadTooLargeException } from '@nestjs/common';
import { FileParserService } from './file-parser.service';

function makeOfficeZipWithDeclaredExpansion(uncompressedBytes: number): Buffer {
  const fileName = Buffer.from('[Content_Types].xml');
  const centralDirectory = Buffer.alloc(46 + fileName.length);
  centralDirectory.writeUInt32LE(0x02014b50, 0);
  centralDirectory.writeUInt32LE(uncompressedBytes, 24);
  centralDirectory.writeUInt16LE(fileName.length, 28);
  fileName.copy(centralDirectory, 46);

  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(1, 8);
  endOfCentralDirectory.writeUInt16LE(1, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(0, 16);

  return Buffer.concat([centralDirectory, endOfCentralDirectory]);
}

describe('FileParserService', () => {
  const originalMaxExpandedBytes =
    process.env.DOCUMENT_IMPORT_OFFICE_MAX_UNCOMPRESSED_BYTES;
  const originalMaxTextBytes =
    process.env.DOCUMENT_IMPORT_EXTRACTED_TEXT_MAX_BYTES;
  let service: FileParserService;

  beforeEach(() => {
    service = new FileParserService();
    process.env.DOCUMENT_IMPORT_OFFICE_MAX_UNCOMPRESSED_BYTES = '1024';
    process.env.DOCUMENT_IMPORT_EXTRACTED_TEXT_MAX_BYTES = '32';
  });

  afterAll(() => {
    if (originalMaxExpandedBytes === undefined) {
      delete process.env.DOCUMENT_IMPORT_OFFICE_MAX_UNCOMPRESSED_BYTES;
    } else {
      process.env.DOCUMENT_IMPORT_OFFICE_MAX_UNCOMPRESSED_BYTES =
        originalMaxExpandedBytes;
    }
    if (originalMaxTextBytes === undefined) {
      delete process.env.DOCUMENT_IMPORT_EXTRACTED_TEXT_MAX_BYTES;
    } else {
      process.env.DOCUMENT_IMPORT_EXTRACTED_TEXT_MAX_BYTES =
        originalMaxTextBytes;
    }
  });

  it('rejeita DOCX com expansao ZIP declarada acima do limite', async () => {
    await expect(
      service.extractText(
        makeOfficeZipWithDeclaredExpansion(2048),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'documento.docx',
      ),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('rejeita texto extraido acima do limite antes da classificacao', async () => {
    await expect(
      service.extractText(
        Buffer.from('x'.repeat(64)),
        'text/plain',
        'documento.txt',
      ),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });
});

import { BadRequestException } from '@nestjs/common';
import { PdfValidatorService } from './pdf-validator.service';

const buildPdfBuffer = (content: string): Buffer => {
  const pdf = `%PDF-1.7
1 0 obj
<< /Type /Catalog >>
endobj
2 0 obj
<< ${content} >>
endobj
trailer
<< /Root 1 0 R >>
%%EOF
${' '.repeat(120)}`;

  return Buffer.from(pdf, 'latin1');
};

describe('PdfValidatorService', () => {
  let service: PdfValidatorService;

  beforeEach(() => {
    service = new PdfValidatorService();
  });

  it('aceita PDFs governados com /AA sem script ativo no contexto de geração', () => {
    const buffer = buildPdfBuffer(
      '/Type /Annot /Subtype /Link /AA << /E << /S /GoTo /D [3 0 R /Fit] >> >>',
    );

    expect(() => service.validatePdfBuffer(buffer, 'generation')).not.toThrow();
  });

  it('aceita PDFs governados com /AA sem script ativo no contexto de assinatura', () => {
    const buffer = buildPdfBuffer(
      '/Type /Annot /Subtype /Link /AA << /E << /S /GoTo /D [3 0 R /Fit] >> >>',
    );

    expect(() => service.validatePdfBuffer(buffer, 'sign')).not.toThrow();
  });

  it('rejeita PDFs com OpenAction malicioso', () => {
    const buffer = buildPdfBuffer(
      '/OpenAction << /S /JavaScript /JS (app.alert("x")) >>',
    );

    expect(() => service.validatePdfBuffer(buffer, 'generation')).toThrow(
      BadRequestException,
    );
  });

  it('rejeita PDFs com Launch action', () => {
    const buffer = buildPdfBuffer('/A << /S /Launch /F (cmd.exe) >>');

    expect(() => service.validatePdfBuffer(buffer, 'sign')).toThrow(
      BadRequestException,
    );
  });
});

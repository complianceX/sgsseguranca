import { BadRequestException } from '@nestjs/common';
import { ArrsController } from './arrs.controller';
import { ArrStatus } from './entities/arr.entity';

jest.mock('../common/interceptors/file-upload.interceptor', () => ({
  assertUploadedPdf: jest.fn((file: Express.Multer.File | undefined) => {
    if (!file) {
      throw new BadRequestException('Arquivo PDF é obrigatório.');
    }
    return file;
  }),
  cleanupUploadedTempFile: jest.fn(() => undefined),
  createGovernedPdfUploadOptions: jest.fn(() => ({})),
}));

describe('ArrsController', () => {
  const arrsService = {
    attachPdf: jest.fn(),
    updateStatus: jest.fn(),
  };

  let controller: ArrsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ArrsController(
      arrsService as never,
      {
        inspect: jest.fn(),
      } as never,
    );
  });

  it('repassa o userId autenticado ao emitir o PDF final governado', async () => {
    arrsService.attachPdf.mockResolvedValue({ ok: true });
    const file = {
      originalname: 'arr-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-arr'),
    } as Express.Multer.File;

    await controller.attachFile(
      '11111111-1111-4111-8111-111111111111',
      { user: { userId: 'user-123' } } as never,
      file,
    );

    expect(arrsService.attachPdf).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      file,
      { userId: 'user-123' },
    );
  });

  it('aceita fallback para req.user.id ao emitir o PDF final', async () => {
    arrsService.attachPdf.mockResolvedValue({ ok: true });
    const file = {
      originalname: 'arr-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-arr'),
    } as Express.Multer.File;

    await controller.attachFile(
      '11111111-1111-4111-8111-111111111111',
      { user: { id: 'user-id-fallback' } } as never,
      file,
    );

    expect(arrsService.attachPdf).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      file,
      { userId: 'user-id-fallback' },
    );
  });

  it('rejeita status inválido no endpoint de transição', () => {
    expect(() =>
      controller.updateStatus(
        '11111111-1111-4111-8111-111111111111',
        'invalido' as ArrStatus,
      ),
    ).toThrow(BadRequestException);
  });
});

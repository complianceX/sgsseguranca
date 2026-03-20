import { BadRequestException } from '@nestjs/common';
import { PublicCatsController } from './public-cats.controller';
import type { CatsService } from './cats.service';

describe('PublicCatsController', () => {
  let controller: PublicCatsController;
  let catsService: Pick<CatsService, 'validateByCode'>;

  beforeEach(() => {
    catsService = {
      validateByCode: jest.fn(),
    };

    controller = new PublicCatsController(catsService as CatsService);
  });

  it('retorna o payload publico da CAT validada', async () => {
    (catsService.validateByCode as jest.Mock).mockResolvedValue({
      valid: true,
      code: 'CAT-2026-ABCDEF12',
      document: {
        id: 'cat-1',
        module: 'cat',
        document_type: 'cat',
      },
    });

    await expect(
      controller.validateByCode('CAT-2026-ABCDEF12'),
    ).resolves.toEqual({
      valid: true,
      code: 'CAT-2026-ABCDEF12',
      document: {
        id: 'cat-1',
        module: 'cat',
        document_type: 'cat',
      },
    });
  });

  it('rejeita chamada sem codigo', async () => {
    await expect(controller.validateByCode('   ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

import { BadRequestException } from '@nestjs/common';
import { PublicDossiersController } from './public-dossiers.controller';
import type { DossiersService } from './dossiers.service';

describe('PublicDossiersController', () => {
  let controller: PublicDossiersController;
  let dossiersService: Pick<DossiersService, 'validateByCode'>;

  beforeEach(() => {
    dossiersService = {
      validateByCode: jest.fn(),
    };

    controller = new PublicDossiersController(
      dossiersService as DossiersService,
    );
  });

  it('retorna o payload publico do dossie validado', async () => {
    (dossiersService.validateByCode as jest.Mock).mockResolvedValue({
      valid: true,
      code: 'DOS-EMP-ABCDEF12',
      document: {
        id: 'user-1',
        module: 'dossier',
        document_type: 'employee_dossier',
      },
    });

    await expect(
      controller.validateByCode('DOS-EMP-ABCDEF12'),
    ).resolves.toEqual({
      valid: true,
      code: 'DOS-EMP-ABCDEF12',
      document: {
        id: 'user-1',
        module: 'dossier',
        document_type: 'employee_dossier',
      },
    });
  });

  it('rejeita chamada sem codigo', async () => {
    await expect(controller.validateByCode('   ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

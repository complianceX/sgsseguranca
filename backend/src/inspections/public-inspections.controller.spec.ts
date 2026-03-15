import { BadRequestException } from '@nestjs/common';
import { PublicInspectionsController } from './public-inspections.controller';
import type { InspectionsService } from './inspections.service';

describe('PublicInspectionsController', () => {
  let controller: PublicInspectionsController;
  let inspectionsService: Pick<InspectionsService, 'validateByCode'>;

  beforeEach(() => {
    inspectionsService = {
      validateByCode: jest.fn(),
    };

    controller = new PublicInspectionsController(
      inspectionsService as InspectionsService,
    );
  });

  it('retorna o payload público de inspeção validada', async () => {
    (inspectionsService.validateByCode as jest.Mock).mockResolvedValue({
      valid: true,
      code: 'INS-2026-22D77ACC',
      inspection: {
        id: 'inspection-1',
      },
    });

    await expect(
      controller.validateByCode('INS-2026-22D77ACC'),
    ).resolves.toEqual({
      valid: true,
      code: 'INS-2026-22D77ACC',
      inspection: {
        id: 'inspection-1',
      },
    });
  });

  it('rejeita chamada sem código', async () => {
    await expect(controller.validateByCode('   ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

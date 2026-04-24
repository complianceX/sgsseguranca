import { UnauthorizedException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { WorkerOperationalStatusService } from './worker-operational-status.service';
import { WorkerTimelineService } from './worker-timeline.service';
import { ConsentsService } from '../consents/consents.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: jest.Mocked<
    Pick<UsersService, 'exportMyData' | 'updateAiConsent'>
  >;

  beforeEach(() => {
    usersService = {
      exportMyData: jest.fn(),
      updateAiConsent: jest.fn(),
    };

    controller = new UsersController(
      usersService as unknown as UsersService,
      {} as WorkerOperationalStatusService,
      {} as WorkerTimelineService,
      {} as ConsentsService,
    );
  });

  it('bloqueia export quando o request não possui usuário autenticado', async () => {
    await expect(controller.exportMyData({} as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(usersService.exportMyData).not.toHaveBeenCalled();
  });

  it('bloqueia update de consentimento sem usuário autenticado', async () => {
    await expect(
      controller.updateMyAiConsent({ consent: true }, {} as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersService.updateAiConsent).not.toHaveBeenCalled();
  });
});

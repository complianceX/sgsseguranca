import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

describe('CalendarController (http)', () => {
  let app: INestApplication;

  const calendarService = {
    getEvents: jest.fn(),
  };

  beforeEach(() => {
    calendarService.getEvents.mockReset();
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CalendarController],
      providers: [
        {
          provide: CalendarService,
          useValue: calendarService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest<{
            user?: { permissions?: string[] };
          }>();
          req.user = {
            permissions: ['can_view_calendar', 'can_view_trainings'],
          };
          return true;
        },
      })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('repassa ao service apenas as permissoes efetivas do usuario autenticado', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    calendarService.getEvents.mockResolvedValue([]);

    await request(httpServer)
      .get('/calendar/events')
      .query({ year: '2026', month: '4' })
      .expect(200);

    expect(calendarService.getEvents).toHaveBeenCalledWith(2026, 4, [
      'can_view_calendar',
      'can_view_trainings',
    ]);
  });
});

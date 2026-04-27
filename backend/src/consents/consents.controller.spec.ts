import { AUTHZ_OPTIONAL_KEY } from '../auth/authz-optional.decorator';
import { ConsentsController } from './consents.controller';
import { ConsentsService } from './consents.service';

describe('ConsentsController', () => {
  it('declara contrato AuthzOptional para self-service autenticado', () => {
    expect(Reflect.getMetadata(AUTHZ_OPTIONAL_KEY, ConsentsController)).toBe(
      true,
    );
  });

  it('consulta status de consentimentos do usuario autenticado', async () => {
    const getStatus = jest.fn().mockResolvedValue({ consents: [] });
    const consentsService = {
      getStatus,
    } as unknown as jest.Mocked<ConsentsService>;
    const controller = new ConsentsController(consentsService);

    await expect(
      controller.status({
        user: { userId: 'user-1' },
      } as never),
    ).resolves.toEqual({ consents: [] });

    expect(getStatus).toHaveBeenCalledWith('user-1');
  });
});

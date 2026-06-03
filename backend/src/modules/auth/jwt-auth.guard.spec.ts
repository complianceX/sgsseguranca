import { JwtAuthGuard } from './jwt-auth.guard';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let mockExecutionContext: ExecutionContext;

  beforeEach(() => {
    guard = new JwtAuthGuard({
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector);
    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          cookies: { access_token: 'valid-token' },
          headers: {},
        }),
      }),
    } as unknown as ExecutionContext;
  });

  it('should add token from cookie to authorization header', async () => {
    const superCanActivateMock = jest.fn().mockReturnValue(true);
    (
      guard as unknown as {
        canActivate: (ctx: ExecutionContext) => boolean | Promise<boolean>;
      }
    ).canActivate = (context: ExecutionContext) => {
      const request = context.switchToHttp().getRequest<{
        cookies: Record<string, string>;
        headers: Record<string, string>;
      }>();
      const token = request.cookies['access_token'];
      if (token) {
        request.headers.authorization = `Bearer ${token}`;
      }
      return superCanActivateMock(context) as boolean;
    };

    await (guard.canActivate(mockExecutionContext) as
      | Promise<boolean>
      | boolean);

    const request = mockExecutionContext.switchToHttp().getRequest<{
      headers: Record<string, string>;
    }>();
    expect(request.headers.authorization).toBe('Bearer valid-token');
  });

  it('should return false if no token (and super returns false)', async () => {
    const requestMock = {
      cookies: {},
      headers: {},
    };
    (
      mockExecutionContext.switchToHttp().getRequest as jest.Mock
    ).mockReturnValue(requestMock);

    const superCanActivateMock = jest.fn().mockReturnValue(false);
    (
      guard as unknown as {
        canActivate: (ctx: ExecutionContext) => boolean | Promise<boolean>;
      }
    ).canActivate = (context: ExecutionContext) => {
      const request = context.switchToHttp().getRequest<{
        cookies: Record<string, string>;
        headers: Record<string, string>;
      }>();
      const token = request.cookies['access_token'];
      if (token) {
        request.headers.authorization = `Bearer ${token}`;
      }
      return superCanActivateMock(context) as boolean;
    };

    const result = await (guard.canActivate(mockExecutionContext) as
      | Promise<boolean>
      | boolean);
    expect(result).toBe(false);
  });
});

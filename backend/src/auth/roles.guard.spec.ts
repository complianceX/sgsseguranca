import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { RbacService } from '../rbac/rbac.service';
import { ROLES_KEY } from './roles.decorator';
import { Role } from './enums/roles.enum';

describe('RolesGuard', () => {
    let guard: RolesGuard;
    let reflector: Reflector;
    let rbacService: RbacService;
    let mockExecutionContext: ExecutionContext;
    let loggerWarnSpy: jest.SpyInstance;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RolesGuard,
                {
                    provide: Reflector,
                    useValue: {
                        getAllAndOverride: jest.fn(),
                    },
                },
                {
                    provide: RbacService,
                    useValue: {
                        getUserAccess: jest.fn(),
                    },
                },
            ],
        }).compile();

        guard = module.get<RolesGuard>(RolesGuard);
        reflector = module.get<Reflector>(Reflector);
        rbacService = module.get<RbacService>(RbacService);

        loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

        mockExecutionContext = {
            getHandler: () => ({ name: 'testHandler' }),
            getClass: () => ({ name: 'TestController' }),
            switchToHttp: jest.fn().mockReturnValue({
                getRequest: jest.fn().mockReturnValue({
                    user: {
                        userId: 'user-123',
                        profile: { nome: Role.ADMIN_GERAL },
                    },
                }),
            }),
        } as unknown as ExecutionContext;
    });

    afterEach(() => {
        jest.clearAllMocks();
        loggerWarnSpy.mockRestore();
    });

    describe('Default-deny behavior', () => {
        it('should throw ForbiddenException when no @Roles() decorator is applied', async () => {
            (reflector.getAllAndOverride as jest.Mock).mockReturnValue(null);

            await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
                new ForbiddenException('Acesso negado: função não especificada'),
            );

            expect(loggerWarnSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'unauthorized_access_no_roles_required',
                    path: 'testHandler',
                    class: 'TestController',
                }),
            );
        });

        it('should throw ForbiddenException when @Roles() decorator has empty array', async () => {
            (reflector.getAllAndOverride as jest.Mock).mockReturnValue([]);

            await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
                new ForbiddenException('Acesso negado: função não especificada'),
            );

            expect(loggerWarnSpy).toHaveBeenCalled();
        });
    });

    describe('UserId validation', () => {
        it('should throw ForbiddenException when user is not authenticated (no userId)', async () => {
            (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
                Role.ADMIN_GERAL,
            ]);

            const requestWithoutUser = {
                user: {
                    profile: { nome: Role.ADMIN_GERAL },
                },
            };

            (mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(requestWithoutUser);

            await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
                new ForbiddenException('Usuário não autenticado'),
            );

            expect(loggerWarnSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'unauthorized_access_no_user',
                    path: 'testHandler',
                    class: 'TestController',
                }),
            );
        });

        it('should throw ForbiddenException when user object is null', async () => {
            (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
                Role.ADMIN_GERAL,
            ]);

            (mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue({});

            await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
                new ForbiddenException('Usuário não autenticado'),
            );
        });
    });

    describe('Role validation', () => {
        it('should throw ForbiddenException when user has invalid role', async () => {
            (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
                Role.ADMIN_GERAL,
            ]);

            const requestWithInvalidRole = {
                user: {
                    userId: 'user-123',
                    profile: { nome: 'INVALID_ROLE' },
                },
            };

            (mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(requestWithInvalidRole);

            await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
                new ForbiddenException('Função de usuário inválida'),
            );

            expect(loggerWarnSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'unauthorized_access_invalid_role',
                    userId: 'user-123',
                    attemptedRole: 'INVALID_ROLE',
                    requiredRoles: [Role.ADMIN_GERAL],
                }),
            );
        });

        it('should throw ForbiddenException when user does not have required role', async () => {
            (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
                Role.ADMIN_GERAL,
            ]);

            const requestWithWrongRole = {
                user: {
                    userId: 'user-123',
                    profile: { nome: Role.COLABORADOR },
                },
            };

            (mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(requestWithWrongRole);

            (rbacService.getUserAccess as jest.Mock).mockResolvedValue({
                roles: [Role.COLABORADOR],
                permissions: ['can_view_dashboard'],
            });

            await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
                new ForbiddenException('Função insuficiente para esta operação'),
            );

            expect(loggerWarnSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'unauthorized_access_insufficient_role',
                    userId: 'user-123',
                    userRole: Role.COLABORADOR,
                    requiredRoles: [Role.ADMIN_GERAL],
                }),
            );

            expect(rbacService.getUserAccess).toHaveBeenCalledWith('user-123', {
                profileName: Role.COLABORADOR,
            });
        });

        it('should handle RbacService error gracefully', async () => {
            (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
                Role.ADMIN_GERAL,
            ]);

            const requestWithWrongRole = {
                user: {
                    userId: 'user-123',
                    profile: { nome: Role.COLABORADOR },
                },
            };

            (mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(requestWithWrongRole);

            (rbacService.getUserAccess as jest.Mock).mockRejectedValue(new Error('RBAC service error'));

            await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
                new ForbiddenException('Função insuficiente para esta operação'),
            );

            expect(loggerWarnSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'unauthorized_access_insufficient_role',
                    userId: 'user-123',
                    userRole: Role.COLABORADOR,
                    error: 'RBAC service error',
                }),
            );
        });
    });

    describe('Access granted', () => {
        it('should allow access when user has required role', async () => {
            (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
                Role.ADMIN_GERAL,
            ]);

            const result = await guard.canActivate(mockExecutionContext);

            expect(result).toBe(true);
            expect(loggerWarnSpy).not.toHaveBeenCalled();
        });

        it('should allow access when user has one of multiple required roles', async () => {
            (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
                Role.ADMIN_GERAL,
                Role.ADMIN_EMPRESA,
            ]);

            const result = await guard.canActivate(mockExecutionContext);

            expect(result).toBe(true);
            expect(loggerWarnSpy).not.toHaveBeenCalled();
        });

        it('should allow access with string role names', async () => {
            (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
                'ADMIN_GERAL',
            ]);

            const result = await guard.canActivate(mockExecutionContext);

            expect(result).toBe(true);
            expect(loggerWarnSpy).not.toHaveBeenCalled();
        });
    });

    describe('Logging context', () => {
        it('should include correct path and class in logs', async () => {
            (reflector.getAllAndOverride as jest.Mock).mockReturnValue(null);

            await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow();

            expect(loggerWarnSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    path: 'testHandler',
                    class: 'TestController',
                    timestamp: expect.any(String),
                }),
            );
        });

        it('should include timestamp in all log entries', async () => {
            (reflector.getAllAndOverride as jest.Mock).mockReturnValue(null);

            await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow();

            const logCall = loggerWarnSpy.mock.calls[0][0];
            expect(logCall.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });
    });
});

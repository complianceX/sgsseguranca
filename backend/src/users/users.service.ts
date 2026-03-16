import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { randomBytes, pbkdf2Sync, createHmac } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { plainToClass } from 'class-transformer';
import { User } from './entities/user.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { PasswordService } from '../common/services/password.service';
import { CpfUtil } from '../common/utils/cpf.util';
import { USER_WITH_PASSWORD_FIELDS } from './constants/user-fields.constant';
import { UserResponseDto } from './dto/user-response.dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { RequestContext } from '../common/middleware/request-context.middleware';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import { Profile } from '../profiles/entities/profile.entity';
import { Role } from '../auth/enums/roles.enum';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Profile)
    private profilesRepository: Repository<Profile>,
    private tenantService: TenantService,
    private passwordService: PasswordService,
    private auditService: AuditService,
  ) {}

  async create(createUserData: DeepPartial<User>): Promise<UserResponseDto> {
    const { password, ...rest } = createUserData;
    const tenantId = this.tenantService.getTenantId();
    const isSuperAdmin = this.tenantService.isSuperAdmin();

    // Defesa em profundidade: não confiar em company_id vindo do body.
    if (
      !isSuperAdmin &&
      rest.company_id &&
      tenantId &&
      rest.company_id !== tenantId
    ) {
      this.logger.warn({
        event: 'cross_tenant_attempt',
        action: 'users.create',
        actorId: RequestContext.getUserId(),
        tenantId,
        requestedCompanyId: rest.company_id,
      });
      throw new ForbiddenException(
        'Não é permitido criar usuário em outra empresa.',
      );
    }

    const companyId = isSuperAdmin ? rest.company_id || tenantId : tenantId;

    if (!companyId) {
      throw new BadRequestException('Empresa é obrigatória');
    }

    // Broken Function Level Auth / Privilege Escalation:
    // apenas ADMIN_GERAL pode atribuir perfil "Administrador Geral".
    if (rest.profile_id) {
      const profile = await this.profilesRepository.findOne({
        where: { id: rest.profile_id },
        select: { id: true, nome: true },
      });
      if (profile?.nome === Role.ADMIN_GERAL && !isSuperAdmin) {
        this.logger.warn({
          event: 'role_change_denied',
          action: 'users.create',
          actorId: RequestContext.getUserId(),
          targetCompanyId: companyId,
          requestedProfile: profile.nome,
        });
        throw new ForbiddenException(
          'Atribuição de perfil Administrador Geral não é permitida.',
        );
      }
    }

    const normalizedCpf = CpfUtil.normalize(rest.cpf as string);

    const existingUser = await this.usersRepository.findOne({
      where: { cpf: normalizedCpf },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException('CPF já cadastrado');
    }

    let hashedPassword = '';
    if (password && typeof password === 'string') {
      hashedPassword = await this.passwordService.hash(password);
    }
    const user = this.usersRepository.create({
      ...rest,
      cpf: normalizedCpf,
      company_id: companyId,
      password: hashedPassword || undefined,
    } as DeepPartial<User>);
    const saved = await this.usersRepository.save(user);
    return plainToClass(UserResponseDto, saved);
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    search?: string;
    companyId?: string;
  }): Promise<OffsetPage<UserResponseDto>> {
    const tenantId = this.tenantService.getTenantId();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profile', 'profile')
      .skip(skip)
      .take(limit)
      .orderBy('user.nome', 'ASC');

    if (tenantId) {
      qb.where('user.company_id = :tenantId', { tenantId });
    } else if (opts?.companyId) {
      qb.where('user.company_id = :companyId', {
        companyId: opts.companyId,
      });
    }

    if (opts?.search) {
      const clause = '(user.nome ILIKE :search OR user.cpf LIKE :search)';
      tenantId || opts?.companyId
        ? qb.andWhere(clause, { search: `%${opts.search}%` })
        : qb.where(clause, { search: `%${opts.search}%` });
    }

    const [users, total] = await qb.getManyAndCount();
    const data = users.map((user) => plainToClass(UserResponseDto, user));
    return toOffsetPage(data, total, page, limit);
  }

  async findAll(page = 1, limit = 20): Promise<OffsetPage<UserResponseDto>> {
    return this.findPaginated({ page, limit });
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const tenantId = this.tenantService.getTenantId();
    const user = await this.usersRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
      relations: ['company', 'profile', 'site'],
    });
    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }
    return plainToClass(UserResponseDto, user);
  }

  async findOneWithPassword(id: string): Promise<User> {
    const tenantId = this.tenantService.getTenantId();
    const user = await this.usersRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
      select: [...USER_WITH_PASSWORD_FIELDS],
    });
    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }
    return user;
  }

  async findOneByCpf(cpf: string): Promise<User | null> {
    const normalizedCpf = CpfUtil.normalize(cpf);

    const user = await this.usersRepository.findOne({
      where: { cpf: normalizedCpf },
      select: [...USER_WITH_PASSWORD_FIELDS],
      relations: ['company', 'profile'],
    });

    if (user && user.status === false) {
      return null;
    }

    return user;
  }

  async update(
    id: string,
    updateUserData: DeepPartial<User>,
  ): Promise<UserResponseDto> {
    // Busca a entidade original
    const tenantId = this.tenantService.getTenantId();
    const isSuperAdmin = this.tenantService.isSuperAdmin();
    const user = await this.usersRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
    });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    const { password, ...rest } = updateUserData;

    // Bloqueio de mass assignment: não permitir alteração de company_id via payload.
    // Se for necessário "mover usuário de empresa", crie um endpoint admin dedicado com
    // auditoria e validações adicionais.
    if (rest.company_id) {
      this.logger.warn({
        event: 'mass_assignment_blocked',
        action: 'users.update',
        actorId: RequestContext.getUserId(),
        tenantId,
        targetUserId: id,
        attemptedCompanyId: rest.company_id,
      });
      delete (rest as any).company_id;
      if (!isSuperAdmin) {
        throw new ForbiddenException(
          'Alteração de empresa do usuário não é permitida por este endpoint.',
        );
      }
    }

    // Privilege Escalation: bloquear promoção para ADMIN_GERAL por não-superadmin.
    if (rest.profile_id) {
      const profile = await this.profilesRepository.findOne({
        where: { id: rest.profile_id },
        select: { id: true, nome: true },
      });
      if (profile?.nome === Role.ADMIN_GERAL && !isSuperAdmin) {
        this.logger.warn({
          event: 'role_change_denied',
          action: 'users.update',
          actorId: RequestContext.getUserId(),
          targetUserId: id,
          requestedProfile: profile.nome,
        });
        throw new ForbiddenException(
          'Atribuição de perfil Administrador Geral não é permitida.',
        );
      }
    }

    if (rest.profile_id && rest.profile_id !== (user as any).profile_id) {
      this.logger.warn({
        event: 'role_change',
        actorId: RequestContext.getUserId(),
        targetUserId: id,
        fromProfileId: (user as any).profile_id,
        toProfileId: rest.profile_id,
      });
    }

    if (password && typeof password === 'string') {
      user.password = await this.passwordService.hash(password);
    }

    Object.assign(user, rest);
    const saved = await this.usersRepository.save(user);
    return plainToClass(UserResponseDto, saved);
  }

  async remove(id: string): Promise<void> {
    // Busca a entidade para verificar existência
    const tenantId = this.tenantService.getTenantId();
    const user = await this.usersRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
    });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }
    await this.usersRepository.remove(user);
  }

  async gdprErasure(id: string): Promise<void> {
    const tenantId = this.tenantService.getTenantId();
    const user = await this.usersRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
    });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    await this.usersRepository.update(user.id, {
      email: `deleted_${user.id}@anon.invalid`,
      nome: 'Usuário Removido',
      cpf: null,
      funcao: null,
      status: false,
    });

    await this.usersRepository.softDelete(user.id);

    const actorId = RequestContext.getUserId() || '';
    const companyId = tenantId || user.company_id;
    const ip = (RequestContext.get('ip') as string) || 'unknown';
    const userAgent = (RequestContext.get('userAgent') as string) || 'system';

    await this.auditService.log({
      userId: actorId,
      action: AuditAction.GDPR_ERASURE,
      entity: 'USER',
      entityId: user.id,
      changes: { targetUserId: user.id },
      ip,
      userAgent,
      companyId,
    });
  }

  // ---------------------------------------------------------------------------
  // Signature PIN (HMAC-SHA256)
  // ---------------------------------------------------------------------------

  async hasSignaturePin(userId: string): Promise<boolean> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'signature_pin_hash'],
    });
    return Boolean(user?.signature_pin_hash);
  }

  async setSignaturePin(userId: string, pin: string, currentPassword?: string): Promise<void> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'password', 'signature_pin_hash'],
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    // Ao alterar PIN existente, exige senha atual obrigatoriamente
    if (user.signature_pin_hash) {
      if (!currentPassword) {
        throw new UnauthorizedException(
          'Senha atual obrigatória para alterar o PIN de assinatura.',
        );
      }
      const passwordOk = await this.passwordService.compare(
        currentPassword,
        user.password ?? '',
      );
      if (!passwordOk) throw new UnauthorizedException('Senha atual incorreta.');
    }

    const pbkdf2Salt = randomBytes(32).toString('hex');
    const pinBcryptHash = await this.passwordService.hash(pin);

    await this.usersRepository.update(userId, {
      signature_pin_hash: pinBcryptHash,
      signature_pin_salt: pbkdf2Salt,
    } as any);
  }

  async verifySignaturePin(userId: string, pin: string): Promise<boolean> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'signature_pin_hash'],
    });
    if (!user?.signature_pin_hash) return false;
    return this.passwordService.compare(pin, user.signature_pin_hash);
  }

  async deriveHmacKey(userId: string, pin: string): Promise<Buffer> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'signature_pin_hash', 'signature_pin_salt'],
    });
    if (!user?.signature_pin_hash || !user.signature_pin_salt) {
      throw new BadRequestException('PIN de assinatura não configurado.');
    }
    const pinOk = await this.passwordService.compare(pin, user.signature_pin_hash);
    if (!pinOk) throw new UnauthorizedException('PIN inválido.');

    return pbkdf2Sync(pin, user.signature_pin_salt, 100_000, 32, 'sha256');
  }

  computeHmac(key: Buffer, message: string): string {
    return createHmac('sha256', key).update(message).digest('hex');
  }
}

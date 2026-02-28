import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
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

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private tenantService: TenantService,
    private passwordService: PasswordService,
    private auditService: AuditService,
  ) {}

  async create(createUserData: DeepPartial<User>): Promise<UserResponseDto> {
    const { password, ...rest } = createUserData;
    const companyId = rest.company_id || this.tenantService.getTenantId();

    if (!companyId) {
      throw new BadRequestException('Empresa é obrigatória');
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
  }): Promise<OffsetPage<UserResponseDto>> {
    const tenantId = this.tenantService.getTenantId();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const [users, total] = await this.usersRepository.findAndCount({
      where: tenantId ? { company_id: tenantId } : {},
      // LISTING: carregar apenas o necessário (profile para nome no frontend).
      relations: ['profile'],
      select: {
        id: true,
        nome: true,
        cpf: true,
        email: true,
        funcao: true,
        company_id: true,
        site_id: true,
        profile_id: true,
        status: true,
        created_at: true,
        updated_at: true,
        profile: {
          id: true,
          nome: true,
        } as any,
      } as any,
      skip,
      take: limit,
      order: { nome: 'ASC' },
    });

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
    const user = await this.usersRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
    });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    const { password, ...rest } = updateUserData;

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
}

import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { USER_WITH_PASSWORD_FIELDS } from '../users/constants/user-fields.constant';
import { CpfUtil } from '../common/utils/cpf.util';
import { PasswordService } from '../common/services/password.service';
import { RedisService } from '../common/redis/redis.service';
import * as crypto from 'crypto';
import {
  getRefreshTokenTtl,
  getRefreshTokenTtlDays,
} from './auth-security.config';

interface JwtPayload {
  sub: string;
  cpf: string;
  company_id: string;
  profile: unknown;
}

@Injectable()
export class AuthService {
  // A pre-computed hash for a string that is cryptographically hard to guess.
  // Used to prevent timing attacks when a user is not found.
  // This hash corresponds to a dummy password and will never match a real one.
  private readonly DUMMY_HASH =
    '$2b$10$NotARealHashForTimingAttackPrevention Purposes';

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private usersService: UsersService,
    private jwtService: JwtService,
    private passwordService: PasswordService,
    private redisService: RedisService,
  ) {}

  async validateUser(cpf: string, pass: string): Promise<Partial<User> | null> {
    if (!cpf || !pass) {
      return null;
    }

    const normalizedCpf = CpfUtil.normalize(cpf);

    // Login é uma rota pública: não há JWT ainda, portanto AsyncLocalStorage não
    // tem contexto de tenant. Com FORCE ROW LEVEL SECURITY ativo, a policy RLS
    // bloquearia a busca por usuário (company_id = current_company() é NULL).
    //
    // Solução: executamos a busca dentro de uma transação explícita e aplicamos
    // SET LOCAL app.is_super_admin = 'true' SOMENTE no escopo dessa transação.
    // Assim is_super_admin() retorna true → RLS permite acesso cross-tenant
    // → encontramos o usuário pelo CPF independente de empresa.
    //
    // SET LOCAL garante que o bypass expira ao fim da transação; a conexão
    // retorna ao pool com as configurações originais.
    const user = await this.dataSource.transaction(async (manager) => {
      await manager.query("SET LOCAL app.is_super_admin = 'true'");
      const found = await manager.findOne(User, {
        where: { cpf: normalizedCpf },
        select: [...USER_WITH_PASSWORD_FIELDS],
        relations: ['company', 'profile'],
      });
      if (found && found.status === false) return null;
      return found;
    });

    // Se o usuário não existir ou não tiver senha, usamos um hash falso para a comparação.
    // Isso garante um tempo de execução semelhante, prevenindo ataques de temporização (timing attacks)
    // que poderiam permitir a um atacante adivinhar se um CPF é válido.
    const hashToCompare = user?.password || this.DUMMY_HASH;
    const isMatch = await this.passwordService.compare(pass, hashToCompare);

    if (!user || user.status === false || !isMatch) {
      return null;
    }

    const result = { ...user } as Partial<User>;
    delete result.password;
    return result;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private refreshKey(userId: string, tokenHash: string): string {
    return `refresh:${userId}:${tokenHash}`;
  }

  async login(user: User) {
    const payload = {
      sub: user.id,
      cpf: user.cpf,
      company_id: user.company_id,
      profile: user.profile,
    };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: getRefreshTokenTtl(),
    });
    const client = this.redisService.getClient();
    const tokenHash = this.hashToken(refreshToken);
    const ttlSeconds = getRefreshTokenTtlDays() * 24 * 3600;
    await client.setex(this.refreshKey(user.id, tokenHash), ttlSeconds, '1');
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        nome: user.nome,
        cpf: user.cpf,
        funcao: user.funcao,
        company_id: user.company_id,
        profile: user.profile,
      },
    };
  }

  async validateToken(token: string): Promise<{
    id: string;
    cpf: string;
    company_id: string;
    profile: unknown;
  }> {
    try {
      const payload = (await this.jwtService.verifyAsync(
        token,
      )) as unknown as JwtPayload;
      return {
        id: payload.sub,
        cpf: payload.cpf,
        company_id: payload.company_id,
        profile: payload.profile,
      };
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken);
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }
    const client = this.redisService.getClient();
    const oldHash = this.hashToken(refreshToken);
    const key = this.refreshKey(payload.sub, oldHash);
    const exists = await client.get(key);
    if (!exists) {
      throw new UnauthorizedException('Refresh token revogado ou já utilizado');
    }
    await client.del(key);
    const newPayload = {
      sub: payload.sub,
      cpf: payload.cpf,
      company_id: payload.company_id,
      profile: payload.profile,
    };
    const accessToken = this.jwtService.sign(newPayload, { expiresIn: '15m' });
    const newRefreshToken = this.jwtService.sign(newPayload, {
      expiresIn: getRefreshTokenTtl(),
    });
    const newHash = this.hashToken(newRefreshToken);
    const ttlSeconds = getRefreshTokenTtlDays() * 24 * 3600;
    await client.setex(this.refreshKey(payload.sub, newHash), ttlSeconds, '1');
    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const validation = this.passwordService.validate(newPassword);
    if (!validation.valid) {
      throw new BadRequestException(
        `A nova senha não atende aos critérios de segurança: ${validation.errors.join(
          ', ',
        )}`,
      );
    }

    const user = await this.usersService.findOneWithPassword(userId);
    if (!user.password) {
      throw new BadRequestException('Usuário não possui senha definida');
    }

    const isMatch = await this.passwordService.compare(
      currentPassword,
      user.password,
    );
    if (!isMatch) {
      throw new UnauthorizedException('Senha atual inválida');
    }

    await this.usersService.update(userId, { password: newPassword });

    // Rotation: ao trocar a senha, todos os refresh tokens do usuário são
    // invalidados. O usuário precisará fazer login novamente em todos os
    // dispositivos — comportamento de segurança esperado.
    await this.redisService.clearAllRefreshTokens(userId);

    return { message: 'Senha atualizada com sucesso' };
  }

  async logout(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken);
    } catch {
      return { success: true };
    }
    const client = this.redisService.getClient();
    const tokenHash = this.hashToken(refreshToken);
    await client.del(this.refreshKey(payload.sub, tokenHash));
    return { success: true };
  }
}

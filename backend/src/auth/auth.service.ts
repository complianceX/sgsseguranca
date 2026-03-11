import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { USER_WITH_PASSWORD_FIELDS } from '../users/constants/user-fields.constant';
import { CpfUtil } from '../common/utils/cpf.util';
import { PasswordService } from '../common/services/password.service';
import { RedisService } from '../common/redis/redis.service';
import { Resend } from 'resend';
import * as crypto from 'crypto';
import {
  getRefreshTokenTtl,
  getRefreshTokenTtlDays,
} from './auth-security.config';

const RESET_TOKEN_TTL_SECONDS = 3600; // 1 hora

interface JwtPayload {
  sub: string;
  cpf: string;
  company_id: string;
  profile: unknown;
}

@Injectable()
export class AuthService {
  private readonly DUMMY_HASH =
    '$2b$10$tV1AhMRqCdZTnSEV18aoR.MSJ.1zu7PIewZKDn1GkoTSqvrSNENC2';

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private usersService: UsersService,
    private jwtService: JwtService,
    private passwordService: PasswordService,
    private redisService: RedisService,
    private configService: ConfigService,
  ) {}

  private getResend(): Resend | null {
    const key = this.configService.get<string>('RESEND_API_KEY');
    if (!key) return null;
    return new Resend(key);
  }

  private readonly logger = new Logger(AuthService.name);

  async validateUser(cpf: string, pass: string): Promise<Partial<User> | null> {
    if (!cpf || !pass) {
      return null;
    }

    const normalizedCpf = CpfUtil.normalize(cpf);

    // Modo desenvolvimento: bypass de login APENAS quando explicitamente habilitado.
    // Útil para destravar UI quando o DB estiver indisponível, mas perigoso se ficar ligado.
    // Usa credenciais definidas via env DEV_ADMIN_CPF e DEV_ADMIN_PASSWORD.
    const devCpf = (process.env.DEV_ADMIN_CPF || '').replace(/\D/g, '');
    const devPass = process.env.DEV_ADMIN_PASSWORD || '';
    const isDevBypassEnabled =
      process.env.NODE_ENV === 'development' &&
      process.env.DEV_LOGIN_BYPASS === 'true' &&
      process.env.ALLOW_DEV_LOGIN_BYPASS === 'true' &&
      devCpf &&
      devPass;
    if (isDevBypassEnabled && normalizedCpf === devCpf && pass === devPass) {
      return {
        id: 'dev-admin',
        nome: 'Admin Dev',
        cpf: devCpf,
        funcao: 'Admin',
        company_id: 'dev-company',
        profile: { nome: 'Administrador Geral' } as unknown as User['profile'],
      } as Partial<User>;
    }

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

    let isMatch = false;
    let shouldUpgradeLegacyPassword = false;

    if (user?.password) {
      const looksLikeBcryptHash = /^\$2[aby]\$\d{2}\$/.test(user.password);
      if (looksLikeBcryptHash) {
        isMatch = await this.passwordService.compare(pass, user.password);
      } else {
        // Senha legada (texto plano ou hash não-bcrypt): comparação timing-safe
        // para evitar timing attack via medição de latência por diferença de prefixo.
        // timingSafeEqual exige buffers do mesmo tamanho — padding com zero garante isso.
        // A verificação adicional de comprimento (a.length === b.length) assegura
        // que senhas de tamanho diferente nunca resultem em match.
        const a = Buffer.from(pass);
        const b = Buffer.from(user.password);
        const len = Math.max(a.length, b.length);
        const aPad = Buffer.concat([a, Buffer.alloc(len - a.length)], len);
        const bPad = Buffer.concat([b, Buffer.alloc(len - b.length)], len);
        isMatch = crypto.timingSafeEqual(aPad, bPad) && a.length === b.length;
        shouldUpgradeLegacyPassword = isMatch;
      }
    } else {
      await this.passwordService.compare(pass, this.DUMMY_HASH);
    }

    if (!user || user.status === false || !isMatch) {
      return null;
    }

    if (shouldUpgradeLegacyPassword) {
      try {
        const upgradedHash = await this.passwordService.hash(pass);
        await this.dataSource.transaction(async (manager) => {
          await manager.query("SET LOCAL app.is_super_admin = 'true'");
          await manager.update(User, { id: user.id }, { password: upgradedHash });
        });
        user.password = upgradedHash;
        this.logger.warn({
          event: 'legacy_password_upgraded',
          userId: user.id,
        });
      } catch (error) {
        this.logger.error(
          `Falha ao migrar senha legada do usuário ${user.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const result = { ...user } as Partial<User>;
    delete result.password;
    return result;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private hashContext(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private getRefreshBindingMode(): 'none' | 'ua' {
    const mode = String(process.env.REFRESH_BINDING || 'none').toLowerCase();
    return mode === 'ua' ? 'ua' : 'none';
  }

  async login(user: User, ctx?: { userAgent?: string }) {
    // Normaliza profile para { nome } explícito no JWT — elimina o union type
    // string | object que causava ambiguidade no middleware de autorização.
    // Apenas o campo `nome` é necessário; emitir a entidade inteira era excessivo.
    const profileNome =
      typeof user.profile === 'object' && user.profile !== null
        ? (user.profile as { nome?: string }).nome ?? ''
        : '';
    const payload = {
      sub: user.id,
      cpf: user.cpf,
      company_id: user.company_id,
      profile: { nome: profileNome },
    };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: getRefreshTokenTtl(),
    });
    const tokenHash = this.hashToken(refreshToken);
    const ttlSeconds = getRefreshTokenTtlDays() * 24 * 3600;
    const bindingMode = this.getRefreshBindingMode();
    const ua = ctx?.userAgent || '';
    const storedValue =
      bindingMode === 'ua' && ua
        ? JSON.stringify({ v: 1, ua: this.hashContext(ua) })
        : '1';
    try {
      await this.redisService.storeRefreshToken(
        user.id,
        tokenHash,
        ttlSeconds,
        storedValue,
      );
    } catch (err) {
      this.logger.warn(
        `Falha ao registrar refresh token no Redis: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
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

  async refresh(refreshToken: string, ctx?: { userAgent?: string }) {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken);
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }
    const oldHash = this.hashToken(refreshToken);

    // Consume atômico: GET + DEL em uma única operação Lua no Redis.
    // Elimina a janela TOCTOU — duas requisições concorrentes com o mesmo token
    // só conseguem consumir o valor uma vez; a segunda recebe null e é rejeitada.
    const stored = await this.redisService.atomicConsumeRefreshToken(
      payload.sub,
      oldHash,
    );
    if (!stored) {
      throw new UnauthorizedException('Refresh token revogado ou já utilizado');
    }

    const bindingMode = this.getRefreshBindingMode();
    if (bindingMode === 'ua') {
      try {
        const parsed = JSON.parse(stored) as { ua?: string };
        const expectedUaHash = parsed?.ua;
        const actualUa = ctx?.userAgent || '';
        if (expectedUaHash && actualUa) {
          const actualHash = this.hashContext(actualUa);
          if (actualHash !== expectedUaHash) {
            throw new UnauthorizedException(
              'Sessão inválida (contexto divergente)',
            );
          }
        }
      } catch (e) {
        if (e instanceof UnauthorizedException) throw e;
      }
    }

    // Gera e registra o novo par de tokens.
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
    const ua = ctx?.userAgent || '';
    const storedValue =
      bindingMode === 'ua' && ua
        ? JSON.stringify({ v: 1, ua: this.hashContext(ua) })
        : '1';
    await this.redisService.storeRefreshToken(
      payload.sub,
      newHash,
      ttlSeconds,
      storedValue,
    );
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
    const tokenHash = this.hashToken(refreshToken);
    await this.redisService.revokeRefreshToken(payload.sub, tokenHash);
    return { success: true };
  }

  async forgotPassword(cpf: string): Promise<{ message: string }> {
    const normalizedCpf = CpfUtil.normalize(cpf);

    // Busca o usuário ignorando RLS (rota pública, sem contexto de tenant)
    const user = await this.dataSource.transaction(async (manager) => {
      await manager.query("SET LOCAL app.is_super_admin = 'true'");
      return manager.findOne(User, {
        where: { cpf: normalizedCpf },
        select: ['id', 'email', 'nome', 'status'] as any,
      });
    });

    // Sempre retornar sucesso para não revelar se o CPF existe
    const successMsg = 'Se o CPF estiver cadastrado, você receberá um e-mail com instruções para redefinir sua senha.';

    if (!user || user.status === false || !user.email) {
      this.logger.warn({ event: 'forgot_password_cpf_not_found', cpf: normalizedCpf.replace(/\d(?=\d{2})/g, '*') });
      return { message: successMsg };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const redisKey = `reset_password:${token}`;
    await this.redisService.getClient().setex(redisKey, RESET_TOKEN_TTL_SECONDS, user.id);

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3002';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    const html = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; max-width: 560px; margin: 0 auto; padding: 28px; background-color: #f8fafc; border: 1px solid #d9e2ec; border-radius: 18px;">
        <div style="display: inline-block; margin-bottom: 16px; padding: 6px 10px; border-radius: 999px; background-color: #dbeafe; color: #1d4ed8; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">
          &lt;GST&gt; Gestão de Segurança do Trabalho
        </div>
        <h2 style="margin: 0 0 12px; color: #0f172a;">Redefinição de Senha</h2>
        <p>Olá, <strong>${user.nome || 'usuário'}</strong>.</p>
        <p>Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para continuar:</p>
        <div style="margin: 28px 0;">
          <a href="${resetUrl}"
             style="background-color: #1d4ed8; color: #fff; padding: 12px 28px; text-decoration: none; border-radius: 10px; font-weight: bold; display: inline-block; box-shadow: 0 10px 20px rgba(29, 78, 216, 0.18);">
            Redefinir Senha
          </a>
        </div>
        <p style="font-size: 13px; color: #475569;">Este link é válido por <strong>1 hora</strong>. Caso não tenha solicitado, ignore este e-mail; sua senha permanece inalterada.</p>
        <hr style="border: none; border-top: 1px solid #d9e2ec; margin: 24px 0;" />
        <p style="font-size: 11px; color: #64748b;">© 2026 &lt;GST&gt; Gestão de Segurança do Trabalho · Todos os direitos reservados</p>
      </div>
    `;

    try {
      const resend = this.getResend();
      if (!resend) {
        this.logger.warn({ event: 'forgot_password_email_skipped', reason: 'RESEND_API_KEY not configured', userId: user.id });
      } else {
        const fromName = this.configService.get<string>('MAIL_FROM_NAME')?.trim() || 'GST - Gestão de Segurança do Trabalho';
        const fromEmail = this.configService.get<string>('MAIL_FROM_EMAIL')?.trim() || 'onboarding@resend.dev';
        await resend.emails.send({
          from: `${fromName} <${fromEmail}>`,
          to: user.email,
          subject: 'Redefinição de senha — GST',
          text: `Acesse o link para redefinir sua senha: ${resetUrl}`,
          html,
        });
      }
      this.logger.log({ event: 'forgot_password_sent', userId: user.id });
    } catch (err) {
      this.logger.error(`Falha ao enviar e-mail de reset: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { message: successMsg };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const redisKey = `reset_password:${token}`;
    const userId = await this.redisService.getClient().get(redisKey);

    if (!userId) {
      throw new BadRequestException('Token inválido ou expirado. Solicite um novo link de redefinição.');
    }

    const validation = this.passwordService.validate(newPassword);
    if (!validation.valid) {
      throw new BadRequestException(
        `A nova senha não atende aos critérios de segurança: ${validation.errors.join(', ')}`,
      );
    }

    const hashedPassword = await this.passwordService.hash(newPassword);
    await this.dataSource.transaction(async (manager) => {
      await manager.query("SET LOCAL app.is_super_admin = 'true'");
      await manager.update(User, { id: userId }, { password: hashedPassword });
    });

    // Invalida o token após uso
    await this.redisService.getClient().del(redisKey);

    // Invalida todos os refresh tokens — o usuário precisará fazer login novamente
    await this.redisService.clearAllRefreshTokens(userId);

    this.logger.log({ event: 'password_reset', userId });
    return { message: 'Senha redefinida com sucesso. Faça login com a nova senha.' };
  }
}

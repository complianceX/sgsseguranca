import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, MoreThan, Repository } from 'typeorm';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { CpfUtil } from '../common/utils/cpf.util';
import { PasswordService } from '../common/services/password.service';
import { AuthRedisService } from '../common/redis/redis.service';
import { TokenRevocationService } from './token-revocation.service';
import { MailService } from '../mail/mail.service';
import * as crypto from 'crypto';
import { UserSession } from './entities/user-session.entity';
import { SecurityAuditService } from '../common/security/security-audit.service';
import {
  getRefreshTokenSecret,
  getAccessTokenTtl,
  isInfiniteTtl,
  getRefreshTokenTtl,
  getRefreshTokenTtlDays,
  getMaxActiveSessionsPerUser,
} from './auth-security.config';

const RESET_TOKEN_TTL_SECONDS = 3600; // 1 hora

// Tracer de módulo — leve (apenas referência ao SDK, zero overhead se OTel desabilitado).
const authTracer = trace.getTracer('auth-service');

interface JwtPayload {
  sub: string;
  cpf: string;
  company_id: string;
  site_id?: string | null;
  profile: unknown;
  auth_uid?: string;
  app_user_id?: string;
  jti?: string;
  exp?: number;
}

type SupabaseEncryptedPasswordRow = {
  encrypted_password?: unknown;
};

type AuthLoginUserRow = {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  funcao: string | null;
  password?: string | null;
  auth_user_id?: string | null;
  company_id: string;
  site_id?: string | null;
  profile_id: string;
  status: boolean;
  profile_nome?: string | null;
};

@Injectable()
export class AuthService {
  // DUMMY_HASH: usado quando o usuário não é encontrado no banco para evitar user
  // enumeration via timing attack. Mantido em bcrypt durante a migração gradual para
  // argon2id — passwordService.verify() roteia corretamente pelo prefixo.
  // TODO: após confirmar que todos os hashes no banco são argon2id, gerar novo
  //       DUMMY_HASH em argon2id para alinhar o tempo de resposta com o caminho feliz.
  private readonly DUMMY_HASH =
    '$2b$10$tV1AhMRqCdZTnSEV18aoR.MSJ.1zu7PIewZKDn1GkoTSqvrSNENC2';

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(UserSession)
    private readonly userSessionRepository: Repository<UserSession>,
    private usersService: UsersService,
    private jwtService: JwtService,
    private passwordService: PasswordService,
    private redisService: AuthRedisService,
    private configService: ConfigService,
    private tokenRevocationService: TokenRevocationService,
    private readonly securityAudit: SecurityAuditService,
    @Inject(forwardRef(() => MailService))
    private readonly mailService: MailService,
  ) {}

  private resolveFromAddress() {
    const fromName =
      this.configService.get<string>('MAIL_FROM_NAME')?.trim() ||
      'SGS - Sistema de Gestão de Segurança';
    const fromEmail =
      this.configService.get<string>('MAIL_FROM_EMAIL')?.trim() ||
      'onboarding@resend.dev';
    return { fromName, fromEmail };
  }

  private resolveReplyToAddress() {
    const { fromName, fromEmail } = this.resolveFromAddress();
    const replyToEmail =
      this.configService.get<string>('MAIL_REPLY_TO_EMAIL')?.trim() ||
      fromEmail;
    const replyToName =
      this.configService.get<string>('MAIL_REPLY_TO_NAME')?.trim() || fromName;

    return { replyToName, replyToEmail };
  }

  private buildOfficialFooter(channelLabel = 'Comunicação oficial') {
    const { fromName } = this.resolveFromAddress();
    const { replyToEmail } = this.resolveReplyToAddress();
    return `${fromName} · ${channelLabel} · Respostas para ${replyToEmail}`;
  }

  private resolvePasswordResetBaseUrl(): string {
    const explicitApiUrl = this.configService
      .get<string>('API_PUBLIC_URL')
      ?.trim();
    if (explicitApiUrl) {
      return explicitApiUrl.replace(/\/$/, '');
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL')?.trim();
    if (frontendUrl) {
      try {
        const parsed = new URL(frontendUrl);
        parsed.hostname = parsed.hostname.replace(/^app\./i, 'api.');
        return parsed.toString().replace(/\/$/, '');
      } catch {
        return frontendUrl.replace(/\/$/, '');
      }
    }

    return 'http://localhost:3001';
  }

  private readonly logger = new Logger(AuthService.name);

  isLegacyPasswordAuthEnabled(): boolean {
    const configured = this.configService.get<string | boolean>(
      'LEGACY_PASSWORD_AUTH_ENABLED',
    );
    const raw =
      configured === undefined || configured === null
        ? ''
        : String(configured).trim().toLowerCase();

    if (!raw) {
      return false;
    }

    return !['false', '0', 'no'].includes(raw);
  }

  assertLegacyPasswordAuthEnabled(
    flow: 'login' | 'change-password' | 'confirm-password',
  ): void {
    if (this.isLegacyPasswordAuthEnabled()) {
      return;
    }

    const messages: Record<typeof flow, string> = {
      login:
        'Login por senha legado desativado. Use o fluxo de autenticação do Supabase Auth.',
      'change-password':
        'Troca de senha local desativada. Use o fluxo de redefinição/autenticação do Supabase Auth.',
      'confirm-password':
        'Confirmação por senha local desativada. Use um fluxo de reautenticação baseado no Supabase Auth.',
    };

    throw new UnauthorizedException(messages[flow]);
  }

  private isSupabasePasswordSyncOnLocalLoginEnabled(): boolean {
    const configured = this.configService.get<string | boolean>(
      'SUPABASE_PASSWORD_SYNC_ON_LOCAL_LOGIN',
    );
    const raw =
      configured === undefined || configured === null
        ? ''
        : String(configured).trim().toLowerCase();

    if (!raw) {
      return true;
    }

    return !['false', '0', 'no'].includes(raw);
  }

  private scheduleSupabasePasswordSyncAfterLocalLogin(
    userId: string,
    password: string,
  ): void {
    if (!this.isSupabasePasswordSyncOnLocalLoginEnabled()) {
      return;
    }

    setImmediate(() => {
      void this.usersService
        .syncSupabaseAuthByUserId(userId, { password })
        .then((authUserId) => {
          if (!authUserId) {
            return;
          }

          this.logger.log({
            event: 'supabase_auth_password_synced_after_local_login',
            userId,
            authUserId,
          });
        })
        .catch((error: unknown) => {
          this.logger.warn({
            event: 'supabase_auth_password_sync_failed_after_local_login',
            userId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    });
  }

  private async loadSupabaseEncryptedPassword(params: {
    authUserId?: string | null;
    email?: string | null;
  }): Promise<string | null> {
    const authUserId =
      typeof params.authUserId === 'string' ? params.authUserId.trim() : '';
    const email = typeof params.email === 'string' ? params.email.trim() : '';

    if (!authUserId && !email) {
      return null;
    }

    const result = (await this.dataSource.query(
      `
        SELECT encrypted_password
        FROM auth.users
        WHERE ($1::uuid IS NOT NULL AND id = $1::uuid)
           OR ($2::text <> '' AND lower(email) = lower($2))
        ORDER BY CASE WHEN ($1::uuid IS NOT NULL AND id = $1::uuid) THEN 0 ELSE 1 END
        LIMIT 1
      `,
      [authUserId || null, email || ''],
    )) as unknown;

    if (!Array.isArray(result) || result.length === 0) {
      return null;
    }

    const row = result[0] as SupabaseEncryptedPasswordRow | undefined;
    return typeof row?.encrypted_password === 'string'
      ? row.encrypted_password
      : null;
  }

  private async loadLoginUserByCpf(
    normalizedCpf: string,
  ): Promise<AuthLoginUserRow | null> {
    const rows = (await this.dataSource.query(
      `
        WITH _ctx AS (
          SELECT set_config('app.is_super_admin', 'true', true)
        )
        SELECT
          u.id,
          u.nome,
          u.cpf,
          u.email,
          u.funcao,
          u.password,
          u.auth_user_id,
          u.company_id,
          u.site_id,
          u.profile_id,
          u.status,
          p.nome AS profile_nome
        FROM _ctx, users u
        LEFT JOIN profiles p
          ON p.id = u.profile_id
        WHERE u.cpf = $1
          AND u.deleted_at IS NULL
        LIMIT 1
      `,
      [normalizedCpf],
    )) as unknown;

    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    return rows[0] as AuthLoginUserRow;
  }

  private async verifyPasswordAgainstStoredHash(
    password: string,
    storedHash: string,
  ): Promise<{ isMatch: boolean; needsRehash: boolean }> {
    const isKnownHash =
      this.passwordService.isLegacyHash(storedHash) ||
      storedHash.startsWith('$argon2');

    if (isKnownHash) {
      const algorithm = this.passwordService.isLegacyHash(storedHash)
        ? 'bcrypt'
        : 'argon2id';

      const verifySpan = authTracer.startSpan('auth.password.verify');
      verifySpan.setAttribute('hash.algorithm', algorithm);

      let isMatch = false;
      try {
        isMatch = await this.passwordService.verify(password, storedHash);
      } finally {
        verifySpan.setAttribute('auth.match', isMatch);
        verifySpan.end();
      }

      return {
        isMatch,
        needsRehash: isMatch && algorithm === 'bcrypt',
      };
    }

    // Suporte temporário a senhas em texto plano (plain text) — legado.
    // Se o valor no banco não é um hash conhecido, tratamos como texto plano.
    // Se bater, needsRehash: true garante migração automática para Argon2.
    const a = Buffer.from(password);
    const b = Buffer.from(storedHash);
    const len = Math.max(a.length, b.length);
    const aPad = Buffer.concat([a, Buffer.alloc(len - a.length)], len);
    const bPad = Buffer.concat([b, Buffer.alloc(len - b.length)], len);
    const isMatch = crypto.timingSafeEqual(aPad, bPad) && a.length === b.length;

    return {
      isMatch,
      needsRehash: isMatch,
    };
  }

  private async verifyPasswordAgainstSupabaseAuth(
    user: Pick<User, 'id'> & {
      auth_user_id?: string | null;
      email?: string | null;
    },
    password: string,
  ): Promise<boolean> {
    const encryptedPassword = await this.loadSupabaseEncryptedPassword({
      authUserId: user.auth_user_id,
      email: user.email,
    });

    if (!encryptedPassword) {
      return false;
    }

    const result = await this.verifyPasswordAgainstStoredHash(
      password,
      encryptedPassword,
    );

    return result.isMatch;
  }

  async verifyUserPassword(userId: string, password: string): Promise<boolean> {
    const user = await this.usersService.findOneWithPassword(userId);
    if (!user) {
      return false;
    }

    if (this.isLegacyPasswordAuthEnabled() && user.password) {
      const local = await this.verifyPasswordAgainstStoredHash(
        password,
        user.password,
      );
      if (local.isMatch) {
        if (local.needsRehash) {
          const newHash = await this.passwordService.hash(password);
          await this.dataSource.transaction(async (manager) => {
            await manager.query("SET LOCAL app.is_super_admin = 'true'");
            await manager.update(User, { id: userId }, { password: newHash });
          });
        }
        return true;
      }
    }

    return this.verifyPasswordAgainstSupabaseAuth(user, password);
  }

  async validateUser(cpf: string, pass: string): Promise<Partial<User> | null> {
    if (!cpf || !pass) {
      return null;
    }

    return authTracer.startActiveSpan('auth.validateUser', async (span) => {
      try {
        const normalizedCpf = CpfUtil.normalize(cpf);

        // Modo desenvolvimento: bypass de login APENAS quando explicitamente habilitado.
        const devCpf = (process.env.DEV_ADMIN_CPF || '').replace(/\D/g, '');
        const devPass = process.env.DEV_ADMIN_PASSWORD || '';
        const isDevBypassEnabled =
          process.env.NODE_ENV === 'development' &&
          process.env.DEV_LOGIN_BYPASS === 'true' &&
          process.env.ALLOW_DEV_LOGIN_BYPASS === 'true' &&
          devCpf &&
          devPass;
        if (
          isDevBypassEnabled &&
          normalizedCpf === devCpf &&
          pass === devPass
        ) {
          span.setAttribute('auth.dev_bypass', true);
          span.setAttribute('auth.success', true);
          return {
            id: 'dev-admin',
            nome: 'Admin Dev',
            cpf: devCpf,
            funcao: 'Admin',
            company_id: 'dev-company',
            profile: {
              nome: 'Administrador Geral',
            } as unknown as User['profile'],
          } as Partial<User>;
        }

        const dbSpan = authTracer.startSpan('auth.db.findUser');
        let user: AuthLoginUserRow | null = null;
        try {
          user = await this.loadLoginUserByCpf(normalizedCpf);
          dbSpan.setAttribute('db.user_found', user !== null);
        } finally {
          dbSpan.end();
        }

        let isMatch = false;
        let needsRehash = false;
        let authenticatedVia: 'local' | 'supabase' | 'none' = 'none';

        if (user) {
          const legacyEnabled = this.isLegacyPasswordAuthEnabled();

          if (legacyEnabled && user.password) {
            const localVerification =
              await this.verifyPasswordAgainstStoredHash(pass, user.password);
            isMatch = localVerification.isMatch;
            needsRehash = localVerification.needsRehash;
            authenticatedVia = isMatch ? 'local' : 'none';
          }

          if (!isMatch) {
            const supabaseMatch = await this.verifyPasswordAgainstSupabaseAuth(
              user,
              pass,
            );
            if (supabaseMatch) {
              isMatch = true;
              needsRehash = false;
              authenticatedVia = 'supabase';
            }
          }
        } else {
          // Usuário não encontrado: verify dummy para evitar user enumeration por timing.
          await this.passwordService.verify(pass, this.DUMMY_HASH);
        }

        span.setAttribute('auth.success', isMatch && !!user);
        span.setAttribute('auth.needs_rehash', needsRehash);
        span.setAttribute('auth.source', authenticatedVia);

        if (!user || user.status === false || !isMatch) {
          return null;
        }

        // Rehash fire-and-forget: migra bcrypt/plain-text → argon2id de forma transparente.
        // NÃO bloqueia a resposta — token emitido imediatamente (TAREFA 3).
        if (needsRehash && user.id) {
          const userId = user.id;
          setImmediate(() => {
            void this.passwordService
              .hash(pass)
              .then(async (newHash) => {
                await this.dataSource.transaction(async (manager) => {
                  await manager.query("SET LOCAL app.is_super_admin = 'true'");
                  await manager.update(
                    User,
                    { id: userId },
                    { password: newHash },
                  );
                });
                this.logger.warn({
                  event: 'password_rehashed_to_argon2id',
                  userId,
                });
              })
              .catch((err: unknown) => {
                this.logger.error(
                  `Falha ao migrar hash de senha para argon2id (userId=${userId}): ${
                    err instanceof Error ? err.message : String(err)
                  }`,
                );
              });
          });
        }

        if (user.id && authenticatedVia === 'local') {
          this.scheduleSupabasePasswordSyncAfterLocalLogin(user.id, pass);
        }

        const { profile_nome: _profileName, ...userWithoutProfileName } = user;
        const result = {
          ...userWithoutProfileName,
          profile: user.profile_nome
            ? ({
                id: user.profile_id,
                nome: user.profile_nome,
              } as User['profile'])
            : undefined,
        } as Partial<User>;
        delete result.password;
        return result;
      } catch (err) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      } finally {
        span.end();
      }
    });
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private hashContext(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private resolveRefreshExpiryDate(): Date {
    return new Date(
      Date.now() + getRefreshTokenTtlDays() * 24 * 60 * 60 * 1000,
    );
  }

  private normalizeSessionDevice(userAgent?: string): string | null {
    const value = String(userAgent || '').trim();
    return value ? value.slice(0, 255) : null;
  }

  private normalizeSessionIp(ip?: string): string {
    const value = String(ip || '').trim();
    return value || 'unknown';
  }

  private normalizeSessionCompanyId(companyId?: string | null): string {
    const value = String(companyId || '').trim();
    if (!value) {
      throw new UnauthorizedException(
        'Usuário sem empresa vinculada para criar sessão.',
      );
    }
    return value;
  }

  private async persistNewSession(params: {
    userId: string;
    companyId: string;
    tokenHash: string;
    userAgent?: string;
    ip?: string;
  }): Promise<void> {
    await this.userSessionRepository.insert({
      user_id: params.userId,
      company_id: params.companyId,
      ip: this.normalizeSessionIp(params.ip),
      device: this.normalizeSessionDevice(params.userAgent),
      token_hash: params.tokenHash,
      is_active: true,
      expires_at: this.resolveRefreshExpiryDate(),
      revoked_at: null,
    });
  }

  private async rotatePersistedSession(params: {
    userId: string;
    companyId: string;
    previousTokenHash: string;
    nextTokenHash: string;
    userAgent?: string;
    ip?: string;
    insertIfMissing?: boolean;
  }): Promise<void> {
    const updateResult = await this.userSessionRepository.update(
      {
        user_id: params.userId,
        token_hash: params.previousTokenHash,
        is_active: true,
      },
      {
        token_hash: params.nextTokenHash,
        last_active: new Date(),
        expires_at: this.resolveRefreshExpiryDate(),
        ip: this.normalizeSessionIp(params.ip),
        device: this.normalizeSessionDevice(params.userAgent),
        revoked_at: null,
        is_active: true,
      },
    );

    if (!updateResult.affected && params.insertIfMissing !== false) {
      await this.persistNewSession({
        userId: params.userId,
        companyId: params.companyId,
        tokenHash: params.nextTokenHash,
        userAgent: params.userAgent,
        ip: params.ip,
      });
    }
  }

  private async findActivePersistedSession(
    userId: string,
    tokenHash: string,
  ): Promise<UserSession | null> {
    return this.userSessionRepository.findOne({
      where: {
        user_id: userId,
        token_hash: tokenHash,
        is_active: true,
        expires_at: MoreThan(new Date()),
      },
    });
  }

  private async revokePersistedSessions(
    userId: string,
    tokenHashes: string[],
  ): Promise<void> {
    if (!tokenHashes.length) {
      return;
    }

    await this.userSessionRepository.update(
      {
        user_id: userId,
        token_hash: In(tokenHashes),
        is_active: true,
      },
      {
        is_active: false,
        revoked_at: new Date(),
      },
    );
  }

  private async revokePersistedSession(
    userId: string,
    tokenHash: string,
  ): Promise<void> {
    await this.userSessionRepository.update(
      {
        user_id: userId,
        token_hash: tokenHash,
        is_active: true,
      },
      {
        is_active: false,
        revoked_at: new Date(),
      },
    );
  }

  private getRefreshBindingMode(): 'none' | 'ua' {
    const mode = String(process.env.REFRESH_BINDING || 'none').toLowerCase();
    return mode === 'ua' ? 'ua' : 'none';
  }

  private buildGraphiteEmailHtml(options: {
    eyebrow: string;
    title: string;
    paragraphs: string[];
    cta?: {
      label: string;
      href: string;
    };
    note?: string;
    footer?: string;
    tone?: 'neutral' | 'warning';
  }) {
    const tone = options.tone ?? 'neutral';
    const eyebrowStyles =
      tone === 'warning'
        ? 'display:inline-block;margin-bottom:16px;padding:6px 10px;border-radius:999px;background-color:#f4ede5;border:1px solid #dfd4c8;color:#9a5a00;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;'
        : 'display:inline-block;margin-bottom:16px;padding:6px 10px;border-radius:999px;background-color:#ece8e3;border:1px solid #d8d2cb;color:#3e3935;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;';
    const shellStyle =
      'font-family: Arial, sans-serif;color:#25221f;max-width:560px;margin:0 auto;padding:28px;background-color:#f6f5f3;border:1px solid #b7aea5;border-radius:18px;';
    const titleStyle = 'margin:0 0 12px;color:#25221f;';
    const bodyStyle = 'margin:0 0 12px;color:#5c5650;line-height:1.6;';
    const noteStyle = 'font-size:13px;color:#5c5650;line-height:1.6;';
    const footerStyle = 'font-size:11px;color:#77706a;';
    const ctaStyle =
      'background-color:#3e3935;color:#f6f5f3;padding:12px 28px;text-decoration:none;border-radius:12px;font-weight:700;display:inline-block;border:1px solid #2c2825;box-shadow:0 10px 20px rgba(44,40,37,0.14);';

    return `
      <div style="${shellStyle}">
        <div style="height:4px;margin-bottom:18px;border-radius:999px;background-color:#3e3935;"></div>
        <div style="${eyebrowStyles}">
          ${options.eyebrow}
        </div>
        <h2 style="${titleStyle}">${options.title}</h2>
        ${options.paragraphs
          .map((paragraph) => `<p style="${bodyStyle}">${paragraph}</p>`)
          .join('')}
        ${
          options.cta
            ? `<div style="margin:28px 0 22px;"><a href="${options.cta.href}" style="${ctaStyle}">${options.cta.label}</a></div>`
            : ''
        }
        ${
          options.note
            ? `<p style="${noteStyle}"><strong>Observação:</strong> ${options.note}</p>`
            : ''
        }
        <hr style="border:none;border-top:1px solid #d8d2cb;margin:24px 0;" />
        <p style="${footerStyle}">
          ${options.footer || this.buildOfficialFooter()}
        </p>
      </div>
    `;
  }

  async login(
    user: Pick<
      User,
      'id' | 'nome' | 'cpf' | 'funcao' | 'company_id' | 'site_id' | 'profile'
    > & { auth_user_id?: string | null },
    ctx?: { userAgent?: string; ip?: string },
  ) {
    const companyId = this.normalizeSessionCompanyId(user.company_id);

    // Normaliza profile para { nome } explícito no JWT — elimina o union type
    // string | object que causava ambiguidade no middleware de autorização.
    // Apenas o campo `nome` é necessário; emitir a entidade inteira era excessivo.
    const profileNome =
      typeof user.profile === 'object' && user.profile !== null
        ? ((user.profile as { nome?: string }).nome ?? '')
        : '';
    const jti = crypto.randomUUID();
    const payload = {
      sub: user.id,
      app_user_id: user.id,
      auth_uid: user.auth_user_id ?? undefined,
      cpf: user.cpf,
      company_id: companyId,
      site_id: user.site_id ?? undefined,
      profile: { nome: profileNome },
      jti,
    };
    const accessTtl = getAccessTokenTtl();
    const refreshSecret = getRefreshTokenSecret(this.configService);
    const accessToken = isInfiniteTtl(accessTtl)
      ? this.jwtService.sign(payload)
      : this.jwtService.sign(payload, { expiresIn: accessTtl });
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: getRefreshTokenTtl(),
      secret: refreshSecret,
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

      // Enforce max active sessions per user — evict oldest if exceeded
      const maxSessions = getMaxActiveSessionsPerUser();
      const evicted = await this.redisService.enforceMaxSessions(
        user.id,
        maxSessions,
      );
      if (evicted.length > 0) {
        await this.revokePersistedSessions(user.id, evicted);
        this.logger.log({
          event: 'sessions_evicted',
          userId: user.id,
          evictedCount: evicted.length,
          maxSessions,
          reason: 'max_active_sessions_exceeded',
        });
      }
      await this.persistNewSession({
        userId: user.id,
        companyId,
        tokenHash,
        userAgent: ctx?.userAgent,
        ip: ctx?.ip,
      });
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
        company_id: companyId,
        site_id: user.site_id ?? null,
        profile: user.profile,
      },
    };
  }

  async validateToken(token: string): Promise<{
    id: string;
    cpf: string;
    company_id: string;
    site_id?: string | null;
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
        site_id: payload.site_id ?? null,
        profile: payload.profile,
      };
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
  }

  async refresh(
    refreshToken: string,
    ctx?: { userAgent?: string; ip?: string },
  ) {
    let payload: JwtPayload;
    const refreshSecret = getRefreshTokenSecret(this.configService);
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }
    const oldHash = this.hashToken(refreshToken);

    // Consume atômico: GET + DEL em uma única operação Lua no Redis.
    // Elimina a janela TOCTOU — duas requisições concorrentes com o mesmo token
    // só conseguem consumir o valor uma vez; a segunda recebe null e é rejeitada.
    let stored = await this.redisService.atomicConsumeRefreshToken(
      payload.sub,
      oldHash,
    );
    let recoveredFromPersistedSession = false;
    if (!stored) {
      // Reuse detection: if this token was already consumed (rotated), someone
      // is replaying an old token. This indicates possible session hijacking.
      // Revoke ALL tokens for this user as a defensive measure.
      const wasConsumed = await this.redisService.isTokenConsumed(
        payload.sub,
        oldHash,
      );
      if (wasConsumed) {
        this.logger.error({
          event: 'refresh_token_reuse_detected',
          userId: payload.sub,
          action: 'revoking_all_sessions',
          reason: 'Possible session hijacking — rotated refresh token replayed',
        });
        await this.redisService.clearAllRefreshTokens(payload.sub);
        this.securityAudit.tokenReuseDetected(
          payload.sub,
          ctx?.ip,
          ctx?.userAgent,
        );
      }

      if (!wasConsumed) {
        const persistedSession = await this.findActivePersistedSession(
          payload.sub,
          oldHash,
        );

        if (persistedSession) {
          stored = '1';
          recoveredFromPersistedSession = true;
          this.logger.warn({
            event: 'refresh_token_recovered_from_persisted_session',
            userId: payload.sub,
            reason: 'redis_refresh_token_missing_but_db_session_active',
          });
        }
      }

      if (!stored) {
        throw new UnauthorizedException(
          'Refresh token revogado ou já utilizado',
        );
      }
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
    const companyId = this.normalizeSessionCompanyId(payload.company_id);
    const newPayload = {
      sub: payload.sub,
      app_user_id: payload.app_user_id ?? payload.sub,
      auth_uid: payload.auth_uid,
      cpf: payload.cpf,
      company_id: companyId,
      site_id: payload.site_id ?? undefined,
      profile: payload.profile,
      jti: crypto.randomUUID(),
    };
    const accessTtl = getAccessTokenTtl();
    const accessToken = isInfiniteTtl(accessTtl)
      ? this.jwtService.sign(newPayload)
      : this.jwtService.sign(newPayload, { expiresIn: accessTtl });
    const newRefreshToken = this.jwtService.sign(newPayload, {
      expiresIn: getRefreshTokenTtl(),
      secret: refreshSecret,
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
    await this.rotatePersistedSession({
      userId: payload.sub,
      companyId,
      previousTokenHash: oldHash,
      nextTokenHash: newHash,
      userAgent: ctx?.userAgent,
      ip: ctx?.ip,
      insertIfMissing: !recoveredFromPersistedSession,
    });
    this.securityAudit.tokenRefresh(payload.sub, ctx?.ip);
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

    const isMatch = await this.verifyUserPassword(userId, currentPassword);
    if (!isMatch) {
      throw new UnauthorizedException('Senha atual inválida');
    }

    if (this.isLegacyPasswordAuthEnabled()) {
      await this.usersService.update(userId, { password: newPassword });
    } else {
      const syncedAuthUserId = await this.usersService.syncSupabaseAuthByUserId(
        userId,
        { password: newPassword },
      );
      if (!syncedAuthUserId) {
        throw new BadRequestException(
          'Supabase Auth não está pronto para atualizar a senha neste ambiente.',
        );
      }

      const hashedPassword = await this.passwordService.hash(newPassword);
      await this.dataSource.transaction(async (manager) => {
        await manager.query("SET LOCAL app.is_super_admin = 'true'");
        await manager.update(
          User,
          { id: userId },
          { password: hashedPassword },
        );
      });
    }

    // Rotation: ao trocar a senha, todos os refresh tokens do usuário são
    // invalidados. O usuário precisará fazer login novamente em todos os
    // dispositivos — comportamento de segurança esperado.
    await this.redisService.clearAllRefreshTokens(userId);
    await this.userSessionRepository.update(
      { user_id: userId, is_active: true },
      { is_active: false, revoked_at: new Date() },
    );
    this.securityAudit.passwordChanged(userId);

    return { message: 'Senha atualizada com sucesso' };
  }

  async logout(refreshToken: string, accessToken?: string) {
    // 1. Revogar o refresh token no Redis.
    const refreshSecret = getRefreshTokenSecret(this.configService);
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
        {
          secret: refreshSecret,
        },
      );
      const tokenHash = this.hashToken(refreshToken);
      await this.redisService.revokeRefreshToken(payload.sub, tokenHash);
      await this.revokePersistedSession(payload.sub, tokenHash);
    } catch {
      // Refresh token inválido ou expirado — continuar para revogar o access token.
    }

    // 2. Adicionar o access token à blacklist pelo seu jti.
    // TTL = tempo restante do token, para não acumular entradas expiradas no Redis.
    if (accessToken) {
      try {
        const decoded = this.jwtService.decode<JwtPayload>(accessToken);
        if (decoded?.jti) {
          const remainingTtl = decoded.exp
            ? Math.max(0, decoded.exp - Math.floor(Date.now() / 1000))
            : 900; // fallback: 15min em segundos
          if (remainingTtl > 0) {
            await this.tokenRevocationService.revoke(decoded.jti, remainingTtl);
          }
        }
      } catch {
        // Token malformado — ignorar silenciosamente.
      }
    }

    return { success: true };
  }

  async forgotPassword(cpf: string): Promise<{ message: string }> {
    // Random delay (200-500ms) to mitigate timing-based user enumeration.
    // Applied before any logic so total response time is uniform regardless
    // of whether the CPF exists or not.
    const jitterMs = 200 + Math.floor(Math.random() * 300);
    const start = Date.now();

    const normalizedCpf = CpfUtil.normalize(cpf);

    // Busca o usuário ignorando RLS (rota pública, sem contexto de tenant)
    const user = await this.dataSource.transaction(async (manager) => {
      await manager.query("SET LOCAL app.is_super_admin = 'true'");
      return manager.findOne(User, {
        where: { cpf: normalizedCpf },
        select: ['id', 'email', 'nome', 'status'] as (keyof User)[],
      });
    });

    // Sempre retornar sucesso para não revelar se o CPF existe
    const successMsg =
      'Se o CPF estiver cadastrado, você receberá um e-mail com instruções para redefinir sua senha.';

    if (!user || user.status === false || !user.email) {
      this.logger.warn({
        event: 'forgot_password_cpf_not_found',
        cpf: normalizedCpf.replace(/\d(?=\d{2})/g, '*'),
      });
      return { message: successMsg };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const redisKey = `reset_password:${token}`;
    await this.redisService
      .getClient()
      .setex(redisKey, RESET_TOKEN_TTL_SECONDS, user.id);

    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    const apiPublicUrl = this.configService.get<string>('API_PUBLIC_URL');
    if (
      !frontendUrl &&
      !apiPublicUrl &&
      process.env.NODE_ENV === 'production'
    ) {
      this.logger.error(
        'FRONTEND_URL/API_PUBLIC_URL não configurada em produção — links de e-mail serão inválidos',
      );
      throw new Error(
        'FRONTEND_URL or API_PUBLIC_URL is required in production',
      );
    }
    const resetUrl = `${this.resolvePasswordResetBaseUrl()}/auth/reset-password/${token}`;

    const html = this.buildGraphiteEmailHtml({
      eyebrow: 'Ação necessária',
      title: 'Redefinição de senha',
      paragraphs: [
        `Olá, <strong>${user.nome || 'usuário'}</strong>.`,
        'Recebemos uma solicitação para redefinir a senha da sua conta. Use o botão abaixo para continuar.',
      ],
      cta: {
        label: 'Redefinir senha',
        href: resetUrl,
      },
      note: 'Este link é válido por 1 hora. Caso não tenha solicitado, ignore este e-mail; sua senha permanece inalterada.',
      footer: this.buildOfficialFooter('Central de suporte'),
    });

    try {
      await this.mailService.sendMailSimple(
        user.email,
        'Redefinição de senha — SGS',
        `Acesse o link para redefinir sua senha: ${resetUrl}`,
        { userId: user.id },
        undefined,
        { html, filename: 'password-reset' },
      );
      this.logger.log({ event: 'forgot_password_sent', userId: user.id });
    } catch (err) {
      this.logger.warn({
        event: 'forgot_password_email_skipped',
        reason: err instanceof Error ? err.message : String(err),
        userId: user.id,
      });
    }

    // Pad response time to the jitter target so user-exists and user-not-found
    // paths have indistinguishable latency.
    const elapsed = Date.now() - start;
    if (elapsed < jitterMs) {
      await new Promise((resolve) => setTimeout(resolve, jitterMs - elapsed));
    }

    return { message: successMsg };
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const redisKey = `reset_password:${token}`;

    // Atomic single-use: delete and return in one operation to prevent replay
    const userId = await this.redisService
      .getClient()
      .pipeline()
      .get(redisKey)
      .del(redisKey)
      .exec()
      .then((results) => (results?.[0]?.[1] as string) || null);

    if (!userId) {
      throw new BadRequestException(
        'Token inválido ou expirado. Solicite um novo link de redefinição.',
      );
    }

    const validation = this.passwordService.validate(newPassword);
    if (!validation.valid) {
      throw new BadRequestException(
        `A nova senha não atende aos critérios de segurança: ${validation.errors.join(', ')}`,
      );
    }

    if (this.isLegacyPasswordAuthEnabled()) {
      const hashedPassword = await this.passwordService.hash(newPassword);
      await this.dataSource.transaction(async (manager) => {
        await manager.query("SET LOCAL app.is_super_admin = 'true'");
        await manager.update(
          User,
          { id: userId },
          { password: hashedPassword },
        );
      });
      await this.usersService
        .syncSupabaseAuthByUserId(userId, { password: newPassword })
        .catch((error: unknown) => {
          this.logger.warn({
            event: 'supabase_auth_password_sync_failed_after_reset',
            userId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    } else {
      const syncedAuthUserId = await this.usersService.syncSupabaseAuthByUserId(
        userId,
        { password: newPassword },
      );
      if (!syncedAuthUserId) {
        throw new BadRequestException(
          'Supabase Auth não está pronto para redefinir a senha neste ambiente.',
        );
      }

      const hashedPassword = await this.passwordService.hash(newPassword);
      await this.dataSource.transaction(async (manager) => {
        await manager.query("SET LOCAL app.is_super_admin = 'true'");
        await manager.update(
          User,
          { id: userId },
          { password: hashedPassword },
        );
      });
    }

    // Token já invalidado atomicamente no início (pipeline get+del)

    // Invalida todos os refresh tokens — o usuário precisará fazer login novamente
    await this.redisService.clearAllRefreshTokens(userId);
    await this.userSessionRepository.update(
      { user_id: userId, is_active: true },
      { is_active: false, revoked_at: new Date() },
    );

    this.logger.log({ event: 'password_reset', userId });
    this.securityAudit.passwordReset(userId);
    return {
      message: 'Senha redefinida com sucesso. Faça login com a nova senha.',
    };
  }
}

import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Role } from './enums/roles.enum';

type SupabaseAdminUserResponse = {
  id?: string;
  user?: { id?: string };
};

export type EnsureSupabaseAuthUserInput = {
  appUserId?: string;
  authUserId?: string | null;
  email?: string | null;
  password?: string | null;
  companyId?: string | null;
  profileName?: string | null;
  cpf?: string | null;
  status?: boolean | null;
};

export type EnsureSupabaseAuthUserResult = {
  authUserId?: string;
  created: boolean;
  updated: boolean;
  skipped: boolean;
  reason?: string;
};

@Injectable()
export class SupabaseAuthAdminService {
  private readonly logger = new Logger(SupabaseAuthAdminService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.getSupabaseUrl() && this.getServiceRoleKey());
  }

  isSyncEnabled(): boolean {
    const raw = this.configService
      .get<string>('SUPABASE_AUTH_SYNC_ENABLED')
      ?.trim()
      .toLowerCase();

    if (raw === 'false' || raw === '0' || raw === 'no') {
      return false;
    }

    return this.isConfigured();
  }

  async ensureUser(
    input: EnsureSupabaseAuthUserInput,
  ): Promise<EnsureSupabaseAuthUserResult> {
    if (!this.isSyncEnabled()) {
      return {
        created: false,
        updated: false,
        skipped: true,
        reason: 'sync_disabled_or_unconfigured',
      };
    }

    const email = normalizeEmail(input.email);
    if (!email) {
      return {
        created: false,
        updated: false,
        skipped: true,
        reason: 'missing_email',
      };
    }

    const payload = this.buildAdminPayload({
      ...input,
      email,
    });

    const existingAuthUserId =
      input.authUserId || (await this.findAuthUserIdByEmail(email));

    if (existingAuthUserId) {
      await this.updateUser(existingAuthUserId, payload);
      return {
        authUserId: existingAuthUserId,
        created: false,
        updated: true,
        skipped: false,
      };
    }

    const created = await this.createUser(payload);
    return {
      authUserId: created,
      created: true,
      updated: false,
      skipped: false,
    };
  }

  async safeDeleteUser(userId?: string | null): Promise<void> {
    if (!this.isSyncEnabled() || !userId) {
      return;
    }

    try {
      await this.request<void>(`/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      this.logger.warn({
        event: 'supabase_auth_delete_failed',
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async findAuthUserIdByEmail(
    email: string,
  ): Promise<string | undefined> {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return undefined;
    }

    try {
      const result = await this.dataSource.query(
        `
          SELECT id
          FROM auth.users
          WHERE lower(email) = lower($1)
          LIMIT 1
        `,
        [normalizedEmail],
      );

      const row = Array.isArray(result) ? result[0] : undefined;
      return typeof row?.id === 'string' ? row.id : undefined;
    } catch (error) {
      this.logger.warn({
        event: 'supabase_auth_lookup_by_email_failed',
        email: normalizedEmail,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  private buildAdminPayload(input: EnsureSupabaseAuthUserInput & { email: string }) {
    const profileName = normalizeText(input.profileName);
    const appMetadata = stripUndefined({
      app_user_id: normalizeText(input.appUserId),
      company_id: normalizeText(input.companyId),
      profile_name: profileName,
      user_role: profileName,
      is_super_admin: profileName
        ? profileName === Role.ADMIN_GERAL
        : undefined,
    });

    const userMetadata = stripUndefined({
      cpf: normalizeText(input.cpf),
      company_id: normalizeText(input.companyId),
      profile_name: profileName,
      app_user_id: normalizeText(input.appUserId),
    });

    return stripUndefined({
      email: input.email,
      password: normalizeText(input.password),
      email_confirm: true,
      user_metadata:
        Object.keys(userMetadata).length > 0 ? userMetadata : undefined,
      app_metadata:
        Object.keys(appMetadata).length > 0 ? appMetadata : undefined,
      ban_duration: input.status === false ? '876000h' : undefined,
    });
  }

  private async createUser(payload: Record<string, unknown>): Promise<string> {
    const response = await this.request<SupabaseAdminUserResponse>(
      '/auth/v1/admin/users',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );

    const userId = response?.user?.id || response?.id;
    if (!userId) {
      throw new ConflictException(
        'Supabase Auth não retornou id do usuário provisionado.',
      );
    }

    return userId;
  }

  private async updateUser(
    userId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.request(`/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  private async request<T = unknown>(
    path: string,
    init: RequestInit,
  ): Promise<T> {
    const baseUrl = this.getSupabaseUrl();
    const serviceRoleKey = this.getServiceRoleKey();
    if (!baseUrl || !serviceRoleKey) {
      throw new Error(
        'SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios para sync com Supabase Auth.',
      );
    }

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        ...(init.headers || {}),
      },
    });

    if (!response.ok) {
      const rawBody = await response.text();
      throw new ConflictException(
        `Supabase Auth admin API falhou (${response.status}): ${rawBody.slice(0, 300)}`,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private getSupabaseUrl(): string | undefined {
    return this.configService.get<string>('SUPABASE_URL')?.trim() || undefined;
  }

  private getServiceRoleKey(): string | undefined {
    return (
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')?.trim() ||
      undefined
    );
  }
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeEmail(value: unknown): string | undefined {
  return normalizeText(value)?.toLowerCase();
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

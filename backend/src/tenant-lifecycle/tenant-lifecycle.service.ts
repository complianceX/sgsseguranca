import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import { TenantOnboardingInvite } from './entities/tenant-onboarding-invite.entity';
import { CreateOnboardingInviteDto } from './dto/create-onboarding-invite.dto';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { MailService } from '../mail/mail.service';
import { PasswordService } from '../common/services/password.service';
import { Company } from '../companies/entities/company.entity';
import { User } from '../users/entities/user.entity';
import { Site } from '../sites/entities/site.entity';
import { UserSite } from '../users/entities/user-site.entity';
import { Profile } from '../profiles/entities/profile.entity';
import { Role } from '../auth/enums/roles.enum';
import { CnpjUtil } from '../common/utils/cnpj.util';
import { CpfUtil } from '../common/utils/cpf.util';
import {
  encryptSensitiveValue,
  hashSensitiveValue,
} from '../common/security/field-encryption.util';
import {
  UserAccessStatus,
  UserIdentityType,
} from '../users/constants/user-identity.constant';

const DEFAULT_INVITE_EXPIRES_DAYS = 7;
const TRIAL_DAYS = 30;

type InvitePublicView = {
  email: string;
  intended_company_name: string | null;
  expires_at: Date;
};

@Injectable()
export class TenantLifecycleService {
  private readonly logger = new Logger(TenantLifecycleService.name);

  constructor(
    @InjectRepository(TenantOnboardingInvite)
    private readonly invitesRepository: Repository<TenantOnboardingInvite>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly passwordService: PasswordService,
  ) {}

  async createInvite(
    dto: CreateOnboardingInviteDto,
    createdByUserId?: string,
  ): Promise<{
    id: string;
    email: string;
    intended_company_name: string | null;
    expires_at: Date;
    onboarding_url: string;
  }> {
    const token = this.generateToken();
    const expiresAt = this.addDays(
      new Date(),
      dto.expiresInDays ?? DEFAULT_INVITE_EXPIRES_DAYS,
    );
    const invite = await this.invitesRepository.save(
      this.invitesRepository.create({
        token_hash: this.hashToken(token),
        email: dto.email.trim().toLowerCase(),
        intended_company_name: dto.intended_company_name?.trim() || null,
        expires_at: expiresAt,
        created_by_user_id: createdByUserId || null,
      }),
    );

    const onboardingUrl = this.buildOnboardingUrl(token);
    await this.sendInviteEmail(invite.email, onboardingUrl).catch((error) => {
      this.logger.warn({
        event: 'tenant_onboarding_invite_email_failed',
        inviteId: invite.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return {
      id: invite.id,
      email: invite.email,
      intended_company_name: invite.intended_company_name ?? null,
      expires_at: invite.expires_at,
      onboarding_url: onboardingUrl,
    };
  }

  async getInvitePublicView(token: string): Promise<InvitePublicView> {
    const invite = await this.findUsableInvite(token);
    return {
      email: invite.email,
      intended_company_name: invite.intended_company_name ?? null,
      expires_at: invite.expires_at,
    };
  }

  async completeOnboarding(
    token: string,
    dto: CompleteOnboardingDto,
  ): Promise<{
    company_id: string;
    user_id: string;
    trial_ends_at: Date;
  }> {
    const passwordValidation = this.passwordService.validate(
      dto.admin_password,
    );
    if (!passwordValidation.valid) {
      throw new BadRequestException(
        `A senha não atende aos critérios de segurança: ${passwordValidation.errors.join(', ')}`,
      );
    }

    const tokenHash = this.hashToken(token);
    const now = new Date();
    const trialEndsAt = this.addDays(now, TRIAL_DAYS);
    const normalizedCnpj = CnpjUtil.normalize(dto.cnpj);
    const normalizedCpf = CpfUtil.normalize(dto.admin_cpf);
    const adminEmail = dto.admin_email.trim().toLowerCase();
    const contactEmail = dto.email_contato.trim().toLowerCase();

    return this.dataSource.transaction(async (manager) => {
      await manager.query("SET LOCAL app.is_super_admin = 'true'");
      const invite = await manager.findOne(TenantOnboardingInvite, {
        where: {
          token_hash: tokenHash,
          used_at: IsNull(),
          revoked_at: IsNull(),
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (!invite || invite.expires_at <= now) {
        throw new NotFoundException('Convite inválido ou expirado.');
      }

      if (invite.email.toLowerCase() !== adminEmail) {
        throw new ForbiddenException(
          'O e-mail do administrador deve ser o mesmo do convite.',
        );
      }

      const existingCompany = await manager.findOne(Company, {
        where: { cnpj: normalizedCnpj },
        select: { id: true },
      });
      if (existingCompany) {
        throw new ConflictException('CNPJ já cadastrado.');
      }

      const cpfHash = hashSensitiveValue(normalizedCpf);
      const existingUser = await manager.findOne(User, {
        where: [{ cpf_hash: cpfHash }, { email: adminEmail }],
        select: { id: true },
      });
      if (existingUser) {
        throw new ConflictException('Administrador já cadastrado.');
      }

      const adminProfile = await manager.findOne(Profile, {
        where: { nome: Role.ADMIN_EMPRESA, status: true },
        select: { id: true, nome: true },
      });
      if (!adminProfile) {
        throw new BadRequestException(
          'Perfil Administrador da Empresa não encontrado.',
        );
      }

      const company = await manager.save(
        manager.create(Company, {
          razao_social: dto.razao_social.trim(),
          cnpj: normalizedCnpj,
          endereco: dto.endereco.trim(),
          responsavel: dto.responsavel.trim(),
          email_contato: contactEmail,
          status: true,
          account_status: 'trialing',
          trial_started_at: now,
          trial_ends_at: trialEndsAt,
        }),
      );

      const site = await manager.save(
        manager.create(Site, {
          company_id: company.id,
          nome: 'Geral',
          local: 'Geral',
          endereco: dto.endereco.trim(),
          status: true,
        }),
      );

      const admin = await manager.save(
        manager.create(User, {
          id: randomUUID(),
          nome: dto.admin_nome.trim(),
          cpf: null,
          cpf_hash: cpfHash,
          cpf_ciphertext: encryptSensitiveValue(normalizedCpf),
          email: adminEmail,
          password: await this.passwordService.hash(dto.admin_password),
          funcao: 'Administrador da Empresa',
          company_id: company.id,
          site_id: site.id,
          profile_id: adminProfile.id,
          identity_type: UserIdentityType.SYSTEM_USER,
          access_status: UserAccessStatus.CREDENTIALED,
          status: true,
          ai_processing_consent: false,
          module_access_keys: [],
        }),
      );

      await manager.save(
        manager.create(UserSite, {
          user_id: admin.id,
          company_id: company.id,
          site_id: site.id,
        }),
      );

      invite.used_at = now;
      invite.created_company_id = company.id;
      invite.created_user_id = admin.id;
      await manager.save(invite);

      return {
        company_id: company.id,
        user_id: admin.id,
        trial_ends_at: trialEndsAt,
      };
    });
  }

  private async findUsableInvite(
    token: string,
  ): Promise<TenantOnboardingInvite> {
    const invite = await this.invitesRepository.findOne({
      where: {
        token_hash: this.hashToken(token),
        used_at: IsNull(),
        revoked_at: IsNull(),
      },
    });
    if (!invite || invite.expires_at <= new Date()) {
      throw new NotFoundException('Convite inválido ou expirado.');
    }
    return invite;
  }

  private async sendInviteEmail(
    to: string,
    onboardingUrl: string,
  ): Promise<void> {
    const html = `
      <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5">
        <h1 style="font-size:22px;margin:0 0 12px">Convite para testar o SGS</h1>
        <p>Você recebeu um convite para cadastrar sua empresa e iniciar 30 dias de teste no SGS.</p>
        <p><a href="${this.escapeHtml(onboardingUrl)}" style="display:inline-block;background:#2f5d46;color:#fff;padding:12px 16px;border-radius:8px;text-decoration:none;font-weight:700">Cadastrar empresa</a></p>
        <p style="font-size:13px;color:#64748b">Se você não esperava este convite, ignore este e-mail.</p>
      </div>
    `;
    await this.mailService.sendMailSimple(
      to,
      'Convite para teste do SGS',
      `Acesse o link para cadastrar sua empresa: ${onboardingUrl}`,
      undefined,
      undefined,
      { html, filename: 'tenant-onboarding-invite' },
    );
  }

  private buildOnboardingUrl(token: string): string {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL')?.trim() ||
      this.configService.get<string>('APP_PUBLIC_URL')?.trim() ||
      'http://localhost:3000';
    return `${frontendUrl.replace(/\/$/, '')}/onboarding/${token}`;
  }

  private generateToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProfilesService } from '../profiles/profiles.service';
import { CompaniesService } from '../companies/companies.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { CompanyResponseDto } from '../companies/dto/company-response.dto';
import { Profile } from '../profiles/entities/profile.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { PasswordService } from '../common/services/password.service';

type InformationSchemaTableRow = {
  table_name: string;
};

const isInformationSchemaTableRow = (
  value: unknown,
): value is InformationSchemaTableRow =>
  typeof value === 'object' &&
  value !== null &&
  'table_name' in value &&
  typeof value.table_name === 'string';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private dataSource: DataSource,
    private profilesService: ProfilesService,
    private companiesService: CompaniesService,
    private usersService: UsersService,
    private tenantService: TenantService,
    private passwordService: PasswordService,
  ) {}

  onApplicationBootstrap() {
    const isTest = process.env.NODE_ENV === 'test';
    const isProduction = process.env.NODE_ENV === 'production';
    const seedOnBootstrap = process.env.SEED_ON_BOOTSTRAP === 'true';

    if (isTest && !seedOnBootstrap) {
      this.logger.log(
        'Seed automático desabilitado em ambiente de teste (NODE_ENV=test).',
      );
      return;
    }

    if (isProduction && !seedOnBootstrap) {
      this.logger.log(
        'Seed automático desabilitado em produção. Defina SEED_ON_BOOTSTRAP=true para habilitar.',
      );
      return;
    }

    // Não bloquear o bootstrap — seed roda em background (como CacheWarmingService).
    setImmediate(() => {
      void this.runSeed();
    });
  }

  private async runSeed() {
    try {
      const schemaReady = await this.ensureSeedTablesExist();
      if (!schemaReady) {
        this.logger.warn(
          'Tabelas base não encontradas (migrations pendentes). Seed ignorado neste ciclo.',
        );
        return;
      }
      await this.runAsSuperAdmin(async () => {
        await this.seedProfiles();
        await this.seedAdmin();
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Erro durante o seed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async ensureSeedTablesExist(): Promise<boolean> {
    const maxWaitMs = 60_000;
    const start = Date.now();
    while (!this.dataSource.isInitialized && Date.now() - start < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (!this.dataSource.isInitialized) {
      this.logger.warn('DataSource não inicializado após 60s. Seed adiado.');
      return false;
    }

    const requiredTables = ['profiles', 'companies', 'users'];
    const rows: unknown = await this.dataSource.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = ANY($1)
      `,
      [requiredTables],
    );

    const existing = new Set(
      Array.isArray(rows)
        ? rows.filter(isInformationSchemaTableRow).map((row) => row.table_name)
        : [],
    );
    return requiredTables.every((table) => existing.has(table));
  }

  private async seedProfiles() {
    const profiles = [
      'Administrador Geral',
      'Administrador da Empresa',
      'Técnico de Segurança do Trabalho (TST)',
      'Supervisor / Encarregado',
      'Operador / Colaborador',
      'Leitura (cliente/auditoria)',
    ];

    for (const nome of profiles) {
      try {
        const exists = await this.profilesService.findByName(nome);
        if (!exists) {
          await this.profilesService.create({
            nome,
            permissoes: {}, // To be defined later
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Erro ao semear perfil "${nome}": ${message}`,
          err instanceof Error ? err.stack : undefined,
        );
      }
    }
  }

  private async seedAdmin() {
    try {
      const configuredCpf = (process.env.DEV_ADMIN_CPF || '').replace(
        /\D/g,
        '',
      );
      const configuredPassword = process.env.DEV_ADMIN_PASSWORD || '';
      const isProduction = process.env.NODE_ENV === 'production';

      if (
        !configuredCpf ||
        configuredCpf.length !== 11 ||
        !configuredPassword
      ) {
        this.logger.warn(
          isProduction
            ? 'Seed do admin ignorado em produção: configure DEV_ADMIN_CPF (11 dígitos) e DEV_ADMIN_PASSWORD.'
            : 'Seed do admin ignorado: configure DEV_ADMIN_CPF (11 dígitos) e DEV_ADMIN_PASSWORD para criar/reconciliar o admin.',
        );
        return;
      }

      const oldCpfs = ['00000000191', '00000000000'];
      const TARGET_CPF = configuredCpf;
      const TARGET_PASSWORD = configuredPassword;
      const hashedAdminPassword =
        await this.passwordService.hash(TARGET_PASSWORD);

      // Check if any company exists
      const companies = await this.companiesService.findAll();
      let company: CompanyResponseDto;
      if (companies.length === 0) {
        company = await this.companiesService.create({
          razao_social: 'Empresa Master SST',
          cnpj: '00000000000000',
          endereco: 'Endereço Master',
          responsavel: 'Admin Geral',
        });
      } else {
        company = companies[0];
      }

      // Check if admin user exists
      const adminProfile = (await this.profilesService.findByName(
        'Administrador Geral',
      )) as Profile;

      if (!adminProfile) {
        this.logger.error(
          'Perfil "Administrador Geral" não encontrado para criar Admin.',
        );
        return;
      }

      const targetAdmin = await this.usersService.findOneByCpf(TARGET_CPF);
      const oldAdmins = (
        await Promise.all(
          oldCpfs.map((cpf) => this.usersService.findOneByCpf(cpf)),
        )
      ).filter((u): u is User => u !== null);

      if (targetAdmin) {
        this.logger.log(
          `Atualizando senha do admin existente (CPF=${TARGET_CPF})`,
        );
        await this.dataSource.transaction(async (manager) => {
          await manager.query("SET LOCAL app.is_super_admin = 'true'");
          await manager.update(
            User,
            { id: targetAdmin.id },
            {
              password: hashedAdminPassword,
              profile_id: adminProfile.id,
              company_id: targetAdmin.company_id || company.id,
              funcao: targetAdmin.funcao || 'Admin',
              status: true,
              deletedAt: null,
            },
          );
        });
        await this.tenantService.run(
          {
            companyId: targetAdmin.company_id || company.id,
            isSuperAdmin: true,
          },
          async () => {
            const reloaded = await this.usersService.findOneByCpf(TARGET_CPF);
            this.logger.log(
              `Admin padrão reconciliado (CPF=${TARGET_CPF}, hashPersistido=${Boolean(
                reloaded?.password?.startsWith('$2'),
              )})`,
            );
          },
        );
      } else if (oldAdmins.length > 0) {
        const oldAdmin = oldAdmins[0];
        this.logger.log(
          `Migrando admin de CPF antigo (${oldAdmin.cpf || 'sem-cpf'}) para novo (${TARGET_CPF})`,
        );
        await this.dataSource.transaction(async (manager) => {
          await manager.query("SET LOCAL app.is_super_admin = 'true'");
          await manager.update(
            User,
            { id: oldAdmin.id },
            {
              cpf: TARGET_CPF,
              password: hashedAdminPassword,
              profile_id: adminProfile.id,
              company_id: oldAdmin.company_id || company.id,
              funcao: oldAdmin.funcao || 'Admin',
              status: true,
              deletedAt: null,
            },
          );
        });
      } else {
        this.logger.log(
          `Criando admin padrão (CPF=${TARGET_CPF}) com empresa=${company.id}`,
        );
        await this.tenantService.run(
          { companyId: company.id, isSuperAdmin: true },
          async () => {
            await this.usersService.create({
              nome: 'Administrador Geral',
              cpf: TARGET_CPF,
              funcao: 'Admin',
              password: TARGET_PASSWORD,
              company_id: company.id,
              profile_id: adminProfile.id,
              status: true,
            });
          },
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Erro ao semear Admin: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  private async runAsSuperAdmin<T>(callback: () => Promise<T>): Promise<T> {
    return this.tenantService.run(
      { companyId: undefined, isSuperAdmin: true },
      callback,
    );
  }
}

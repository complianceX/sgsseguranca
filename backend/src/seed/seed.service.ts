import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProfilesService } from '../profiles/profiles.service';
import { CompaniesService } from '../companies/companies.service';
import { UsersService } from '../users/users.service';
import type { User } from '../users/entities/user.entity';
import { CompanyResponseDto } from '../companies/dto/company-response.dto';
import { Profile } from '../profiles/entities/profile.entity';
import { TenantService } from '../common/tenant/tenant.service';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private dataSource: DataSource,
    private profilesService: ProfilesService,
    private companiesService: CompaniesService,
    private usersService: UsersService,
    private tenantService: TenantService,
  ) {}

  onApplicationBootstrap() {
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
    const rows = (await this.dataSource.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = ANY($1)
      `,
      [requiredTables],
    )) as Array<{ table_name: string }>;

    const existing = new Set(rows.map((row) => row.table_name));
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
      const targetCpfRaw = process.env.DEV_ADMIN_CPF || '15082302698';
      const targetPassword =
        process.env.DEV_ADMIN_PASSWORD || 'GANDRA@2026';
      const targetCpf = targetCpfRaw.replace(/\D/g, '');
      const oldCpfs = ['00000000191', '00000000000'];

      if (targetCpf.length !== 11) {
        this.logger.warn(
          `DEV_ADMIN_CPF inválido (esperado 11 dígitos). Usando fallback 15082302698.`,
        );
      }
      const TARGET_CPF = targetCpf.length === 11 ? targetCpf : '15082302698';
      const TARGET_PASSWORD = targetPassword;

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
        await this.tenantService.run(
          { companyId: targetAdmin.company_id || company.id, isSuperAdmin: true },
          async () => {
            await this.usersService.update(targetAdmin.id, {
              password: TARGET_PASSWORD,
              profile_id: adminProfile.id,
              company_id: targetAdmin.company_id || company.id,
              funcao: targetAdmin.funcao || 'Admin',
              status: true,
            });
          },
        );
      } else if (oldAdmins.length > 0) {
        const oldAdmin = oldAdmins[0];
        this.logger.log(
          `Migrando admin de CPF antigo (${oldAdmin.cpf || 'sem-cpf'}) para novo (${TARGET_CPF})`,
        );
        await this.tenantService.run(
          { companyId: oldAdmin.company_id || company.id, isSuperAdmin: true },
          async () => {
            await this.usersService.update(oldAdmin.id, {
              cpf: TARGET_CPF,
              password: TARGET_PASSWORD,
              profile_id: adminProfile.id,
              company_id: oldAdmin.company_id || company.id,
              funcao: oldAdmin.funcao || 'Admin',
              status: true,
            });
          },
        );
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

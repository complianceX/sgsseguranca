import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ProfilesService } from '../profiles/profiles.service';
import { CompaniesService } from '../companies/companies.service';
import { UsersService } from '../users/users.service';
import { CompanyResponseDto } from '../companies/dto/company-response.dto';
import { Profile } from '../profiles/entities/profile.entity';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private profilesService: ProfilesService,
    private companiesService: CompaniesService,
    private usersService: UsersService,
  ) {}

  async onApplicationBootstrap() {
    try {
      // Garantir que as tabelas básicas existam antes de semear
      await this.seedProfiles();
      await this.seedAdmin();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Erro durante o seed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
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

      const adminUser = await this.usersService.findOneByCpf('00000000000');

      if (!adminUser) {
        await this.usersService.create({
          nome: 'Administrador Geral',
          cpf: '00000000000',
          funcao: 'Admin',
          password: 'admin', // Will be hashed in service
          company_id: company.id,
          profile_id: adminProfile.id,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Erro ao semear Admin: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }
}

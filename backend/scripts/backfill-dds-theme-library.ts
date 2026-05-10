import { createConnection, type Connection, type QueryRunner } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Dds, DdsStatus } from '../src/dds/entities/dds.entity';
import { Site } from '../src/sites/entities/site.entity';
import { User } from '../src/users/entities/user.entity';
import { Profile } from '../src/profiles/entities/profile.entity';
import { UserIdentityType } from '../src/users/constants/user-identity.constant';
import { DDS_THEME_LIBRARY } from '../src/dds/templates/dds-theme-library';

dotenv.config({ path: path.join(__dirname, '../.env') });

type Flags = {
  dryRun: boolean;
  companyId?: string;
  onlyActive: boolean;
};

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { dryRun: true, onlyActive: false };
  for (const arg of argv) {
    if (arg === '--apply') flags.dryRun = false;
    if (arg === '--dry-run') flags.dryRun = true;
    if (arg === '--only-active') flags.onlyActive = true;
    if (arg.startsWith('--company-id=')) {
      const value = arg.slice('--company-id='.length).trim();
      flags.companyId = value || undefined;
    }
  }
  return flags;
}

async function findOrCreateSite(
  qr: QueryRunner,
  companyId: string,
  dryRun: boolean,
): Promise<string> {
  const existing = await qr.manager.findOne(Site, {
    where: { company_id: companyId },
    order: { created_at: 'ASC' },
  });
  if (existing) return existing.id;
  if (dryRun) return 'dry-run-site-id';

  const site = await qr.manager.save(
    Site,
    qr.manager.create(Site, {
      company_id: companyId,
      nome: 'Geral',
      local: 'Geral',
      status: true,
    }),
  );
  return site.id;
}

async function findOrCreateFacilitator(
  qr: QueryRunner,
  companyId: string,
  siteId: string,
  dryRun: boolean,
): Promise<string> {
  const existing = await qr.manager.findOne(User, {
    where: { company_id: companyId },
    order: { created_at: 'ASC' },
  });
  if (existing) return existing.id;
  if (dryRun) return 'dry-run-facilitator-id';

  const preferredProfileNames = [
    'Técnico',
    'Supervisor',
    'Administrador da Empresa',
  ];

  let profile = await qr.manager
    .createQueryBuilder(Profile, 'profile')
    .where('profile.status = true')
    .andWhere('profile.nome IN (:...names)', { names: preferredProfileNames })
    .orderBy('profile.created_at', 'ASC')
    .getOne();

  if (!profile) {
    profile = await qr.manager.findOne(Profile, {
      where: { status: true },
      order: { created_at: 'ASC' },
    });
  }
  if (!profile) {
    throw new Error('Nenhum perfil ativo disponível para criar facilitador.');
  }

  const user = await qr.manager.save(
    User,
    qr.manager.create(User, {
      nome: 'SGS (Temas DDS)',
      email: `system.dds.${companyId}@sgs.local`,
      cpf: null,
      funcao: 'Sistema',
      company_id: companyId,
      site_id: siteId,
      profile_id: profile.id,
      identity_type: UserIdentityType.SYSTEM_USER,
      status: true,
      ai_processing_consent: false,
    }),
  );
  return user.id;
}

async function run(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  let connection: Connection | null = null;

  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL não configurada.');
    }

    connection = await createConnection({
      type: 'postgres',
      url: databaseUrl,
      ssl: true,
      extra: { ssl: true },
      entities: [path.join(__dirname, '../src/**/*.entity{.ts,.js}')],
      synchronize: false,
    });

    const whereParts: string[] = [];
    const params: unknown[] = [];
    if (flags.companyId) {
      whereParts.push(`id = $${params.length + 1}`);
      params.push(flags.companyId);
    }
    if (flags.onlyActive) {
      whereParts.push('status = true');
    }
    const whereClause = whereParts.length
      ? `WHERE ${whereParts.join(' AND ')}`
      : '';

    const companies = await connection.query<Array<{ id: string }>>(
      `SELECT id FROM companies ${whereClause} ORDER BY created_at ASC`,
      params,
    );

    if (companies.length === 0) {
      console.log('Nenhuma empresa encontrada para o filtro informado.');
      return;
    }

    let companiesTouched = 0;
    let totalMissing = 0;

    for (const company of companies) {
      const qr = connection.createQueryRunner();
      await qr.connect();
      if (!flags.dryRun) await qr.startTransaction();

      try {
        const rows = await qr.query<Array<{ tema: string }>>(
          'SELECT tema FROM dds WHERE company_id = $1 AND is_modelo = true',
          [company.id],
        );
        const existingTemaSet = new Set(
          rows
            .map((row) => row.tema?.trim())
            .filter((value): value is string => Boolean(value)),
        );
        const missingThemes = DDS_THEME_LIBRARY.filter(
          (theme) => !existingTemaSet.has(theme.tema.trim()),
        );

        if (missingThemes.length === 0) {
          console.log(`company=${company.id} OK (sem temas faltantes).`);
          if (!flags.dryRun) await qr.commitTransaction();
          continue;
        }

        companiesTouched += 1;
        totalMissing += missingThemes.length;

        const siteId = await findOrCreateSite(qr, company.id, flags.dryRun);
        const facilitatorId = await findOrCreateFacilitator(
          qr,
          company.id,
          siteId,
          flags.dryRun,
        );

        if (flags.dryRun) {
          console.log(
            `company=${company.id} faltantes=${missingThemes.length} (dry-run).`,
          );
          continue;
        }

        const now = new Date();
        const batchSize = 50;
        for (let i = 0; i < missingThemes.length; i += batchSize) {
          const batch = missingThemes.slice(i, i + batchSize).map((theme) =>
            qr.manager.create(Dds, {
              tema: theme.tema,
              conteudo: theme.conteudo,
              data: now,
              is_modelo: true,
              company_id: company.id,
              site_id: siteId,
              facilitador_id: facilitatorId,
              status: DdsStatus.RASCUNHO,
              version: 1,
            }),
          );
          await qr.manager.save(Dds, batch);
        }

        await qr.commitTransaction();
        console.log(`company=${company.id} inseridos=${missingThemes.length}.`);
      } catch (error) {
        if (!flags.dryRun) await qr.rollbackTransaction();
        throw error;
      } finally {
        await qr.release();
      }
    }

    console.log(
      JSON.stringify(
        {
          dryRun: flags.dryRun,
          companyId: flags.companyId ?? null,
          onlyActive: flags.onlyActive,
          companiesScanned: companies.length,
          companiesTouched,
          templatesMissingOrInserted: totalMissing,
        },
        null,
        2,
      ),
    );
  } finally {
    if (connection) await connection.close();
  }
}

run().catch((error) => {
  console.error('Falha no backfill DDS theme library:', error);
  process.exitCode = 1;
});

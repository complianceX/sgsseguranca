import { MigrationInterface, QueryRunner } from 'typeorm';

const isSqlite = (qr: QueryRunner) =>
  qr.connection.options.type === 'sqlite' ||
  qr.connection.options.type === 'better-sqlite3';

interface IndexDef {
  name: string;
  table: string;
  columns: string;
}

// Tabelas com company_id + deleted_at que se beneficiam de index parcial
const PARTIAL_INDEXES: IndexDef[] = [
  {
    name: 'IDX_aprs_company_active',
    table: 'aprs',
    columns: '(company_id, created_at DESC)',
  },
  {
    name: 'IDX_pts_company_active',
    table: 'pts',
    columns: '(company_id, created_at DESC)',
  },
  {
    name: 'IDX_dds_company_active',
    table: 'dds',
    columns: '(company_id, created_at DESC)',
  },
  {
    name: 'IDX_risks_company_active',
    table: 'risks',
    columns: '(company_id)',
  },
  {
    name: 'IDX_epis_company_active',
    table: 'epis',
    columns: '(company_id)',
  },
  {
    name: 'IDX_trainings_company_active',
    table: 'trainings',
    columns: '(company_id)',
  },
  {
    name: 'IDX_medical_exams_company_active',
    table: 'medical_exams',
    columns: '(company_id)',
  },
  {
    name: 'IDX_nonconformities_company_active',
    table: 'nonconformities',
    columns: '(company_id, created_at DESC)',
  },
  {
    name: 'IDX_corrective_actions_company_active',
    table: 'corrective_actions',
    columns: '(company_id)',
  },
  {
    name: 'IDX_sites_company_active',
    table: 'sites',
    columns: '(company_id)',
  },
  {
    name: 'IDX_activities_company_active',
    table: 'activities',
    columns: '(company_id)',
  },
  {
    name: 'IDX_cats_company_active',
    table: 'cats',
    columns: '(company_id, created_at DESC)',
  },
  {
    name: 'IDX_notifications_user_active',
    table: 'notifications',
    columns: '("userId", company_id)',
  },
];

export class AddPartialIndexesSoftDelete1709000000203 implements MigrationInterface {
  name = 'AddPartialIndexesSoftDelete1709000000203';

  // CONCURRENTLY não pode ser usado dentro de transaction — obrigatório
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (isSqlite(queryRunner)) {
      return;
    }

    for (const idx of PARTIAL_INDEXES) {
      if (!(await queryRunner.hasTable(idx.table))) continue;

      // Verificar se a tabela tem coluna deleted_at
      const hasDeletedAt = (await queryRunner.query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = $1
           AND column_name = 'deleted_at'`,
        [idx.table],
      )) as Array<Record<string, unknown>>;

      if (hasDeletedAt.length === 0) continue;

      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "${idx.name}"
        ON "${idx.table}" ${idx.columns}
        WHERE deleted_at IS NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (isSqlite(queryRunner)) return;

    for (const idx of PARTIAL_INDEXES) {
      await queryRunner.query(
        `DROP INDEX CONCURRENTLY IF EXISTS "${idx.name}"`,
      );
    }
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

const isSqlite = (qr: QueryRunner) =>
  qr.connection.options.type === 'sqlite' ||
  qr.connection.options.type === 'better-sqlite3';

interface CheckDef {
  table: string;
  constraint: string;
  column: string;
  values: string[];
}

const STATUS_CHECKS: CheckDef[] = [
  {
    table: 'aprs',
    constraint: 'CHK_aprs_status',
    column: 'status',
    values: ['Pendente', 'Aprovada', 'Cancelada', 'Encerrada'],
  },
  {
    table: 'pts',
    constraint: 'CHK_pts_status',
    column: 'status',
    values: ['Pendente', 'Aprovada', 'Cancelada', 'Encerrada', 'Expirada'],
  },
  {
    table: 'dds',
    constraint: 'CHK_dds_status',
    column: 'status',
    values: ['rascunho', 'publicado', 'auditado', 'arquivado'],
  },
  {
    table: 'rdos',
    constraint: 'CHK_rdos_status',
    column: 'status',
    values: ['rascunho', 'enviado', 'aprovado', 'cancelado'],
  },
  {
    table: 'corrective_actions',
    constraint: 'CHK_corrective_actions_status',
    column: 'status',
    values: ['open', 'in_progress', 'done', 'overdue', 'cancelled'],
  },
  {
    table: 'cats',
    constraint: 'CHK_cats_status',
    column: 'status',
    values: ['aberta', 'investigacao', 'fechada'],
  },
  {
    table: 'cats',
    constraint: 'CHK_cats_gravidade',
    column: 'gravidade',
    values: ['leve', 'moderada', 'grave', 'fatal'],
  },
  {
    table: 'cats',
    constraint: 'CHK_cats_tipo',
    column: 'tipo',
    values: ['tipico', 'trajeto', 'doenca_ocupacional', 'outros'],
  },
];

export class AddCheckConstraintsStatusColumns1709000000202 implements MigrationInterface {
  name = 'AddCheckConstraintsStatusColumns1709000000202';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (isSqlite(queryRunner)) {
      return;
    }

    for (const def of STATUS_CHECKS) {
      if (!(await queryRunner.hasTable(def.table))) continue;

      const existing = (await queryRunner.query(
        `SELECT 1
         FROM information_schema.table_constraints
         WHERE table_schema = 'public'
           AND table_name = $1
           AND constraint_name = $2`,
        [def.table, def.constraint],
      )) as Array<Record<string, unknown>>;

      if (existing.length > 0) continue;

      // Validar dados existentes antes de adicionar constraint
      const inList = def.values.map((v) => `'${v}'`).join(', ');
      const invalid = (await queryRunner.query(
        `SELECT COUNT(*)::int AS cnt
         FROM "${def.table}"
         WHERE "${def.column}" NOT IN (${inList})
           AND "${def.column}" IS NOT NULL`,
      )) as Array<{ cnt: number }>;

      if (invalid[0]?.cnt > 0) {
        console.warn(
          `[Migration 202] Tabela "${def.table}" possui ${invalid[0].cnt} linha(s) com "${def.column}" fora do conjunto permitido. Constraint não adicionada.`,
        );
        continue;
      }

      await queryRunner.query(`
        ALTER TABLE "${def.table}"
        ADD CONSTRAINT "${def.constraint}"
        CHECK ("${def.column}" IN (${inList}))
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (isSqlite(queryRunner)) return;

    for (const def of STATUS_CHECKS) {
      if (!(await queryRunner.hasTable(def.table))) continue;
      await queryRunner.query(`
        ALTER TABLE "${def.table}"
        DROP CONSTRAINT IF EXISTS "${def.constraint}"
      `);
    }
  }
}

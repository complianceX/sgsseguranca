import { MigrationInterface, QueryRunner } from 'typeorm';

const TABLE = 'public.playing_with_neon';

type ColumnRow = {
  column_name: string;
  data_type: string;
  is_nullable: string;
};

/**
 * Remove somente o artefato sample comprovado do Neon. Qualquer divergência
 * estrutural ou dependência de banco interrompe a migration antes do DROP.
 */
export class RemoveNeonSampleTable1709000000400 implements MigrationInterface {
  name = 'RemoveNeonSampleTable1709000000400';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableRows = (await queryRunner.query(
      `SELECT to_regclass($1) AS table_name`,
      [TABLE],
    )) as Array<{ table_name?: string | null }>;
    if (!tableRows[0]?.table_name) {
      return;
    }

    const ownerRows = (await queryRunner.query(
      `
        SELECT pg_get_userbyid(c.relowner) AS owner
        FROM pg_class c
        WHERE c.oid = $1::regclass
      `,
      [TABLE],
    )) as Array<{ owner?: string }>;
    if (ownerRows[0]?.owner === 'sgs_app') {
      throw new Error('0400 refuses to drop a runtime-owned table');
    }

    const columns = (await queryRunner.query(
      `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'playing_with_neon'
        ORDER BY ordinal_position
      `,
    )) as ColumnRow[];
    const expectedColumns: ColumnRow[] = [
      { column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
      { column_name: 'name', data_type: 'text', is_nullable: 'NO' },
      { column_name: 'value', data_type: 'real', is_nullable: 'YES' },
    ];
    if (JSON.stringify(columns) !== JSON.stringify(expectedColumns)) {
      throw new Error(
        '0400 playing_with_neon structure is not the verified sample',
      );
    }

    const primaryKeyRows = (await queryRunner.query(
      `
        SELECT count(*)::int AS primary_key_count
        FROM pg_constraint
        WHERE conrelid = $1::regclass
          AND contype = 'p'
          AND pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
      `,
      [TABLE],
    )) as Array<{ primary_key_count?: number | string }>;
    if (Number(primaryKeyRows[0]?.primary_key_count) !== 1) {
      throw new Error('0400 verified sample primary key is missing or changed');
    }

    const dependencyRows = (await queryRunner.query(
      `
        SELECT pg_describe_object(d.classid, d.objid, d.objsubid) AS dependency
        FROM pg_depend d
        WHERE d.refobjid = $1::regclass
          AND d.deptype = 'n'
        ORDER BY dependency
      `,
      [TABLE],
    )) as Array<{ dependency?: string }>;
    if (dependencyRows.length > 0) {
      throw new Error(
        `0400 verified sample has unexpected database dependents: ${dependencyRows
          .map((row) => row.dependency)
          .filter(Boolean)
          .join(', ')}`,
      );
    }

    const foreignKeyRows = (await queryRunner.query(
      `
        SELECT conname
        FROM pg_constraint
        WHERE contype = 'f'
          AND (conrelid = $1::regclass OR confrelid = $1::regclass)
      `,
      [TABLE],
    )) as Array<{ conname?: string }>;
    if (foreignKeyRows.length > 0) {
      throw new Error('0400 verified sample participates in a foreign key');
    }

    const triggerRows = (await queryRunner.query(
      `
        SELECT tgname
        FROM pg_trigger
        WHERE tgrelid = $1::regclass
          AND NOT tgisinternal
      `,
      [TABLE],
    )) as Array<{ tgname?: string }>;
    if (triggerRows.length > 0) {
      throw new Error('0400 verified sample has an unexpected trigger');
    }

    await queryRunner.query(`DROP TABLE IF EXISTS ${TABLE}`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op intencional: não recriar uma tabela sample nem seus dados
    // históricos sem uma decisão operacional explícita.
  }
}

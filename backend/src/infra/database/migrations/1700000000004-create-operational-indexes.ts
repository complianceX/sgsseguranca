import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOperationalIndexes1700000000004 implements MigrationInterface {
  private async hasColumn(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
  ): Promise<boolean> {
    const result = (await queryRunner.query(
      `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
      `,
      [tableName, columnName],
    )) as Array<{ '?column?': 1 }>;

    return result.length > 0;
  }

  private async createIndexIfColumnsExist(
    queryRunner: QueryRunner,
    tableName: string,
    requiredColumns: string[],
    sql: string,
  ): Promise<void> {
    if (!(await queryRunner.hasTable(tableName))) {
      return;
    }

    for (const column of requiredColumns) {
      if (!(await this.hasColumn(queryRunner, tableName, column))) {
        return;
      }
    }

    await queryRunner.query(sql);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // === CHECKLISTS ===
    // Filtragem por empresa, status e ordenação
    await this.createIndexIfColumnsExist(
      queryRunner,
      'checklists',
      ['company_id', 'status'],
      `CREATE INDEX IF NOT EXISTS "idx_checklists_company_status" ON "checklists" ("company_id", "status")`,
    );
    // Filtragem por templates (modelos)
    await this.createIndexIfColumnsExist(
      queryRunner,
      'checklists',
      ['is_modelo'],
      `CREATE INDEX IF NOT EXISTS "idx_checklists_modelos" ON "checklists" ("is_modelo") WHERE "is_modelo" = true`,
    );
    // Filtragem por site
    await this.createIndexIfColumnsExist(
      queryRunner,
      'checklists',
      ['site_id'],
      `CREATE INDEX IF NOT EXISTS "idx_checklists_site_id" ON "checklists" ("site_id")`,
    );
    // Filtragem por inspetor
    await this.createIndexIfColumnsExist(
      queryRunner,
      'checklists',
      ['inspetor_id'],
      `CREATE INDEX IF NOT EXISTS "idx_checklists_inspetor_id" ON "checklists" ("inspetor_id")`,
    );

    // === APRS (Análise Preliminar de Risco) ===
    await this.createIndexIfColumnsExist(
      queryRunner,
      'aprs',
      ['company_id', 'status'],
      `CREATE INDEX IF NOT EXISTS "idx_aprs_company_status" ON "aprs" ("company_id", "status")`,
    );
    await this.createIndexIfColumnsExist(
      queryRunner,
      'aprs',
      ['site_id'],
      `CREATE INDEX IF NOT EXISTS "idx_aprs_site_id" ON "aprs" ("site_id")`,
    );

    // === PTS (Permissão de Trabalho) ===
    await this.createIndexIfColumnsExist(
      queryRunner,
      'pts',
      ['company_id', 'status'],
      `CREATE INDEX IF NOT EXISTS "idx_pts_company_status" ON "pts" ("company_id", "status")`,
    );
    await this.createIndexIfColumnsExist(
      queryRunner,
      'pts',
      ['site_id'],
      `CREATE INDEX IF NOT EXISTS "idx_pts_site_id" ON "pts" ("site_id")`,
    );
    // Datas críticas
    await this.createIndexIfColumnsExist(
      queryRunner,
      'pts',
      ['data_hora_inicio'],
      `CREATE INDEX IF NOT EXISTS "idx_pts_data_inicio" ON "pts" ("data_hora_inicio")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop PTS indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pts_data_inicio"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pts_site_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pts_company_status"`);

    // Drop APRS indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_aprs_site_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_aprs_company_status"`);

    // Drop Checklists indexes
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_checklists_inspetor_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_checklists_site_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_checklists_modelos"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_checklists_company_status"`,
    );
  }
}

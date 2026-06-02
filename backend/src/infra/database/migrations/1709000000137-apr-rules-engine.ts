import { MigrationInterface, QueryRunner } from 'typeorm';

export class AprRulesEngine1709000000137 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "apr_rules" (
        "id"                  uuid          NOT NULL DEFAULT gen_random_uuid(),
        "code"                varchar(80)   NOT NULL,
        "version"             int           NOT NULL DEFAULT 1,
        "isActive"            boolean       NOT NULL DEFAULT true,
        "severity"            varchar(20)   NOT NULL,
        "category"            varchar(20)   NOT NULL,
        "title"               varchar(200)  NOT NULL,
        "description"         text          NOT NULL,
        "operationalMessage"  text          NOT NULL,
        "triggerCondition"    jsonb         NULL,
        "remediation"         text          NOT NULL,
        "nrReference"         varchar(120)  NULL,
        "createdAt"           TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updatedAt"           TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_apr_rules" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_apr_rules_severity"
          CHECK ("severity" IN ('BLOQUEANTE', 'ADVERTENCIA')),
        CONSTRAINT "CHK_apr_rules_category"
          CHECK ("category" IN ('NR', 'EPI', 'EPC', 'PT', 'RESPONSAVEL', 'CONSISTENCIA'))
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "UQ_apr_rules_code"
        ON "apr_rules" ("code")
    `);

    await queryRunner.query(`
      ALTER TABLE "aprs"
        ADD COLUMN IF NOT EXISTS "rulesSnapshot"    jsonb  NULL,
        ADD COLUMN IF NOT EXISTS "complianceScore"  int    NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "UQ_apr_rules_code"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "apr_rules"`);
    await queryRunner.query(`
      ALTER TABLE "aprs"
        DROP COLUMN IF EXISTS "rulesSnapshot",
        DROP COLUMN IF EXISTS "complianceScore"
    `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AprFeatureFlags1709000000133 implements MigrationInterface {
  name = 'AprFeatureFlags1709000000133';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "apr_feature_flags" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "key" character varying(80) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT false,
        "tenantId" character varying NULL,
        "description" text NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_apr_feature_flags_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "UQ_apr_feature_flags_key_tenant"
      ON "apr_feature_flags" ("key", "tenantId")
    `);

    await queryRunner.query(`
      INSERT INTO "apr_feature_flags" ("key", "enabled", "tenantId", "description")
      VALUES
        ('APR_WORKFLOW_CONFIGURAVEL', false, NULL, 'Workflow de aprovação configurável por tenant'),
        ('APR_RULES_ENGINE',          false, NULL, 'Motor de regras para validações avançadas de APR'),
        ('APR_TEMPLATES_ENTERPRISE',  false, NULL, 'Templates enterprise reutilizáveis de APR'),
        ('APR_PDF_PREMIUM',           false, NULL, 'Geração de PDF premium com layout avançado'),
        ('APR_ANALYTICS',             false, NULL, 'Dashboard de analytics do módulo APR'),
        ('APR_IA_SUGGESTIONS',        false, NULL, 'Sugestões de controle de risco via IA')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "UQ_apr_feature_flags_key_tenant"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "apr_feature_flags"`);
  }
}

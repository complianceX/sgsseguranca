import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cria a tabela `ai_interactions` para histórico de interações com o Agente SST.
 *
 * Características de segurança:
 * - `tenant_id` obrigatório em todos os registros
 * - RLS ativa: cada empresa só acessa suas próprias interações
 * - Índices compostos para queries eficientes por tenant
 */
export class CreateAiInteractions1709000000031 implements MigrationInterface {
  name = 'CreateAiInteractions1709000000031';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ai_interactions" (
        "id"            uuid        NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"     varchar     NOT NULL,
        "user_id"       varchar     NOT NULL,
        "question"      text        NOT NULL,
        "response"      json,
        "tools_called"  json,
        "status"        varchar     NOT NULL DEFAULT 'success',
        "error_message" text,
        "tokens_used"   integer,
        "created_at"    TIMESTAMP   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_interactions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_interactions_tenant_created"
      ON "ai_interactions" ("tenant_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_interactions_tenant_user"
      ON "ai_interactions" ("tenant_id", "user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_interactions_tenant_id"
      ON "ai_interactions" ("tenant_id")
    `);

    // Row Level Security — impede cross-tenant leaks a nível de banco
    await queryRunner.query(
      `ALTER TABLE "ai_interactions" ENABLE ROW LEVEL SECURITY`,
    );

    await queryRunner.query(`
      CREATE POLICY "tenant_isolation" ON "ai_interactions"
      USING (tenant_id = current_setting('app.tenant_id', true))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS "tenant_isolation" ON "ai_interactions"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_ai_interactions_tenant_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_ai_interactions_tenant_user"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_ai_interactions_tenant_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_interactions"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAprRiskItems1709000000003 implements MigrationInterface {
  name = 'CreateAprRiskItems1709000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "apr_risk_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "apr_id" uuid NOT NULL,
        "atividade" text,
        "agente_ambiental" text,
        "condicao_perigosa" text,
        "fonte_circunstancia" text,
        "lesao" text,
        "probabilidade" integer,
        "severidade" integer,
        "score_risco" integer,
        "categoria_risco" character varying(40),
        "prioridade" character varying(40),
        "medidas_prevencao" text,
        "ordem" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_apr_risk_items_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_apr_risk_items_apr_id" ON "apr_risk_items" ("apr_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_apr_risk_items_categoria" ON "apr_risk_items" ("categoria_risco")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_apr_risk_items_prioridade" ON "apr_risk_items" ("prioridade")`,
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_apr_risk_items_apr_id'
        ) THEN
          ALTER TABLE "apr_risk_items"
          ADD CONSTRAINT "FK_apr_risk_items_apr_id"
          FOREIGN KEY ("apr_id") REFERENCES "aprs"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      INSERT INTO "apr_risk_items" (
        "id",
        "apr_id",
        "atividade",
        "agente_ambiental",
        "condicao_perigosa",
        "fonte_circunstancia",
        "lesao",
        "probabilidade",
        "severidade",
        "score_risco",
        "categoria_risco",
        "prioridade",
        "medidas_prevencao",
        "ordem"
      )
      SELECT
        uuid_generate_v4(),
        a.id,
        NULLIF(item.value->>'atividade_processo', ''),
        NULLIF(item.value->>'agente_ambiental', ''),
        NULLIF(item.value->>'condicao_perigosa', ''),
        NULLIF(item.value->>'fontes_circunstancias', ''),
        NULLIF(item.value->>'possiveis_lesoes', ''),
        CASE
          WHEN item.value ? 'probabilidade'
          THEN NULLIF(regexp_replace(item.value->>'probabilidade', '[^0-9]', '', 'g'), '')::int
          ELSE NULL
        END,
        CASE
          WHEN item.value ? 'severidade'
          THEN NULLIF(regexp_replace(item.value->>'severidade', '[^0-9]', '', 'g'), '')::int
          ELSE NULL
        END,
        CASE
          WHEN item.value ? 'score_risco'
          THEN NULLIF(regexp_replace(item.value->>'score_risco', '[^0-9]', '', 'g'), '')::int
          ELSE NULL
        END,
        NULLIF(item.value->>'categoria_risco', ''),
        NULLIF(item.value->>'prioridade', ''),
        NULLIF(item.value->>'medidas_prevencao', ''),
        (item.ord - 1)::int
      FROM "aprs" a
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.itens_risco, '[]'::jsonb))
        WITH ORDINALITY AS item(value, ord)
      WHERE jsonb_typeof(COALESCE(a.itens_risco, '[]'::jsonb)) = 'array'
      AND NOT EXISTS (
        SELECT 1 FROM "apr_risk_items" r WHERE r.apr_id = a.id
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "apr_risk_items" DROP CONSTRAINT IF EXISTS "FK_apr_risk_items_apr_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_apr_risk_items_prioridade"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_apr_risk_items_categoria"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_apr_risk_items_apr_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "apr_risk_items"`);
  }
}

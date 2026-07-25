import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Habilita RLS em forensic_trail_events e adiciona policies permissivas
 * para sgs_app, eliminando a necessidade de SET LOCAL is_super_admin = 'true'
 * no ForensicTrailService (fase 1b do hardening de bypass de RLS).
 *
 * A tabela é append-only por trigger (UPDATE/DELETE proibidos). Logo:
 *   - INSERT: sempre permitido para sgs_app (a aplicação controla o conteúdo)
 *   - SELECT: restrito à empresa corrente ou a eventos globais (company_id IS NULL)
 *             — suficiente para o encadeamento de hash (stream_key inclui company_id)
 *
 * SELECT cross-tenant (ex.: admin realizando exclusão LGPD) retorna previousEvent=null,
 * iniciando uma nova cadeia — comportamento seguro e aceito para eventos globais raros.
 */
export class AddForensicTrailRlsPolicies1709000000360
  implements MigrationInterface
{
  name = 'AddForensicTrailRlsPolicies1709000000360';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('forensic_trail_events'))) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "forensic_trail_events" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "forensic_trail_events" FORCE ROW LEVEL SECURITY`,
    );

    await queryRunner.query(`
      DROP POLICY IF EXISTS "forensic_trail_events_insert" ON "forensic_trail_events"
    `);
    await queryRunner.query(`
      CREATE POLICY "forensic_trail_events_insert"
      ON "forensic_trail_events"
      AS PERMISSIVE
      FOR INSERT
      TO sgs_app
      WITH CHECK (true)
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS "forensic_trail_events_select" ON "forensic_trail_events"
    `);
    await queryRunner.query(`
      CREATE POLICY "forensic_trail_events_select"
      ON "forensic_trail_events"
      AS PERMISSIVE
      FOR SELECT
      TO sgs_app
      USING (
        company_id = current_company()
        OR company_id IS NULL
        OR is_super_admin() = true
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('forensic_trail_events'))) {
      return;
    }

    await queryRunner.query(`
      DROP POLICY IF EXISTS "forensic_trail_events_select" ON "forensic_trail_events"
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS "forensic_trail_events_insert" ON "forensic_trail_events"
    `);
    await queryRunner.query(
      `ALTER TABLE "forensic_trail_events" DISABLE ROW LEVEL SECURITY`,
    );
  }
}

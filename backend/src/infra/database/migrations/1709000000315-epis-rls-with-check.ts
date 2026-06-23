import { MigrationInterface, QueryRunner } from 'typeorm';

const isSqlite = (qr: QueryRunner) =>
  qr.connection.options.type === 'sqlite' ||
  qr.connection.options.type === 'better-sqlite3';

export class EpisRlsWithCheck1709000000315 implements MigrationInterface {
  name = 'EpisRlsWithCheck1709000000315';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (isSqlite(queryRunner)) {
      return;
    }

    // Adiciona WITH CHECK à política RLS da tabela epis.
    // A política USING existente (migration 021) isolava leitura mas não escrita.
    // WITH CHECK garante que writes também respeitem o tenant mesmo em bugs de app.
    await queryRunner.query(`
      DO $$ BEGIN
        -- Remove a política existente (sem WITH CHECK) para recriar completa
        IF EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'epis' AND policyname = 'tenant_isolation_policy'
        ) THEN
          DROP POLICY "tenant_isolation_policy" ON "epis";
        END IF;

        CREATE POLICY "tenant_isolation_policy" ON "epis"
          USING (
            company_id = current_setting('app.current_company_id', true)::uuid
            OR current_setting('app.is_super_admin', true) = 'true'
          )
          WITH CHECK (
            company_id = current_setting('app.current_company_id', true)::uuid
            OR current_setting('app.is_super_admin', true) = 'true'
          );
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (isSqlite(queryRunner)) {
      return;
    }

    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'epis' AND policyname = 'tenant_isolation_policy'
        ) THEN
          DROP POLICY "tenant_isolation_policy" ON "epis";
        END IF;

        CREATE POLICY "tenant_isolation_policy" ON "epis"
          USING (
            company_id = current_setting('app.current_company_id', true)::uuid
            OR current_setting('app.is_super_admin', true) = 'true'
          );
      END $$;
    `);
  }
}
import { MigrationInterface, QueryRunner } from 'typeorm';

const FORENSIC_RLS_EXPRESSION = `(
  (company_id)::text = (current_company())::text
  OR is_super_admin() = true
  OR (
    company_id IS NULL
    AND module = 'security'
    AND event_type IN ('LOGIN_FAILED', 'MFA_FAILED')
  )
)`;

/**
 * Aligns forensic_trail_events column types with the entity declaration:
 *   - company_id, user_id, request_id: varchar(120) -> uuid
 *   - ip: varchar(120) -> inet
 *
 * entity_id stays as varchar(120) on purpose: it is a polymorphic field.
 * For module='security' / event_type='LOGOUT' it carries the client IP
 * (text representation), and for other modules it carries a UUID. Forcing
 * uuid here would silently drop forensic data.
 *
 * The two RLS policies on this table reference company_id, so we must
 * drop them, alter the type, and recreate them with an identical
 * expression (the (column)::text cast is still valid against uuid).
 * The expression is preserved verbatim from migration 1709000000176 to
 * avoid any behavioural delta.
 *
 * Pre-validated on the production branch: 258/258 non-null company_id,
 * user_id, request_id are valid UUIDs; 258/258 non-null ip values are
 * valid inet literals.
 */
export class HardenForensicTrailNativeTypes1709000000179 implements MigrationInterface {
  name = 'HardenForensicTrailNativeTypes1709000000179';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('forensic_trail_events'))) {
      return;
    }

    const alreadyMigrated = await this.columnIsType(
      queryRunner,
      'forensic_trail_events',
      'company_id',
      'uuid',
    );

    if (alreadyMigrated) {
      return;
    }

    if (!(await this.canManageTablePolicies(queryRunner))) {
      throw new Error(
        'Migration 1709000000179 requires ownership of forensic_trail_events to drop/recreate RLS policies.',
      );
    }

    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "forensic_trail_events"
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS "rls_forensic_company_isolation" ON "forensic_trail_events"
    `);

    await queryRunner.query(`
      ALTER TABLE "forensic_trail_events"
        ALTER COLUMN "company_id" TYPE uuid USING company_id::uuid,
        ALTER COLUMN "user_id" TYPE uuid USING user_id::uuid,
        ALTER COLUMN "request_id" TYPE uuid USING request_id::uuid,
        ALTER COLUMN "ip" TYPE inet USING ip::inet
    `);

    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "forensic_trail_events"
      AS PERMISSIVE
      FOR ALL
      USING ${FORENSIC_RLS_EXPRESSION}
      WITH CHECK ${FORENSIC_RLS_EXPRESSION}
    `);
    await queryRunner.query(`
      CREATE POLICY "rls_forensic_company_isolation"
      ON "forensic_trail_events"
      AS RESTRICTIVE
      FOR ALL
      USING ${FORENSIC_RLS_EXPRESSION}
      WITH CHECK ${FORENSIC_RLS_EXPRESSION}
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('forensic_trail_events'))) {
      return;
    }

    const alreadyReverted = await this.columnIsType(
      queryRunner,
      'forensic_trail_events',
      'company_id',
      'character varying',
    );

    if (alreadyReverted) {
      return;
    }

    if (!(await this.canManageTablePolicies(queryRunner))) {
      throw new Error(
        'Migration 1709000000179 down requires ownership of forensic_trail_events to drop/recreate RLS policies.',
      );
    }

    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "forensic_trail_events"
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS "rls_forensic_company_isolation" ON "forensic_trail_events"
    `);

    await queryRunner.query(`
      ALTER TABLE "forensic_trail_events"
        ALTER COLUMN "company_id" TYPE varchar(120) USING company_id::text,
        ALTER COLUMN "user_id" TYPE varchar(120) USING user_id::text,
        ALTER COLUMN "request_id" TYPE varchar(120) USING request_id::text,
        ALTER COLUMN "ip" TYPE varchar(120) USING host(ip)
    `);

    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "forensic_trail_events"
      AS PERMISSIVE
      FOR ALL
      USING ${FORENSIC_RLS_EXPRESSION}
      WITH CHECK ${FORENSIC_RLS_EXPRESSION}
    `);
    await queryRunner.query(`
      CREATE POLICY "rls_forensic_company_isolation"
      ON "forensic_trail_events"
      AS RESTRICTIVE
      FOR ALL
      USING ${FORENSIC_RLS_EXPRESSION}
      WITH CHECK ${FORENSIC_RLS_EXPRESSION}
    `);
  }

  private async canManageTablePolicies(
    queryRunner: QueryRunner,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `
        SELECT pg_has_role(current_user, c.relowner, 'MEMBER') AS can_manage
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = current_schema()
           AND c.relname = 'forensic_trail_events'
         LIMIT 1
      `,
    )) as Array<{ can_manage: boolean }>;

    return rows[0]?.can_manage === true;
  }

  private async columnIsType(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    typeName: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = $1
           AND column_name = $2
           AND data_type = $3
         LIMIT 1
      `,
      [tableName, columnName, typeName],
    )) as Array<unknown>;

    return rows.length > 0;
  }
}

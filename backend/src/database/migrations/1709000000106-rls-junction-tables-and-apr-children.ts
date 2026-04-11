import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Segurança: RLS nas tabelas de junção M2M e filhos diretos da APR
 *
 * Problema: 8 tabelas M2M não têm `company_id` direto e estavam sem RLS.
 * Qualquer query direta (via Supabase Studio, API key, ou vazamento de JWT)
 * retornava dados de todos os tenants.
 *
 * Solução: políticas EXISTS delegando ao parent (aprs, dds, pts).
 * `apr_risk_items` e `apr_logs` recebem o mesmo tratamento.
 *
 * Tabelas cobertas:
 *   APR M2M:  apr_activities, apr_participants, apr_risks, apr_epis,
 *             apr_tools, apr_machines
 *   DDS M2M:  dds_participants
 *   PT M2M:   pt_executantes
 *   Filhos:   apr_risk_items, apr_logs
 */
export class RlsJunctionTablesAndAprChildren1709000000106 implements MigrationInterface {
  name = 'RlsJunctionTablesAndAprChildren1709000000106';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // =========================================================================
    // Tabelas de junção da APR — delegam a aprs.company_id
    // =========================================================================
    const aprJunctionTables: Array<{
      table: string;
      parentCol: string;
      parentTable: string;
    }> = [
      { table: 'apr_activities', parentCol: 'apr_id', parentTable: 'aprs' },
      { table: 'apr_participants', parentCol: 'apr_id', parentTable: 'aprs' },
      { table: 'apr_risks', parentCol: 'apr_id', parentTable: 'aprs' },
      { table: 'apr_epis', parentCol: 'apr_id', parentTable: 'aprs' },
      { table: 'apr_tools', parentCol: 'apr_id', parentTable: 'aprs' },
      { table: 'apr_machines', parentCol: 'apr_id', parentTable: 'aprs' },
    ];

    for (const { table, parentCol, parentTable } of aprJunctionTables) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(`
        DROP POLICY IF EXISTS "tenant_isolation_policy" ON "${table}"
      `);
      await queryRunner.query(`
        CREATE POLICY "tenant_isolation_policy" ON "${table}"
        AS PERMISSIVE FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM "${parentTable}" p
            WHERE p.id = "${table}"."${parentCol}"
              AND (p.company_id = current_company() OR is_super_admin() = true)
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM "${parentTable}" p
            WHERE p.id = "${table}"."${parentCol}"
              AND (p.company_id = current_company() OR is_super_admin() = true)
          )
        )
      `);
    }

    // =========================================================================
    // dds_participants — delega a dds.company_id
    // =========================================================================
    await queryRunner.query(
      `ALTER TABLE "dds_participants" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "dds_participants" FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "dds_participants"`,
    );
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy" ON "dds_participants"
      AS PERMISSIVE FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM "dds" d
          WHERE d.id = "dds_participants"."dds_id"
            AND (d.company_id = current_company() OR is_super_admin() = true)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM "dds" d
          WHERE d.id = "dds_participants"."dds_id"
            AND (d.company_id = current_company() OR is_super_admin() = true)
        )
      )
    `);

    // =========================================================================
    // pt_executantes — delega a pts.company_id
    // =========================================================================
    await queryRunner.query(
      `ALTER TABLE "pt_executantes" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "pt_executantes" FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "pt_executantes"`,
    );
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy" ON "pt_executantes"
      AS PERMISSIVE FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM "pts" p
          WHERE p.id = "pt_executantes"."pt_id"
            AND (p.company_id = current_company() OR is_super_admin() = true)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM "pts" p
          WHERE p.id = "pt_executantes"."pt_id"
            AND (p.company_id = current_company() OR is_super_admin() = true)
        )
      )
    `);

    // =========================================================================
    // apr_risk_items — filho direto de aprs, sem company_id próprio
    // =========================================================================
    await queryRunner.query(
      `ALTER TABLE "apr_risk_items" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "apr_risk_items" FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "apr_risk_items"`,
    );
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy" ON "apr_risk_items"
      AS PERMISSIVE FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM "aprs" a
          WHERE a.id = "apr_risk_items"."apr_id"
            AND (a.company_id = current_company() OR is_super_admin() = true)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM "aprs" a
          WHERE a.id = "apr_risk_items"."apr_id"
            AND (a.company_id = current_company() OR is_super_admin() = true)
        )
      )
    `);

    // =========================================================================
    // apr_logs — trilha forense da APR, sem company_id próprio
    // =========================================================================
    await queryRunner.query(`ALTER TABLE "apr_logs" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "apr_logs" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(
      `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "apr_logs"`,
    );
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy" ON "apr_logs"
      AS PERMISSIVE FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM "aprs" a
          WHERE a.id = "apr_logs"."apr_id"
            AND (a.company_id = current_company() OR is_super_admin() = true)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM "aprs" a
          WHERE a.id = "apr_logs"."apr_id"
            AND (a.company_id = current_company() OR is_super_admin() = true)
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'apr_activities',
      'apr_participants',
      'apr_risks',
      'apr_epis',
      'apr_tools',
      'apr_machines',
      'dds_participants',
      'pt_executantes',
      'apr_risk_items',
      'apr_logs',
    ];

    for (const table of tables) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "${table}"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`,
      );
    }
  }
}

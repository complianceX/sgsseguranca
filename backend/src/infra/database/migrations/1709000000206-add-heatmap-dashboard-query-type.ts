import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHeatmapDashboardQueryType1709000000206 implements MigrationInterface {
  name = 'AddHeatmapDashboardQueryType1709000000206';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "dashboard_query_snapshots"
      DROP CONSTRAINT IF EXISTS "CHK_dashboard_query_snapshots_query_type"
    `);

    await queryRunner.query(`
      ALTER TABLE "dashboard_query_snapshots"
      ADD CONSTRAINT "CHK_dashboard_query_snapshots_query_type"
      CHECK ("query_type" IN ('summary', 'kpis', 'pending-queue', 'heatmap', 'tst-day'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "dashboard_query_snapshots"
      DROP CONSTRAINT IF EXISTS "CHK_dashboard_query_snapshots_query_type"
    `);

    await queryRunner.query(`
      ALTER TABLE "dashboard_query_snapshots"
      ADD CONSTRAINT "CHK_dashboard_query_snapshots_query_type"
      CHECK ("query_type" IN ('summary', 'kpis', 'pending-queue'))
    `);
  }
}

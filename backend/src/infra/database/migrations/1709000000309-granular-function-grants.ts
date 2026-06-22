import { MigrationInterface, QueryRunner } from 'typeorm';

export class GranularFunctionGrants1709000000309 implements MigrationInterface {
  name = 'GranularFunctionGrants1709000000309';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const roleExists = await this.roleExists(queryRunner, 'sgs_app');
    if (!roleExists) {
      return;
    }

    await queryRunner.query(`REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM sgs_app`);
    await queryRunner.query(`REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM sgs_app`);
    await queryRunner.query(`GRANT EXECUTE ON FUNCTION current_company() TO sgs_app`);
    await queryRunner.query(`GRANT EXECUTE ON FUNCTION is_super_admin() TO sgs_app`);
    await queryRunner.query(`GRANT EXECUTE ON FUNCTION current_user_role() TO sgs_app`);
    await queryRunner.query(`GRANT EXECUTE ON FUNCTION current_app_user_id() TO sgs_app`);
    await queryRunner.query(`GRANT EXECUTE ON FUNCTION current_site_id() TO sgs_app`);
    await queryRunner.query(`GRANT EXECUTE ON FUNCTION current_site_scope() TO sgs_app`);
    await queryRunner.query(`GRANT EXECUTE ON FUNCTION update_updated_at_column() TO sgs_app`);
    await queryRunner.query(`GRANT EXECUTE ON FUNCTION try_parse_uuid(text) TO sgs_app`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const roleExists = await this.roleExists(queryRunner, 'sgs_app');
    if (!roleExists) {
      return;
    }

    await queryRunner.query(`REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM sgs_app`);
    await queryRunner.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO sgs_app`);
  }

  private async roleExists(
    queryRunner: QueryRunner,
    roleName: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT 1 FROM pg_roles WHERE rolname = $1 LIMIT 1`,
      [roleName],
    )) as Array<{ '?column?'?: number }>;

    return rows.length > 0;
  }
}

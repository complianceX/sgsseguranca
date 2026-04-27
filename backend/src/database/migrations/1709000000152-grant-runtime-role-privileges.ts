import { MigrationInterface, QueryRunner } from 'typeorm';

export class GrantRuntimeRolePrivileges1709000000152 implements MigrationInterface {
  name = 'GrantRuntimeRolePrivileges1709000000152';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const roleExists = await this.roleExists(queryRunner, 'sgs_app');
    if (!roleExists) {
      return;
    }

    await queryRunner.query(`GRANT USAGE ON SCHEMA public TO sgs_app`);
    await queryRunner.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sgs_app`,
    );
    await queryRunner.query(
      `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO sgs_app`,
    );
    await queryRunner.query(
      `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO sgs_app`,
    );
    await queryRunner.query(`
      ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sgs_app
    `);
    await queryRunner.query(`
      ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
      GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO sgs_app
    `);
    await queryRunner.query(`
      ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
      GRANT EXECUTE ON FUNCTIONS TO sgs_app
    `);
  }

  public async down(): Promise<void> {
    // Nao revoga privileges automaticamente: isso poderia derrubar o runtime
    // durante rollback de migrations. Remocao do role deve ser operacional.
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

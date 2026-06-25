import { MigrationInterface, QueryRunner } from 'typeorm';

const isSqlite = (qr: QueryRunner) =>
  qr.connection.options.type === 'sqlite' ||
  qr.connection.options.type === 'better-sqlite3';

export class RevokeDestructiveFunctionsFromSgsApp1709000000341 implements MigrationInterface {
  name = 'RevokeDestructiveFunctionsFromSgsApp1709000000341';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (isSqlite(queryRunner)) {
      return;
    }

    // H-10: sgs_app não deve conseguir invocar funções de limpeza/erasure
    // diretamente — essas operações são reservadas ao role owner/maintenance.
    // Por padrão, PostgreSQL concede EXECUTE a PUBLIC ao criar funções.
    await queryRunner.query(`
      REVOKE EXECUTE ON FUNCTION cleanup_expired_data() FROM sgs_app
    `);

    await queryRunner.query(`
      REVOKE EXECUTE ON FUNCTION gdpr_delete_user_data(uuid) FROM sgs_app
    `);

    // Revogar também de PUBLIC para que apenas o role owner/dba possa chamar.
    // pg_cron jobs devem rodar como role owner, não como sgs_app.
    await queryRunner.query(`
      REVOKE EXECUTE ON FUNCTION cleanup_expired_data() FROM PUBLIC
    `);

    await queryRunner.query(`
      REVOKE EXECUTE ON FUNCTION gdpr_delete_user_data(uuid) FROM PUBLIC
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (isSqlite(queryRunner)) {
      return;
    }

    await queryRunner.query(`
      GRANT EXECUTE ON FUNCTION cleanup_expired_data() TO PUBLIC
    `);

    await queryRunner.query(`
      GRANT EXECUTE ON FUNCTION gdpr_delete_user_data(uuid) TO PUBLIC
    `);

    await queryRunner.query(`
      GRANT EXECUTE ON FUNCTION cleanup_expired_data() TO sgs_app
    `);

    await queryRunner.query(`
      GRANT EXECUTE ON FUNCTION gdpr_delete_user_data(uuid) TO sgs_app
    `);
  }
}

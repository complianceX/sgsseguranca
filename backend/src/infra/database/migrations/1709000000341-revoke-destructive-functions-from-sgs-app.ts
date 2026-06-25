import { MigrationInterface, QueryRunner } from 'typeorm';

const isSqlite = (qr: QueryRunner) =>
  qr.connection.options.type === 'sqlite' ||
  qr.connection.options.type === 'better-sqlite3';

export class RevokeGdprFunctionsFromPublic1709000000341 implements MigrationInterface {
  name = 'RevokeGdprFunctionsFromPublic1709000000341';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (isSqlite(queryRunner)) {
      return;
    }

    // H-10: PostgreSQL concede EXECUTE a PUBLIC por padrão ao criar funções.
    // Revogar de PUBLIC para que apenas roles autorizados (sgs_app, owner) possam
    // invocar essas funções. sgs_app mantém EXECUTE pois GdprDeletionService e
    // UsersService chamam essas funções via conexão do aplicativo.
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
  }
}

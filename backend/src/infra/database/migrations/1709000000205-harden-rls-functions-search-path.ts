import { MigrationInterface, QueryRunner } from 'typeorm';

const isSqlite = (qr: QueryRunner) =>
  qr.connection.options.type === 'sqlite' ||
  qr.connection.options.type === 'better-sqlite3';

export class HardenRlsFunctionsSearchPath1709000000205 implements MigrationInterface {
  name = 'HardenRlsFunctionsSearchPath1709000000205';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (isSqlite(queryRunner)) {
      return;
    }

    // Recriar as 3 funções RLS com SET search_path = public, pg_temp
    // Nota: NÃO usar SECURITY DEFINER — funções RLS devem executar com
    // permissões do role chamador (sgs_app), não do owner.
    // SET search_path previne ataques de substituição de schema.

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION current_company()
      RETURNS uuid AS $$
      BEGIN
        RETURN current_setting('app.current_company_id', true)::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql STABLE SET search_path = public, pg_temp
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION is_super_admin()
      RETURNS boolean AS $$
      BEGIN
        RETURN coalesce(
          current_setting('app.is_super_admin', true)::boolean,
          false
        );
      EXCEPTION
        WHEN others THEN
          RETURN false;
      END;
      $$ LANGUAGE plpgsql STABLE SET search_path = public, pg_temp
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION current_user_role()
      RETURNS text AS $$
      BEGIN
        RETURN coalesce(
          current_setting('app.user_role', true)::text,
          'USER'
        );
      EXCEPTION
        WHEN others THEN
          RETURN 'USER';
      END;
      $$ LANGUAGE plpgsql STABLE SET search_path = public, pg_temp
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (isSqlite(queryRunner)) return;

    // Reverter para versão sem SET search_path (equivalente funcional)
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION current_company()
      RETURNS uuid AS $$
      BEGIN
        RETURN current_setting('app.current_company_id', true)::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql STABLE
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION is_super_admin()
      RETURNS boolean AS $$
      BEGIN
        RETURN coalesce(
          current_setting('app.is_super_admin', true)::boolean,
          false
        );
      EXCEPTION
        WHEN others THEN
          RETURN false;
      END;
      $$ LANGUAGE plpgsql STABLE
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION current_user_role()
      RETURNS text AS $$
      BEGIN
        RETURN coalesce(
          current_setting('app.user_role', true)::text,
          'USER'
        );
      EXCEPTION
        WHEN others THEN
          RETURN 'USER';
      END;
      $$ LANGUAGE plpgsql STABLE
    `);
  }
}

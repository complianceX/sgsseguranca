import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSuperAdminFunction1709000000015 implements MigrationInterface {
  name = 'AddSuperAdminFunction1709000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Função para verificar se é super admin
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION is_super_admin() 
      RETURNS boolean AS $$
      BEGIN 
        RETURN current_setting('app.is_super_admin', true)::boolean; 
      EXCEPTION 
        WHEN others THEN 
          RETURN false; 
      END; 
      $$ LANGUAGE plpgsql STABLE;
    `);

    // Função auxiliar para debug
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION current_user_role() 
      RETURNS text AS $$
      BEGIN 
        RETURN current_setting('app.user_role', true)::text; 
      EXCEPTION 
        WHEN others THEN 
          RETURN 'USER'; 
      END; 
      $$ LANGUAGE plpgsql STABLE;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION IF EXISTS is_super_admin();`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS current_user_role();`);
  }
}
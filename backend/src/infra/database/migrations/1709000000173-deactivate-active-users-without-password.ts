import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeactivateActiveUsersWithoutPassword1709000000173 implements MigrationInterface {
  name = 'DeactivateActiveUsersWithoutPassword1709000000173';

  public async up(_queryRunner: QueryRunner): Promise<void> {
    // No-op preservado por seguranca: sem senha local nao significa conta quebrada.
    // A classificacao explicita foi movida para a migration 1709000000189.
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op intencional: nao reverte classificacao nem status de usuarios.
  }
}

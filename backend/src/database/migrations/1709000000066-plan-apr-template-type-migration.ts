import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration de planejamento (NO-OP intencional).
 *
 * Não executa alterações automaticamente. O objetivo é registrar, versionar
 * e revisar com Produto antes de substituir os flags legados
 * (`is_modelo` + `is_modelo_padrao`) por `template_type`.
 */
export class PlanAprTemplateTypeMigration1709000000066 implements MigrationInterface {
  name = 'PlanAprTemplateTypeMigration1709000000066';

  public async up(_queryRunner: QueryRunner): Promise<void> {
    /**
     * SQL planejado (não executar automaticamente nesta fase):
     *
     * ALTER TABLE aprs ADD COLUMN template_type
     *   ENUM('none', 'company_template', 'system_template') DEFAULT 'none';
     *
     * -- População:
     * -- is_modelo=false                              -> 'none'
     * -- is_modelo=true AND is_modelo_padrao=false    -> 'company_template'
     * -- is_modelo=true AND is_modelo_padrao=true     -> 'system_template'
     *
     * -- Executar apenas após validação com time de produto.
     */
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // NO-OP intencional: esta migration não aplica mudança estrutural.
  }
}

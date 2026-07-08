import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migração: campos operacionais/normativos da PT (NR-33/NR-35).
 *
 * - fotos_evidencia: evidências fotográficas governadas da área (antes/durante/depois),
 *   array de referências `gst:pt-photo:` (nunca fileKey cru).
 * - medicoes_atmosfericas: leituras NR-33 para espaço confinado (O2, LEL, CO, H2S,
 *   hora, instrumento, responsável).
 * - epis_obrigatorios: lista de EPIs exigidos para a atividade.
 * - contato_emergencia / plano_resgate / ponto_encontro: dados de emergência e resgate.
 * - vigia_user_id / vigia_nome: vigia designado para espaço confinado (usuário ou nome livre).
 * - encerrado_por_id / data_hora_real_fim / condicao_area_encerramento /
 *   observacoes_encerramento: registro estruturado de devolução da PT
 *   (espelha o padrão aprovado_por_id/aprovado_em).
 *
 * Todas as colunas são nullable; RLS herdada da tabela pts (company_id).
 * Sem índices: campos consultados apenas no fetch da própria PT.
 */
export class AddPtFieldOperations1709000000343 implements MigrationInterface {
  name = 'AddPtFieldOperations1709000000343';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('pts');
    if (!tableExists) {
      console.warn('Table pts not found, skipping PT field operations columns');
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "pts"
      ADD COLUMN IF NOT EXISTS "fotos_evidencia" jsonb,
      ADD COLUMN IF NOT EXISTS "medicoes_atmosfericas" jsonb,
      ADD COLUMN IF NOT EXISTS "epis_obrigatorios" jsonb,
      ADD COLUMN IF NOT EXISTS "contato_emergencia" text,
      ADD COLUMN IF NOT EXISTS "plano_resgate" text,
      ADD COLUMN IF NOT EXISTS "ponto_encontro" text,
      ADD COLUMN IF NOT EXISTS "vigia_user_id" uuid,
      ADD COLUMN IF NOT EXISTS "vigia_nome" text,
      ADD COLUMN IF NOT EXISTS "encerrado_por_id" uuid,
      ADD COLUMN IF NOT EXISTS "data_hora_real_fim" timestamp,
      ADD COLUMN IF NOT EXISTS "condicao_area_encerramento" varchar,
      ADD COLUMN IF NOT EXISTS "observacoes_encerramento" text
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_pts_vigia_user_id'
            AND conrelid = 'pts'::regclass
        ) THEN
          ALTER TABLE "pts"
            ADD CONSTRAINT "FK_pts_vigia_user_id"
            FOREIGN KEY ("vigia_user_id")
            REFERENCES "users"("id")
            ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_pts_encerrado_por_id'
            AND conrelid = 'pts'::regclass
        ) THEN
          ALTER TABLE "pts"
            ADD CONSTRAINT "FK_pts_encerrado_por_id"
            FOREIGN KEY ("encerrado_por_id")
            REFERENCES "users"("id")
            ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('pts');
    if (!tableExists) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "pts" DROP CONSTRAINT IF EXISTS "FK_pts_encerrado_por_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "pts" DROP CONSTRAINT IF EXISTS "FK_pts_vigia_user_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "pts"
      DROP COLUMN IF EXISTS "observacoes_encerramento",
      DROP COLUMN IF EXISTS "condicao_area_encerramento",
      DROP COLUMN IF EXISTS "data_hora_real_fim",
      DROP COLUMN IF EXISTS "encerrado_por_id",
      DROP COLUMN IF EXISTS "vigia_nome",
      DROP COLUMN IF EXISTS "vigia_user_id",
      DROP COLUMN IF EXISTS "ponto_encontro",
      DROP COLUMN IF EXISTS "plano_resgate",
      DROP COLUMN IF EXISTS "contato_emergencia",
      DROP COLUMN IF EXISTS "epis_obrigatorios",
      DROP COLUMN IF EXISTS "medicoes_atmosfericas",
      DROP COLUMN IF EXISTS "fotos_evidencia"
    `);
  }
}

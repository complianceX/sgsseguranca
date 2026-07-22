import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Complemento da migration 351 — `inspections.deleted_at` para TIMESTAMPTZ.
 *
 * POR QUE FICOU DE FORA DA 351
 *   A lista de tabelas da 351 foi levantada a partir de um banco reconstruído do
 *   zero pelas migrations do repositório. `inspections` não aparece nesse banco,
 *   mas EXISTE no ambiente de produção (verificado: com RLS habilitado, três
 *   policies e coluna `company_id`), sendo referenciada pelo código em
 *   `dashboard-document-availability-snapshot.service.ts`. Após aplicar a 351,
 *   a verificação apontou exatamente uma coluna `deleted_at` remanescente como
 *   `timestamp without time zone`: a desta tabela.
 *
 *   A divergência em si (tabela presente no banco e ausente no schema gerado
 *   pelas migrations) é um ponto de higiene registrado no relatório da
 *   auditoria; esta migration apenas elimina a inconsistência de tipo, sem
 *   tentar reconstruir o histórico da tabela.
 *
 * CONVERSÃO
 *   Mesma cláusula da 351: `USING "deleted_at" AT TIME ZONE 'UTC'`, que
 *   interpreta o valor naive como relógio UTC independentemente do `TimeZone`
 *   da sessão que executa a migration. Confirmado que a produção reporta
 *   `TimeZone = GMT`, coerente com a premissa de que os valores naive gravados
 *   pela aplicação já são UTC.
 *
 * SEGURANÇA
 *   Idempotente em dois níveis: não faz nada se a tabela não existir (caso dos
 *   ambientes criados apenas pelas migrations) nem se a coluna já estiver no
 *   tipo alvo. Preserva policies de RLS em torno do ALTER, pois o PostgreSQL
 *   recusa alterar o tipo de coluna referenciada por policy.
 */
export class ConvertInspectionsDeletedAtTimestamptz1709000000352 implements MigrationInterface {
  name = 'ConvertInspectionsDeletedAtTimestamptz1709000000352';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.convert(queryRunner, 'TIMESTAMPTZ');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.convert(queryRunner, 'TIMESTAMP');
  }

  private async convert(
    queryRunner: QueryRunner,
    targetType: 'TIMESTAMPTZ' | 'TIMESTAMP',
  ): Promise<void> {
    await queryRunner.query(`
      DO $do$
      DECLARE
        current_type text;
        pol record;
        pol_defs text[] := ARRAY[]::text[];
        stmt text;
      BEGIN
        IF to_regclass('public.inspections') IS NULL THEN
          RETURN;
        END IF;

        SELECT data_type INTO current_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'inspections'
          AND column_name = 'deleted_at';

        IF current_type IS NULL THEN
          RETURN;
        END IF;

        IF ('${targetType}' = 'TIMESTAMPTZ' AND current_type = 'timestamp with time zone')
           OR ('${targetType}' = 'TIMESTAMP' AND current_type = 'timestamp without time zone') THEN
          RETURN;
        END IF;

        FOR pol IN
          SELECT policyname, permissive, roles, cmd, qual, with_check
          FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'inspections'
        LOOP
          pol_defs := pol_defs || format(
            'CREATE POLICY %I ON public.inspections AS %s FOR %s TO %s%s%s',
            pol.policyname,
            CASE WHEN pol.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
            pol.cmd,
            array_to_string(pol.roles, ', '),
            CASE WHEN pol.qual       IS NOT NULL THEN ' USING (' || pol.qual || ')' ELSE '' END,
            CASE WHEN pol.with_check IS NOT NULL THEN ' WITH CHECK (' || pol.with_check || ')' ELSE '' END
          );
          EXECUTE format('DROP POLICY %I ON public.inspections', pol.policyname);
        END LOOP;

        EXECUTE 'ALTER TABLE public.inspections ALTER COLUMN "deleted_at" TYPE ${targetType} USING "deleted_at" AT TIME ZONE ''UTC''';

        FOREACH stmt IN ARRAY pol_defs LOOP
          EXECUTE stmt;
        END LOOP;
      END
      $do$;
    `);
  }
}

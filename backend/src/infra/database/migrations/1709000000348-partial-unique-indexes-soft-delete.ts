import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FASE 1 (H1) — unicidade passa a considerar apenas registros ativos.
 *
 * PROBLEMA
 *   Onze índices/constraints UNIQUE ignoravam `deleted_at`. Como o SGS usa
 *   exclusão lógica, o valor de um registro excluído permanecia ocupando o
 *   espaço de unicidade para sempre:
 *
 *     - excluir uma empresa deixava o CNPJ bloqueado — impossível recadastrar;
 *     - excluir um RDO/CAT/Ordem de Serviço "queimava" o número;
 *     - excluir um dia/imagem de relatório fotográfico impedia recriá-lo na
 *       mesma data/ordem;
 *     - excluir uma credencial MFA impedia registrar outra do mesmo tipo;
 *     - excluir um usuário mantinha `auth_user_id` reservado.
 *
 * VERIFICAÇÕES FEITAS ANTES DA MUDANÇA
 *   1. Nenhuma FOREIGN KEY depende destes UNIQUE (todas referenciam PKs), então
 *      substituí-los por índices parciais não invalida integridade referencial.
 *   2. A numeração automática (ex.: `RdosService.generateNumero`) usa
 *      `createQueryBuilder`, que não aplica o filtro de exclusão lógica — o
 *      `MAX(numero)` continua enxergando registros excluídos e portanto não
 *      reutiliza número por conta própria. A mudança não introduz colisão no
 *      fluxo automático; apenas deixa de bloquear restauração e importação.
 *   3. A validação pública de documentos usa `document_registry.document_code`,
 *      não o `numero` das entidades — a rastreabilidade externa não depende
 *      desta unicidade.
 *   4. A proteção contra criação concorrente com o mesmo número permanece
 *      intacta: dois registros ATIVOS seguem barrados pelo índice parcial.
 *
 * ESTRATÉGIA
 *   Para cada caso: cria o índice parcial com CONCURRENTLY e só então remove o
 *   antigo. Em nenhum momento a tabela fica sem proteção de unicidade sobre os
 *   registros ativos. Quatro dos alvos são CONSTRAINT (não índice) e exigem
 *   `DROP CONSTRAINT` — constraints UNIQUE não suportam cláusula WHERE, por
 *   isso viram índice único parcial.
 *
 * REVERSÃO
 *   `down()` recria os índices/constraints globais e remove os parciais. A
 *   recriação pode falhar se, no intervalo, tiverem sido inseridos valores que
 *   colidem com registros excluídos — situação esperada, já que é exatamente o
 *   que a versão global proíbe.
 */
export class PartialUniqueIndexesSoftDelete1709000000348
  implements MigrationInterface
{
  name = 'PartialUniqueIndexesSoftDelete1709000000348';
  transaction = false;

  /** Alvos que hoje são ÍNDICE único simples. */
  private readonly indexTargets = [
    {
      table: 'cats',
      oldName: 'UQ_cats_company_numero',
      newName: 'UQ_cats_company_numero_active',
      columns: '("company_id", "numero")',
      extraWhere: null as string | null,
    },
    {
      table: 'rdos',
      oldName: 'UQ_rdos_company_numero',
      newName: 'UQ_rdos_company_numero_active',
      columns: '("company_id", "numero")',
      extraWhere: null,
    },
    {
      table: 'service_orders',
      oldName: 'UQ_service_orders_company_numero',
      newName: 'UQ_service_orders_company_numero_active',
      columns: '("company_id", "numero")',
      extraWhere: null,
    },
    {
      table: 'push_subscriptions',
      oldName: 'UQ_push_subscriptions_endpoint',
      newName: 'UQ_push_subscriptions_endpoint_active',
      columns: '("endpoint")',
      extraWhere: null,
    },
    {
      table: 'user_mfa_credentials',
      oldName: 'IDX_user_mfa_credentials_user_type',
      newName: 'IDX_user_mfa_credentials_user_type_active',
      columns: '("user_id", "type")',
      extraWhere: null,
    },
    {
      table: 'users',
      oldName: 'IDX_users_auth_user_id',
      newName: 'IDX_users_auth_user_id_active',
      columns: '("auth_user_id")',
      extraWhere: '"auth_user_id" IS NOT NULL',
    },
    {
      table: 'document_registry',
      oldName: 'UQ_document_registry_module_document_code_ci',
      newName: 'UQ_document_registry_module_document_code_ci_active',
      columns: '("module", upper("document_code"::text))',
      extraWhere: '"document_code" IS NOT NULL',
    },
  ];

  /** Alvos que hoje são CONSTRAINT UNIQUE (exigem DROP CONSTRAINT). */
  private readonly constraintTargets = [
    {
      table: 'companies',
      constraintName: 'companies_cnpj_key',
      newName: 'UQ_companies_cnpj_active',
      columns: '("cnpj")',
      extraWhere: null as string | null,
    },
    {
      table: 'document_registry',
      constraintName: 'UQ_document_registry_source',
      newName: 'UQ_document_registry_source_active',
      columns: '("module", "entity_id", "document_type")',
      extraWhere: null,
    },
    {
      table: 'photographic_report_days',
      constraintName: 'UQ_photographic_report_days_report_date',
      newName: 'UQ_photographic_report_days_report_date_active',
      columns: '("report_id", "activity_date")',
      extraWhere: null,
    },
    {
      table: 'photographic_report_images',
      constraintName: 'UQ_photographic_report_images_report_order',
      newName: 'UQ_photographic_report_images_report_order_active',
      columns: '("report_id", "image_order")',
      extraWhere: null,
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const t of this.indexTargets) {
      if (!(await this.tableReady(queryRunner, t.table))) continue;

      await this.createPartialUnique(
        queryRunner,
        t.table,
        t.newName,
        t.columns,
        t.extraWhere,
      );
      await queryRunner.query(
        `DROP INDEX CONCURRENTLY IF EXISTS "${t.oldName}"`,
      );
    }

    for (const t of this.constraintTargets) {
      if (!(await this.tableReady(queryRunner, t.table))) continue;

      await this.createPartialUnique(
        queryRunner,
        t.table,
        t.newName,
        t.columns,
        t.extraWhere,
      );
      // Remove a constraint (leva junto o índice global que a sustentava).
      await queryRunner.query(`
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = '${t.constraintName}'
              AND conrelid = 'public.${t.table}'::regclass
          ) THEN
            ALTER TABLE "${t.table}" DROP CONSTRAINT "${t.constraintName}";
          END IF;
        END $$;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const t of this.constraintTargets) {
      if (!(await this.tableReady(queryRunner, t.table))) continue;

      await queryRunner.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = '${t.constraintName}'
              AND conrelid = 'public.${t.table}'::regclass
          ) THEN
            ALTER TABLE "${t.table}"
              ADD CONSTRAINT "${t.constraintName}" UNIQUE ${t.columns};
          END IF;
        END $$;
      `);
      await queryRunner.query(
        `DROP INDEX CONCURRENTLY IF EXISTS "${t.newName}"`,
      );
    }

    for (const t of this.indexTargets) {
      if (!(await this.tableReady(queryRunner, t.table))) continue;

      const where = t.extraWhere ? ` WHERE ${t.extraWhere}` : '';
      await queryRunner.query(`
        CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "${t.oldName}"
        ON "${t.table}" ${t.columns}${where}
      `);
      await queryRunner.query(
        `DROP INDEX CONCURRENTLY IF EXISTS "${t.newName}"`,
      );
    }
  }

  /** Cria o índice único restrito a registros ativos. */
  private async createPartialUnique(
    queryRunner: QueryRunner,
    table: string,
    name: string,
    columns: string,
    extraWhere: string | null,
  ): Promise<void> {
    const predicate = extraWhere
      ? `"deleted_at" IS NULL AND ${extraWhere}`
      : `"deleted_at" IS NULL`;

    await queryRunner.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "${name}"
      ON "${table}" ${columns}
      WHERE ${predicate}
    `);
  }

  /** A tabela existe e possui a coluna de exclusão lógica? */
  private async tableReady(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<boolean> {
    if (!(await queryRunner.hasTable(table))) return false;
    return queryRunner.hasColumn(table, 'deleted_at');
  }
}

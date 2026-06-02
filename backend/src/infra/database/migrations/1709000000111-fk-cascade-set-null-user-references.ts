import { MigrationInterface, QueryRunner } from 'typeorm';

type DeleteRuleRow = {
  delete_rule?: string;
};

/**
 * FK Cascade: ON DELETE SET NULL para referências a usuários em documentos operacionais
 *
 * Problema: FKs para users sem ON DELETE defaultam para NO ACTION (RESTRICT).
 * Isso bloqueia hard-delete de usuários enquanto existirem documentos referenciando-os.
 *
 * Em um sistema safety-critical com soft delete:
 * - Usuários são desativados (deleted_at) e raramente hard-deleted.
 * - Quando um hard-delete é necessário (LGPD), a FK com NO ACTION bloqueia e
 *   força o admin a deletar todos os documentos do usuário primeiro — inaceitável.
 *
 * Solução: ON DELETE SET NULL preserva o documento operacional mas anonimiza
 * o vínculo com o usuário (quem auditou/aprovou/reprovou pode ser NULL após LGPD).
 *
 * Colunas afetadas (todas nullable no schema):
 *   aprs.auditado_por_id, reprovado_por_id
 *   dds.auditado_por_id
 *   pts.auditado_por_id, reprovado_por_id
 *   checklists.auditado_por_id
 *   trainings.auditado_por_id
 *   audits.auditor_id (não nullable — não alterado aqui, requer mudança de schema)
 *
 * Colunas JÁ com SET NULL (não precisam de alteração):
 *   aprs.aprovado_por_id, parent_apr_id, auditado_por_id (migration 002/006)
 *   apr_risk_evidences.uploaded_by
 */
export class FkCascadeSetNullUserReferences1709000000111 implements MigrationInterface {
  name = 'FkCascadeSetNullUserReferences1709000000111';

  private async alterFkToSetNull(
    queryRunner: QueryRunner,
    table: string,
    column: string,
    referencedTable: string,
    constraintName: string,
  ): Promise<void> {
    if (!(await queryRunner.hasTable(table))) return;
    if (!(await queryRunner.hasColumn(table, column))) return;

    // Verificar se a constraint atual NÃO é SET NULL (evita recriar desnecessariamente)
    const existing = (await queryRunner.query(
      `
      SELECT rc.delete_rule
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = rc.constraint_name
       AND kcu.constraint_schema = rc.constraint_schema
      WHERE kcu.table_name    = $1
        AND kcu.column_name   = $2
        AND rc.constraint_name = $3
      `,
      [table, column, constraintName],
    )) as DeleteRuleRow[];

    if (existing.length > 0 && existing[0].delete_rule === 'SET NULL') {
      return; // já está correto
    }

    // DROP + ADD com ON DELETE SET NULL
    await queryRunner.query(
      `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${constraintName}"`,
    );
    await queryRunner.query(`
      ALTER TABLE "${table}"
      ADD CONSTRAINT "${constraintName}"
      FOREIGN KEY ("${column}")
      REFERENCES "${referencedTable}"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `);
  }

  private async revertFkToNoAction(
    queryRunner: QueryRunner,
    table: string,
    column: string,
    referencedTable: string,
    constraintName: string,
  ): Promise<void> {
    if (!(await queryRunner.hasTable(table))) return;

    await queryRunner.query(
      `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${constraintName}"`,
    );
    await queryRunner.query(`
      ALTER TABLE "${table}"
      ADD CONSTRAINT "${constraintName}"
      FOREIGN KEY ("${column}")
      REFERENCES "${referencedTable}"("id")
      ON DELETE NO ACTION
      ON UPDATE NO ACTION
    `);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // aprs: auditado_por_id, reprovado_por_id
    await this.alterFkToSetNull(
      queryRunner,
      'aprs',
      'auditado_por_id',
      'users',
      'FK_aprs_auditado_por_id',
    );
    await this.alterFkToSetNull(
      queryRunner,
      'aprs',
      'reprovado_por_id',
      'users',
      'FK_aprs_reprovado_por_id',
    );

    // dds: auditado_por_id
    await this.alterFkToSetNull(
      queryRunner,
      'dds',
      'auditado_por_id',
      'users',
      'FK_dds_auditado_por_id',
    );

    // pts: auditado_por_id, reprovado_por_id
    await this.alterFkToSetNull(
      queryRunner,
      'pts',
      'auditado_por_id',
      'users',
      'FK_pts_auditado_por_id',
    );
    await this.alterFkToSetNull(
      queryRunner,
      'pts',
      'reprovado_por_id',
      'users',
      'FK_pts_reprovado_por_id',
    );

    // checklists: auditado_por_id
    await this.alterFkToSetNull(
      queryRunner,
      'checklists',
      'auditado_por_id',
      'users',
      'FK_checklists_auditado_por_id',
    );

    // trainings: auditado_por_id
    await this.alterFkToSetNull(
      queryRunner,
      'trainings',
      'auditado_por_id',
      'users',
      'FK_trainings_auditado_por_id',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.revertFkToNoAction(
      queryRunner,
      'aprs',
      'auditado_por_id',
      'users',
      'FK_aprs_auditado_por_id',
    );
    await this.revertFkToNoAction(
      queryRunner,
      'aprs',
      'reprovado_por_id',
      'users',
      'FK_aprs_reprovado_por_id',
    );
    await this.revertFkToNoAction(
      queryRunner,
      'dds',
      'auditado_por_id',
      'users',
      'FK_dds_auditado_por_id',
    );
    await this.revertFkToNoAction(
      queryRunner,
      'pts',
      'auditado_por_id',
      'users',
      'FK_pts_auditado_por_id',
    );
    await this.revertFkToNoAction(
      queryRunner,
      'pts',
      'reprovado_por_id',
      'users',
      'FK_pts_reprovado_por_id',
    );
    await this.revertFkToNoAction(
      queryRunner,
      'checklists',
      'auditado_por_id',
      'users',
      'FK_checklists_auditado_por_id',
    );
    await this.revertFkToNoAction(
      queryRunner,
      'trainings',
      'auditado_por_id',
      'users',
      'FK_trainings_auditado_por_id',
    );
  }
}

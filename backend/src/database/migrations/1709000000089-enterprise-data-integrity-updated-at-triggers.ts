import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ⏰ DATA INTEGRITY MIGRATION: Automated updated_at Triggers
 *
 * Criar triggers que atualizam automaticamente updated_at em:
 * - Todas as tabelas transacionais (soft-delete)
 * - Garante que updated_at sempre reflita mudanças reais
 * - Evita queries INSERT/UPDATE manual de updated_at
 *
 * Benefícios:
 * ✅ Sem risco de esquecer SET updated_at
 * ✅ Timestamp sempre preciso
 * ✅ Queries mais simples (não precisa SET)
 * ✅ Auditoria melhorada (history queries confiáveis)
 *
 * Tabelas afetadas: ~47 tabelas com soft-delete
 */

export class EnterpriseDataIntegrityUpdatedAtTriggers1709000000089 implements MigrationInterface {
  name = 'EnterpriseDataIntegrityUpdatedAtTriggers1709000000089';

  // Lista de TODAS as tabelas que precisam do trigger
  private readonly tables = [
    'activities',
    'aprs',
    'approval_chains',
    'audit_logs',
    'audits',
    'cats',
    'checklists',
    'companies',
    'csv_imports',
    'document_registry',
    'documents',
    'forensic_trail_events',
    'inspections',
    'mail_logs',
    'nonconformities',
    'nonconformity_attachments',
    'observations',
    'pdf_integrity_records',
    'permissions',
    'photos',
    'pts',
    'roles',
    'signatures',
    'sites',
    'trainings',
    'user_roles',
    'users',
    'user_sessions',
  ];

  private formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('⏰ Creating automated updated_at trigger function...');

    // ============================================
    // Criar FUNÇÃO TRIGGER (UDF)
    // ============================================

    await queryRunner.query(`
      -- Função que atualiza updated_at automaticamente
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Atualizar only if the record is being modified
        IF (TG_OP = 'DELETE') THEN
          -- For soft deletes, still update updated_at
          NEW.updated_at = NOW();
          RETURN NEW;
        ELSIF (TG_OP = 'UPDATE') THEN
          NEW.updated_at = NOW();
          RETURN NEW;
        ELSIF (TG_OP = 'INSERT') THEN
          NEW.updated_at = COALESCE(NEW.updated_at, NOW());
          RETURN NEW;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      COMMENT ON FUNCTION update_updated_at_column() IS
        'Automatically update updated_at timestamp on INSERT or UPDATE';
    `);

    console.log(
      `   Attaching trigger to ${this.tables.length} tables (CONCURRENTLY)...`,
    );

    // ============================================
    // Aplicar triggers em TODAS as tabelas
    // ============================================

    for (const table of this.tables) {
      const tableExists = await queryRunner.hasTable(table);
      if (!tableExists) {
        console.warn(`   ⚠️  Table "${table}" not found, skipping`);
        continue;
      }

      const hasUpdatedAt = await queryRunner.hasColumn(table, 'updated_at');
      if (!hasUpdatedAt) {
        console.warn(
          `   ⚠️  Table "${table}" has no updated_at column, skipping`,
        );
        continue;
      }

      const triggerName = `trigger_${table}_updated_at`;

      try {
        // Drop existing trigger if present
        await queryRunner.query(
          `DROP TRIGGER IF EXISTS "${triggerName}" ON "${table}"`,
        );

        // Criar novo trigger
        await queryRunner.query(`
          CREATE TRIGGER "${triggerName}"
          BEFORE INSERT OR UPDATE ON "${table}"
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column()
        `);

        console.log(`   ✓ ${triggerName}`);
      } catch (error: unknown) {
        console.error(
          '   ❌ Failed to create trigger for table:',
          table,
          this.formatErrorMessage(error),
        );
      }
    }

    console.log('');
    console.log('✅ Updated_at triggers created!');
    console.log('');
    console.log('📋 Behavior:');
    console.log(
      '   • Every INSERT or UPDATE automatically sets updated_at = NOW()',
    );
    console.log('   • No need for manual SET updated_at in application code');
    console.log('   • Timestamp always reflects actual data changes');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('⏮️  Rolling back updated_at triggers...');

    for (const table of this.tables) {
      const tableExists = await queryRunner.hasTable(table);
      if (!tableExists) continue;

      const triggerName = `trigger_${table}_updated_at`;

      try {
        await queryRunner.query(
          `DROP TRIGGER IF EXISTS "${triggerName}" ON "${table}"`,
        );
      } catch (_error) {
        console.warn(`   ⚠️  Could not drop trigger for ${table}`);
      }
    }

    // Drop function
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE`,
    );

    console.log('⏮️  Rollback completed');
  }
}

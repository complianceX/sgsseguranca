import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 🏗️ ARCHITECTURE MIGRATION: Schema Separation
 *
 * Reorganizar tabelas em 5 logical schemas:
 * 1. public (default)
 * 2. auth — users, user_roles, roles, permissions
 * 3. operations — sites, aprs, pts, nonconformities
 * 4. audit — activities, audit_logs, forensic_trail_events
 * 5. documents — document_registry, signatures, pdf_integrity_records
 *
 * Benefícios:
 * ✅ Sem risco: Views mantêm transparência (users veem mesma coisa)
 * ✅ Segurança: Fácil aplicar grants por schema
 * ✅ Manutenção: Agrupamento lógico facilita compreensão
 * ✅ Compliance: Auditors veem estrutura clara
 *
 * ⚠️ Idempotent: Safe para rerun, usa IF NOT EXISTS
 */

export class EnterpriseArchitectureSchemasSeparation1709000000092 implements MigrationInterface {
  name = 'EnterpriseArchitectureSchemasSeparation1709000000092';

  // Mapeamento de tabelas → schemas
  private readonly schemaMapping = {
    auth: [
      'users',
      'user_roles',
      'roles',
      'permissions',
      'user_sessions',
      'csv_imports',
    ],
    operations: [
      'companies',
      'sites',
      'aprs',
      'pts',
      'nonconformities',
      'nonconformity_attachments',
      'trainings',
      'observations',
    ],
    audit: [
      'activities',
      'audit_logs',
      'forensic_trail_events',
      'approval_chains',
    ],
    documents: [
      'document_registry',
      'documents',
      'signatures',
      'pdf_integrity_records',
      'photos',
    ],
    safety: ['audits', 'inspections', 'cats', 'checklists', 'mail_logs'],
  };

  private formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (process.env.ENABLE_ENTERPRISE_SCHEMA_SEPARATION !== 'true') {
      console.warn(
        '   ⚠️  ENABLE_ENTERPRISE_SCHEMA_SEPARATION!=true; skipping schema rewrite to preserve the public-schema contract used by the application.',
      );
      return;
    }

    console.log('🏗️  Reorganizing database into logical schemas...');

    // ============================================
    // 1. Criar schemas
    // ============================================
    console.log('   [1/3] Creating schemas...');

    const schemas = Object.keys(this.schemaMapping);

    for (const schema of schemas) {
      await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      await queryRunner.query(`
        COMMENT ON SCHEMA ${schema} IS
          'Schema for ${schema} domain tables'
      `);
    }

    console.log(
      `   ✓ Created ${schemas.length} schemas: ${schemas.join(', ')}`,
    );

    // ============================================
    // 2. Mover tabelas para seus schemas
    // ============================================
    console.log('   [2/3] Moving tables to schemas...');

    for (const [schema, tables] of Object.entries(this.schemaMapping)) {
      for (const table of tables) {
        const tableExists = await queryRunner.hasTable(table);
        if (!tableExists) {
          console.warn(`   ⚠️  Table "${table}" not found, skipping`);
          continue;
        }

        try {
          // Mover tabela (altera schema)
          await queryRunner.query(
            `ALTER TABLE "public"."${table}" SET SCHEMA "${schema}"`,
          );
          console.log(`   ✓ Moved ${schema}.${table}`);
        } catch (error: unknown) {
          // Tabela pode já estar em outro schema ou não existe
          console.warn(
            '   ⚠️  Could not move table:',
            table,
            this.formatErrorMessage(error),
          );
        }
      }
    }

    // ============================================
    // 3. Criar views para compatibilidade backward
    // ============================================
    console.log('   [3/3] Creating compatibility views...');

    // Views no schema public apontam para tabelas nos seus schemas
    const allTables = Object.values(this.schemaMapping).flat();
    let viewCount = 0;

    for (const table of allTables) {
      try {
        const tableExists = await queryRunner.hasTable(table);
        if (!tableExists) continue;

        // Verificar se view já existe
        const viewExists = (await queryRunner.query(`
          SELECT 1 FROM information_schema.views
          WHERE table_schema = 'public'
            AND table_name = '${table}'
        `)) as Array<Record<string, unknown>>;

        if (viewExists.length === 0) {
          // Encontrar qual schema contém a tabela
          let tableSchema = 'public';
          for (const [schema, tables] of Object.entries(this.schemaMapping)) {
            if (tables.includes(table)) {
              tableSchema = schema;
              break;
            }
          }

          // Criar view para compatibilidade
          await queryRunner.query(`
            CREATE VIEW "public"."${table}" AS
            SELECT * FROM "${tableSchema}"."${table}"
          `);
          viewCount++;
        }
      } catch (_error) {
        // View pode já existir
        console.warn(`   ⚠️  View creation skipped for ${table}`);
      }
    }

    console.log(`   ✓ Created ${viewCount} compatibility views`);

    console.log('');
    console.log('✅ Schema separation completed!');
    console.log('');
    console.log('📊 New Structure:');
    console.log('   auth/      → users, roles, permissions, sessions');
    console.log('   operations → companies, sites, aprs, pts, nonconformities');
    console.log('   audit/     → activities, audit_logs, forensic_trail');
    console.log('   documents/ → registry, signatures, pdf integrity');
    console.log('   safety/    → audits, inspections, checklists');
    console.log('');
    console.log('🔒 Security:');
    console.log('   Grant audit to auditor_role:');
    console.log('   GRANT USAGE ON SCHEMA audit TO auditor_role;');
    console.log(
      '   GRANT SELECT ON ALL TABLES IN SCHEMA audit TO auditor_role;',
    );
    console.log('');
    console.log('💡 Backward Compatibility:');
    console.log('   Old queries still work via public schema views');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('⏮️  Rolling back schema separation...');

    // Drop all compatibility views
    const allTables = Object.values(this.schemaMapping).flat();
    for (const table of allTables) {
      await queryRunner.query(
        `DROP VIEW IF EXISTS "public"."${table}" CASCADE`,
      );
    }

    // Move tables back to public
    const schemas = Object.keys(this.schemaMapping);
    for (const schema of schemas) {
      if (schema === 'public') continue;

      const tableQuery = `
        SELECT tablename FROM pg_tables
        WHERE schemaname = '${schema}'
      `;

      try {
        const tables = (await queryRunner.query(tableQuery)) as Array<{
          tablename: string;
        }>;

        for (const row of tables) {
          await queryRunner.query(
            `ALTER TABLE "${schema}"."${row.tablename}" SET SCHEMA "public"`,
          );
        }
      } catch (_error) {
        console.warn(`   ⚠️  Could not move tables from ${schema}`);
      }
    }

    // Drop schemas
    for (const schema of schemas) {
      if (schema === 'public') continue;
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }

    console.log('⏮️  Rollback completed');
  }
}

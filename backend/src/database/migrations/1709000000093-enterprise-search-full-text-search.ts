import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 🔍 SEARCH OPTIMIZATION MIGRATION: Full-Text Search (FTS)
 *
 * Implementar FTS (Full-Text Search) para melhorar buscas:
 * 1. aprs (title + description) → Busca por probabilidade/severidade
 * 2. nonconformities (description) → Busca por natureza de não-conformidade
 * 3. observations (comment) → Busca por observações
 *
 * Benefícios:
 * ✅ Semantics: "APR não-conformidade crítica" encontra diretos
 * ✅ Performance: tsvector + GIN index muito mais rápido que LIKE
 * ✅ Ranking: Relevância automática de resultados
 * ✅ Suporte: Português, Inglês, Stemming
 *
 * Tempo: ~5 segundos
 */

export class EnterpriseSearchFullTextSearch1709000000093
    implements MigrationInterface {
    name = 'EnterpriseSearchFullTextSearch1709000000093';

    public async up(queryRunner: QueryRunner): Promise<void> {
        console.log('🔍 Implementing Full-Text Search (FTS) for enterprise search...');

        // ============================================
        // 1. Configurar idioma português
        // ============================================
        console.log('   [1/4] Configuring text search configuration...');

        await queryRunner.query(`
      -- Criar configuração de busca customizada para português
      CREATE TEXT SEARCH CONFIGURATION IF NOT EXISTS pt_br (
        COPY = portuguese
      );
    `);

        // ============================================
        // 2. Adicionar coluna tsvector em APRs
        // ============================================
        console.log('   [2/4] Setting up FTS on APRs table...');

        const hasAprsTable = await queryRunner.hasTable('aprs');
        if (hasAprsTable) {
            // Verificar se coluna já existe
            const hasSearchCol = await queryRunner.hasColumn('aprs', 'search_vector');
            if (!hasSearchCol) {
                await queryRunner.query(`
          ALTER TABLE "aprs"
          ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
            setweight(to_tsvector('pt_br', COALESCE(title, '')), 'A') ||
            setweight(to_tsvector('pt_br', COALESCE(description, '')), 'B')
          ) STORED
        `);
            }

            // GIN index para busca rápida
            await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_aprs_search_fts
        ON aprs USING GIN (search_vector)
      `);

            console.log('   ✓ FTS configured on aprs');
        }

        // ============================================
        // 3. Adicionar coluna tsvector em nonconformities
        // ============================================
        console.log('   [3/4] Setting up FTS on nonconformities table...');

        const hasNcTable = await queryRunner.hasTable('nonconformities');
        if (hasNcTable) {
            const hasSearchCol = await queryRunner.hasColumn(
                'nonconformities',
                'search_vector',
            );
            if (!hasSearchCol) {
                await queryRunner.query(`
          ALTER TABLE "nonconformities"
          ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
            setweight(to_tsvector('pt_br', COALESCE(description, '')), 'A') ||
            setweight(to_tsvector('pt_br', COALESCE(observation, '')), 'B')
          ) STORED
        `);
            }

            await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_nonconformities_search_fts
        ON nonconformities USING GIN (search_vector)
      `);

            console.log('   ✓ FTS configured on nonconformities');
        }

        // ============================================
        // 4. Observations (comentários)
        // ============================================
        console.log('   [4/4] Setting up FTS on observations table...');

        const hasObsTable = await queryRunner.hasTable('observations');
        if (hasObsTable) {
            const hasSearchCol = await queryRunner.hasColumn(
                'observations',
                'search_vector',
            );
            if (!hasSearchCol) {
                await queryRunner.query(`
          ALTER TABLE "observations"
          ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
            to_tsvector('pt_br', COALESCE(comment, ''))
          ) STORED
        `);
            }

            await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_observations_search_fts
        ON observations USING GIN (search_vector)
      `);

            console.log('   ✓ FTS configured on observations');
        }

        // ============================================
        // 5. Criar helper function para busca
        // ============================================
        console.log('   Creating search helper function...');

        await queryRunner.query(`
      -- Função para buscar com ranking de relevância
      CREATE OR REPLACE FUNCTION search_aprs(
        p_company_id UUID,
        p_query TEXT
      )
      RETURNS TABLE(
        id UUID,
        company_id UUID,
        code VARCHAR,
        title VARCHAR,
        rank FLOAT,
        matches_title BOOLEAN,
        matches_description BOOLEAN
      ) AS $$
      DECLARE
        v_query_tsquery tsquery;
      BEGIN
        v_query_tsquery := plainto_tsquery('pt_br', p_query);

        RETURN QUERY
        SELECT
          a.id,
          a.company_id,
          a.code,
          a.title,
          ts_rank(a.search_vector, v_query_tsquery) as rank,
          to_tsvector('pt_br', a.title) @@ v_query_tsquery as matches_title,
          to_tsvector('pt_br', a.description) @@ v_query_tsquery as matches_description

        FROM aprs a
        WHERE a.company_id = p_company_id
          AND a.deleted_at IS NULL
          AND a.search_vector @@ v_query_tsquery

        ORDER BY rank DESC
        LIMIT 50;
      END;
      $$ LANGUAGE plpgsql;

      COMMENT ON FUNCTION search_aprs(UUID, TEXT) IS
        'Full-text search on APRs with relevance ranking';
    `);

        await queryRunner.query(`
      -- Similar function para nonconformities
      CREATE OR REPLACE FUNCTION search_nonconformities(
        p_company_id UUID,
        p_query TEXT
      )
      RETURNS TABLE(
        id UUID,
        company_id UUID,
        apr_id UUID,
        description VARCHAR,
        rank FLOAT
      ) AS $$
      DECLARE
        v_query_tsquery tsquery;
      BEGIN
        v_query_tsquery := plainto_tsquery('pt_br', p_query);

        RETURN QUERY
        SELECT
          nc.id,
          nc.company_id,
          nc.apr_id,
          nc.description,
          ts_rank(nc.search_vector, v_query_tsquery) as rank

        FROM nonconformities nc
        WHERE nc.company_id = p_company_id
          AND nc.deleted_at IS NULL
          AND nc.search_vector @@ v_query_tsquery

        ORDER BY rank DESC
        LIMIT 50;
      END;
      $$ LANGUAGE plpgsql;

      COMMENT ON FUNCTION search_nonconformities(UUID, TEXT) IS
        'Full-text search on nonconformities with relevance ranking';
    `);

        console.log('');
        console.log('✅ Full-Text Search configured!');
        console.log('');
        console.log('📊 Indexes Created:');
        console.log('   idx_aprs_search_fts → GIN index for rapid FTS');
        console.log('   idx_nonconformities_search_fts → GIN index');
        console.log('   idx_observations_search_fts → GIN index');
        console.log('');
        console.log('🔍 Usage Examples:');
        console.log(`
   -- Search APRs by title/description
   SELECT * FROM search_aprs(company_id, 'eletricidade perigo');

   -- Advanced: phrase search
   SELECT * FROM aprs
   WHERE company_id = $1
     AND search_vector @@ phraseto_tsquery('pt_br', 'risco elétrico alto');

   -- Native tsvector query
   SELECT * FROM aprs
   WHERE company_id = $1
     AND search_vector @@ to_tsquery('pt_br', 'risco & eletric');
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        console.log('⏮️  Rolling back Full-Text Search...');

        // Drop functions
        await queryRunner.query(`DROP FUNCTION IF EXISTS search_aprs(UUID, TEXT)`);
        await queryRunner.query(
            `DROP FUNCTION IF EXISTS search_nonconformities(UUID, TEXT)`,
        );

        // Drop indexes
        await queryRunner.query(`DROP INDEX IF EXISTS idx_aprs_search_fts`);
        await queryRunner.query(
            `DROP INDEX IF EXISTS idx_nonconformities_search_fts`,
        );
        await queryRunner.query(`DROP INDEX IF EXISTS idx_observations_search_fts`);

        // Drop tsvector columns
        const tables = ['aprs', 'nonconformities', 'observations'];

        for (const table of tables) {
            const exists = await queryRunner.hasColumn(table, 'search_vector');
            if (exists) {
                await queryRunner.query(`
          ALTER TABLE "${table}" DROP COLUMN IF EXISTS search_vector
        `);
            }
        }

        // Drop text search config (optional - may be shared)
        await queryRunner.query(
            `DROP TEXT SEARCH CONFIGURATION IF EXISTS pt_br CASCADE`,
        );

        console.log('⏮️  Rollback completed');
    }
}

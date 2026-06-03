import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cria o sistema de consentimentos versionado (LGPD Art. 8).
 *
 * Resolve achado A2/A13/A17 da auditoria: flag booleana única sem versionamento
 * nem prova material. Passa a persistir:
 *
 *  - consent_versions: texto vigente de cada tipo de consentimento, com hash
 *    imutável. Permite provar qual versão o titular aceitou.
 *  - user_consents: um registro por aceite/revogação, com IP, user-agent,
 *    timestamp e company_id para isolamento multi-tenant.
 *
 * Tipos previstos: privacy, terms, cookies, ai_processing, marketing.
 *
 * RLS: user_consents herda isolamento por company_id; consent_versions é
 * global (mesmos textos jurídicos para todos tenants) e não ativa RLS.
 */
export class CreateConsentTables1709000000143 implements MigrationInterface {
  name = 'CreateConsentTables1709000000143';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "consent_versions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "type" varchar(64) NOT NULL,
        "version_label" varchar(64) NOT NULL,
        "body_md" text NOT NULL,
        "body_hash" varchar(128) NOT NULL,
        "summary" text,
        "effective_at" timestamp with time zone NOT NULL DEFAULT NOW(),
        "retired_at" timestamp with time zone,
        "created_at" timestamp with time zone NOT NULL DEFAULT NOW(),
        "updated_at" timestamp with time zone NOT NULL DEFAULT NOW(),
        CONSTRAINT "UQ_consent_versions_type_version" UNIQUE ("type", "version_label")
      )
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "consent_versions" IS
      'Versoes imutaveis de textos juridicos aceitos pelos titulares. Nunca apagar; marcar retired_at ao publicar nova versao.';
    `);

    // Apenas uma versão vigente (retired_at IS NULL) por tipo.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_consent_versions_one_active_per_type"
      ON "consent_versions" ("type")
      WHERE "retired_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_consent_versions_type_effective"
      ON "consent_versions" ("type", "effective_at" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_consents" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "company_id" uuid NOT NULL,
        "type" varchar(64) NOT NULL,
        "version_id" uuid NOT NULL REFERENCES "consent_versions"("id") ON DELETE RESTRICT,
        "accepted_at" timestamp with time zone,
        "accepted_ip" varchar(64),
        "accepted_user_agent" text,
        "revoked_at" timestamp with time zone,
        "revoked_ip" varchar(64),
        "revoked_user_agent" text,
        "migrated_from_legacy" boolean NOT NULL DEFAULT false,
        "notes" text,
        "created_at" timestamp with time zone NOT NULL DEFAULT NOW(),
        "updated_at" timestamp with time zone NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "user_consents" IS
      'Prova material de aceite/revogacao de consentimentos por usuario. Cada linha e um evento imutavel; revogacao cria nova linha com mesmo type e diferente estado.';
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_consents_user_type_created"
      ON "user_consents" ("user_id", "type", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_consents_company_type"
      ON "user_consents" ("company_id", "type")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_consents_version"
      ON "user_consents" ("version_id")
    `);

    // Trigger de updated_at (padrão do projeto).
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_consent_versions_updated_at ON "consent_versions"
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_consent_versions_updated_at
      BEFORE UPDATE ON "consent_versions"
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column()
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_user_consents_updated_at ON "user_consents"
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_user_consents_updated_at
      BEFORE UPDATE ON "user_consents"
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column()
    `);

    // RLS em user_consents (isolamento por tenant — reusa helpers existentes do projeto).
    await queryRunner.query(
      `ALTER TABLE "user_consents" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_consents" FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_user_consents" ON "user_consents"
    `);
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_user_consents"
      ON "user_consents"
      AS RESTRICTIVE
      FOR ALL
      USING (
        company_id = current_company()
        OR is_super_admin() = true
      )
      WITH CHECK (
        company_id = current_company()
        OR is_super_admin() = true
      )
    `);

    // Backfill de ai_processing_consent dos usuarios existentes.
    // Precisa de uma versao "legada" primeiro: inserida via seed no proximo boot,
    // mas criamos uma linha placeholder caso o seed ainda nao tenha rodado.
    await queryRunner.query(`
      INSERT INTO "consent_versions" ("type", "version_label", "body_md", "body_hash", "summary", "effective_at")
      VALUES (
        'ai_processing',
        'legacy-bootstrap',
        'Versao bootstrap criada durante migracao 1709000000143. Representa aceites anteriores ao sistema de consent_versions. Deve ser substituida por versao formal via seed.',
        'legacy-bootstrap',
        'Bootstrap para backfill de ai_processing_consent legado.',
        NOW() - INTERVAL '1 year'
      )
      ON CONFLICT ("type", "version_label") DO NOTHING
    `);

    // Backfill: cria user_consents para cada usuario com ai_processing_consent=true.
    // Sem prova material de IP/timestamp porque o dado legado nao existe -
    // marcamos migrated_from_legacy=true para auditoria futura.
    await queryRunner.query(`
      INSERT INTO "user_consents" (
        "user_id", "company_id", "type", "version_id",
        "accepted_at", "migrated_from_legacy", "notes"
      )
      SELECT
        u.id,
        u.company_id,
        'ai_processing',
        (SELECT id FROM "consent_versions"
          WHERE type = 'ai_processing' AND version_label = 'legacy-bootstrap'
          LIMIT 1),
        u.updated_at,
        true,
        'Backfill a partir de users.ai_processing_consent=true. Sem IP/UA originais.'
      FROM "users" u
      WHERE u.ai_processing_consent = true
        AND u.deleted_at IS NULL
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_user_consents_updated_at ON "user_consents"`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_consent_versions_updated_at ON "consent_versions"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "user_consents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "consent_versions"`);
  }
}

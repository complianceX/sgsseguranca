import { MigrationInterface, QueryRunner } from 'typeorm';

type SignatureDocumentBinding = {
  tableName: string;
  documentTypes: string[];
};

const SITE_SCOPED_SIGNATURE_DOCUMENT_BINDINGS: SignatureDocumentBinding[] = [
  { tableName: 'aprs', documentTypes: ['apr'] },
  { tableName: 'pts', documentTypes: ['pt'] },
  { tableName: 'dds', documentTypes: ['dds'] },
  { tableName: 'arrs', documentTypes: ['arr', 'analise_de_risco_rapida'] },
  { tableName: 'dids', documentTypes: ['did', 'dialogo_inicio_dia'] },
  { tableName: 'checklists', documentTypes: ['checklist'] },
  { tableName: 'inspections', documentTypes: ['inspection', 'inspecao'] },
  { tableName: 'cats', documentTypes: ['cat'] },
  {
    tableName: 'nonconformities',
    documentTypes: [
      'nonconformity',
      'nao_conformidade',
      'não_conformidade',
      'nao conformidade',
      'não conformidade',
      'nc',
    ],
  },
  { tableName: 'audits', documentTypes: ['audit', 'auditoria'] },
  { tableName: 'rdos', documentTypes: ['rdo'] },
];

export class AddSignaturesSiteScope1709000000214 implements MigrationInterface {
  name = 'AddSignaturesSiteScope1709000000214';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('signatures'))) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "signatures"
      ADD COLUMN IF NOT EXISTS "site_id" uuid
    `);

    await this.backfillDocumentBoundSiteIds(queryRunner);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_signatures_site_id'
        ) THEN
          ALTER TABLE "signatures"
          ADD CONSTRAINT "FK_signatures_site_id"
          FOREIGN KEY ("site_id") REFERENCES "sites"("id")
          ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_signatures_company_site_created_at"
      ON "signatures" ("company_id", "site_id", "created_at" DESC)
      WHERE "site_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_signatures_document_company_site"
      ON "signatures" ("document_type", "document_id", "company_id", "site_id")
    `);

    await this.recreateDocumentScopeTrigger(queryRunner);
    await this.ensureSiteScopeFunctions(queryRunner);

    await queryRunner.query(`
      ALTER TABLE "signatures" ENABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      ALTER TABLE "signatures" FORCE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS "site_scope_isolation_policy" ON "signatures"
    `);

    await queryRunner.query(`
      CREATE POLICY "site_scope_isolation_policy"
      ON "signatures"
      AS RESTRICTIVE
      FOR ALL
      USING (
        is_super_admin() = true
        OR (
          company_id = current_company()
          AND (
            current_site_scope() = 'all'
            OR site_id = current_site_id()
          )
        )
      )
      WITH CHECK (
        is_super_admin() = true
        OR (
          company_id = current_company()
          AND (
            current_site_scope() = 'all'
            OR site_id = current_site_id()
          )
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('signatures'))) {
      return;
    }

    await queryRunner.query(`
      DROP POLICY IF EXISTS "site_scope_isolation_policy" ON "signatures"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_signatures_document_company_site"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_signatures_company_site_created_at"
    `);

    await this.recreateCompanyOnlyTrigger(queryRunner);

    await queryRunner.query(`
      ALTER TABLE "signatures"
      DROP CONSTRAINT IF EXISTS "FK_signatures_site_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "signatures"
      DROP COLUMN IF EXISTS "site_id"
    `);
  }

  private async backfillDocumentBoundSiteIds(
    queryRunner: QueryRunner,
  ): Promise<void> {
    for (const binding of SITE_SCOPED_SIGNATURE_DOCUMENT_BINDINGS) {
      if (
        !(await queryRunner.hasTable(binding.tableName)) ||
        !(await queryRunner.hasColumn(binding.tableName, 'site_id'))
      ) {
        continue;
      }

      await queryRunner.query(
        `
          UPDATE "signatures" s
             SET "company_id" = d."company_id",
                 "site_id" = d."site_id"
            FROM "${binding.tableName}" d
           WHERE s."document_id" = d."id"::text
             AND lower(trim(s."document_type")) = ANY($1::text[])
             AND (
               s."company_id" IS DISTINCT FROM d."company_id"
               OR s."site_id" IS DISTINCT FROM d."site_id"
             )
        `,
        [binding.documentTypes],
      );
    }

    if (
      (await queryRunner.hasTable('trainings')) &&
      (await queryRunner.hasTable('users'))
    ) {
      await queryRunner.query(`
        UPDATE "signatures" s
           SET "company_id" = t."company_id",
               "site_id" = u."site_id"
          FROM "trainings" t
          LEFT JOIN "users" u ON u."id" = t."user_id"
         WHERE s."document_id" = t."id"::text
           AND lower(trim(s."document_type")) = ANY(ARRAY['training', 'treinamento'])
           AND (
             s."company_id" IS DISTINCT FROM t."company_id"
             OR s."site_id" IS DISTINCT FROM u."site_id"
           )
      `);
    }
  }

  private async ensureSiteScopeFunctions(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.current_site_id()
      RETURNS uuid AS $$
      BEGIN
        RETURN current_setting('app.current_site_id', true)::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql STABLE
         SET search_path = public;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.current_site_scope()
      RETURNS text AS $$
      DECLARE
        scope_value text;
      BEGIN
        scope_value := current_setting('app.current_site_scope', true);
        IF scope_value IS NULL OR scope_value = '' THEN
          RETURN 'all';
        END IF;
        RETURN lower(scope_value);
      EXCEPTION
        WHEN others THEN
          RETURN 'all';
      END;
      $$ LANGUAGE plpgsql STABLE
         SET search_path = public;
    `);
  }

  private async recreateDocumentScopeTrigger(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION sync_signatures_company_id()
      RETURNS TRIGGER AS $$
      DECLARE
        resolved_company_id uuid;
        resolved_site_id uuid;
        fallback_company_id uuid;
        fallback_site_id uuid;
        document_uuid uuid;
        normalized_type text;
      BEGIN
        normalized_type := lower(trim(coalesce(NEW."document_type", '')));

        IF NEW."document_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          document_uuid := NEW."document_id"::uuid;
        END IF;

        IF document_uuid IS NOT NULL THEN
          IF normalized_type = 'apr' THEN
            SELECT "company_id", "site_id" INTO resolved_company_id, resolved_site_id
              FROM "aprs"
             WHERE "id" = document_uuid;
          ELSIF normalized_type = 'pt' THEN
            SELECT "company_id", "site_id" INTO resolved_company_id, resolved_site_id
              FROM "pts"
             WHERE "id" = document_uuid;
          ELSIF normalized_type = 'dds' THEN
            SELECT "company_id", "site_id" INTO resolved_company_id, resolved_site_id
              FROM "dds"
             WHERE "id" = document_uuid;
          ELSIF normalized_type IN ('arr', 'analise_de_risco_rapida') THEN
            SELECT "company_id", "site_id" INTO resolved_company_id, resolved_site_id
              FROM "arrs"
             WHERE "id" = document_uuid;
          ELSIF normalized_type IN ('did', 'dialogo_inicio_dia') THEN
            SELECT "company_id", "site_id" INTO resolved_company_id, resolved_site_id
              FROM "dids"
             WHERE "id" = document_uuid;
          ELSIF normalized_type = 'checklist' THEN
            SELECT "company_id", "site_id" INTO resolved_company_id, resolved_site_id
              FROM "checklists"
             WHERE "id" = document_uuid;
          ELSIF normalized_type IN ('inspection', 'inspecao') THEN
            SELECT "company_id", "site_id" INTO resolved_company_id, resolved_site_id
              FROM "inspections"
             WHERE "id" = document_uuid;
          ELSIF normalized_type = 'cat' THEN
            SELECT "company_id", "site_id" INTO resolved_company_id, resolved_site_id
              FROM "cats"
             WHERE "id" = document_uuid;
          ELSIF normalized_type IN (
            'nonconformity',
            'nao_conformidade',
            'não_conformidade',
            'nao conformidade',
            'não conformidade',
            'nc'
          ) THEN
            SELECT "company_id", "site_id" INTO resolved_company_id, resolved_site_id
              FROM "nonconformities"
             WHERE "id" = document_uuid;
          ELSIF normalized_type IN ('audit', 'auditoria') THEN
            SELECT "company_id", "site_id" INTO resolved_company_id, resolved_site_id
              FROM "audits"
             WHERE "id" = document_uuid;
          ELSIF normalized_type = 'rdo' THEN
            SELECT "company_id", "site_id" INTO resolved_company_id, resolved_site_id
              FROM "rdos"
             WHERE "id" = document_uuid;
          ELSIF normalized_type IN ('training', 'treinamento') THEN
            SELECT t."company_id", u."site_id" INTO resolved_company_id, resolved_site_id
              FROM "trainings" t
              LEFT JOIN "users" u ON u."id" = t."user_id"
             WHERE t."id" = document_uuid;
          END IF;
        END IF;

        IF resolved_company_id IS NOT NULL THEN
          NEW."company_id" := resolved_company_id;
          NEW."site_id" := resolved_site_id;
          RETURN NEW;
        END IF;

        IF NEW."company_id" IS NULL OR NEW."site_id" IS NULL THEN
          SELECT "company_id", "site_id"
            INTO fallback_company_id, fallback_site_id
          FROM "users"
          WHERE "id" = NEW."user_id";

          IF NEW."company_id" IS NULL THEN
            NEW."company_id" := fallback_company_id;
          END IF;

          IF NEW."site_id" IS NULL THEN
            NEW."site_id" := fallback_site_id;
          END IF;
        END IF;

        IF NEW."company_id" IS NULL THEN
          RAISE EXCEPTION
            'signatures.company_id could not be resolved for document %/% or user %',
            NEW."document_type",
            NEW."document_id",
            NEW."user_id";
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
         SET search_path = public;
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trigger_signatures_sync_company_id"
      ON "signatures"
    `);

    await queryRunner.query(`
      CREATE TRIGGER "trigger_signatures_sync_company_id"
      BEFORE INSERT OR UPDATE ON "signatures"
      FOR EACH ROW
      EXECUTE FUNCTION sync_signatures_company_id();
    `);
  }

  private async recreateCompanyOnlyTrigger(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION sync_signatures_company_id()
      RETURNS TRIGGER AS $$
      DECLARE
        resolved_company_id uuid;
        document_uuid uuid;
        normalized_type text;
      BEGIN
        normalized_type := lower(trim(coalesce(NEW."document_type", '')));

        IF NEW."document_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          document_uuid := NEW."document_id"::uuid;
        END IF;

        IF document_uuid IS NOT NULL THEN
          IF normalized_type = 'apr' THEN
            SELECT "company_id" INTO resolved_company_id
              FROM "aprs"
             WHERE "id" = document_uuid;
          ELSIF normalized_type = 'pt' THEN
            SELECT "company_id" INTO resolved_company_id
              FROM "pts"
             WHERE "id" = document_uuid;
          ELSIF normalized_type = 'dds' THEN
            SELECT "company_id" INTO resolved_company_id
              FROM "dds"
             WHERE "id" = document_uuid;
          ELSIF normalized_type IN ('arr', 'analise_de_risco_rapida') THEN
            SELECT "company_id" INTO resolved_company_id
              FROM "arrs"
             WHERE "id" = document_uuid;
          ELSIF normalized_type IN ('did', 'dialogo_inicio_dia') THEN
            SELECT "company_id" INTO resolved_company_id
              FROM "dids"
             WHERE "id" = document_uuid;
          ELSIF normalized_type = 'checklist' THEN
            SELECT "company_id" INTO resolved_company_id
              FROM "checklists"
             WHERE "id" = document_uuid;
          ELSIF normalized_type = 'cat' THEN
            SELECT "company_id" INTO resolved_company_id
              FROM "cats"
             WHERE "id" = document_uuid;
          ELSIF normalized_type IN (
            'nonconformity',
            'nao_conformidade',
            'não_conformidade',
            'nao conformidade',
            'não conformidade',
            'nc'
          ) THEN
            SELECT "company_id" INTO resolved_company_id
              FROM "nonconformities"
             WHERE "id" = document_uuid;
          ELSIF normalized_type IN ('audit', 'auditoria') THEN
            SELECT "company_id" INTO resolved_company_id
              FROM "audits"
             WHERE "id" = document_uuid;
          ELSIF normalized_type = 'rdo' THEN
            SELECT "company_id" INTO resolved_company_id
              FROM "rdos"
             WHERE "id" = document_uuid;
          ELSIF normalized_type IN ('training', 'treinamento') THEN
            SELECT "company_id" INTO resolved_company_id
              FROM "trainings"
             WHERE "id" = document_uuid;
          END IF;
        END IF;

        IF resolved_company_id IS NOT NULL THEN
          NEW."company_id" := resolved_company_id;
          RETURN NEW;
        END IF;

        IF NEW."company_id" IS NOT NULL THEN
          RETURN NEW;
        END IF;

        SELECT "company_id"
          INTO NEW."company_id"
        FROM "users"
        WHERE "id" = NEW."user_id";

        IF NEW."company_id" IS NULL THEN
          RAISE EXCEPTION
            'signatures.company_id could not be resolved for document %/% or user %',
            NEW."document_type",
            NEW."document_id",
            NEW."user_id";
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
         SET search_path = public;
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trigger_signatures_sync_company_id"
      ON "signatures"
    `);

    await queryRunner.query(`
      CREATE TRIGGER "trigger_signatures_sync_company_id"
      BEFORE INSERT OR UPDATE ON "signatures"
      FOR EACH ROW
      EXECUTE FUNCTION sync_signatures_company_id();
    `);
  }
}

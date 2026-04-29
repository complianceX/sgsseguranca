import { MigrationInterface, QueryRunner } from 'typeorm';

type SignatureDocumentBinding = {
  tableName: string;
  documentTypes: string[];
};

const SIGNATURE_DOCUMENT_BINDINGS: SignatureDocumentBinding[] = [
  { tableName: 'aprs', documentTypes: ['apr'] },
  { tableName: 'pts', documentTypes: ['pt'] },
  { tableName: 'dds', documentTypes: ['dds'] },
  { tableName: 'checklists', documentTypes: ['checklist'] },
  {
    tableName: 'inspections',
    documentTypes: ['inspection', 'inspecao', 'inspeção'],
  },
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
  { tableName: 'trainings', documentTypes: ['training', 'treinamento'] },
];

export class FixSignaturesDocumentTenantBinding1709000000180 implements MigrationInterface {
  name = 'FixSignaturesDocumentTenantBinding1709000000180';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('signatures'))) {
      return;
    }

    await this.recreateDocumentBoundTrigger(queryRunner);
    await this.backfillDocumentBoundCompanyIds(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('signatures'))) {
      return;
    }

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION sync_signatures_company_id()
      RETURNS TRIGGER AS $$
      BEGIN
        SELECT "company_id"
          INTO NEW."company_id"
        FROM "users"
        WHERE "id" = NEW."user_id";

        IF NEW."company_id" IS NULL THEN
          RAISE EXCEPTION
            'signatures.company_id could not be resolved for user %',
            NEW."user_id";
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }

  private async recreateDocumentBoundTrigger(
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
          ELSIF normalized_type = 'checklist' THEN
            SELECT "company_id" INTO resolved_company_id
              FROM "checklists"
             WHERE "id" = document_uuid;
          ELSIF normalized_type IN ('inspection', 'inspecao', 'inspeção') THEN
            SELECT "company_id" INTO resolved_company_id
              FROM "inspections"
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
      $$ LANGUAGE plpgsql;
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

  private async backfillDocumentBoundCompanyIds(
    queryRunner: QueryRunner,
  ): Promise<void> {
    for (const binding of SIGNATURE_DOCUMENT_BINDINGS) {
      if (!(await queryRunner.hasTable(binding.tableName))) {
        continue;
      }

      await queryRunner.query(
        `
          UPDATE "signatures" s
             SET "company_id" = d."company_id"
            FROM "${binding.tableName}" d
           WHERE s."document_id" = d."id"::text
             AND lower(s."document_type") = ANY($1)
             AND s."company_id" IS DISTINCT FROM d."company_id"
        `,
        [binding.documentTypes],
      );
    }
  }
}

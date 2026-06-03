import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateForensicTrailEvents1709000000060 implements MigrationInterface {
  name = 'CreateForensicTrailEvents1709000000060';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "forensic_trail_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "stream_key" character varying(255) NOT NULL,
        "stream_sequence" integer NOT NULL,
        "event_type" character varying(100) NOT NULL,
        "module" character varying(50) NOT NULL,
        "entity_id" character varying(120) NOT NULL,
        "company_id" character varying(120),
        "user_id" character varying(120),
        "request_id" character varying(120),
        "ip" character varying(120),
        "user_agent" text,
        "metadata" jsonb,
        "previous_event_hash" character varying(64),
        "event_hash" character varying(64) NOT NULL,
        "occurred_at" TIMESTAMP NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_forensic_trail_events_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_forensic_trail_events_stream_sequence"
      ON "forensic_trail_events" ("stream_key", "stream_sequence")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_forensic_trail_events_event_hash"
      ON "forensic_trail_events" ("event_hash")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_forensic_trail_events_company_module_entity_created"
      ON "forensic_trail_events" ("company_id", "module", "entity_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_forensic_trail_mutation()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forensic_trail_events is append-only';
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_forensic_trail_events_append_only" ON "forensic_trail_events"
    `);

    await queryRunner.query(`
      CREATE TRIGGER "TRG_forensic_trail_events_append_only"
      BEFORE UPDATE OR DELETE ON "forensic_trail_events"
      FOR EACH ROW
      EXECUTE FUNCTION prevent_forensic_trail_mutation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_forensic_trail_events_append_only" ON "forensic_trail_events"
    `);

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS prevent_forensic_trail_mutation
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_forensic_trail_events_company_module_entity_created"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_forensic_trail_events_event_hash"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_forensic_trail_events_stream_sequence"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "forensic_trail_events"
    `);
  }
}

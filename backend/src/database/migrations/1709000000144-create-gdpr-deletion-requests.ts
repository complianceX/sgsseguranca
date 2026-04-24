import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGdprDeletionRequests1709000000144
  implements MigrationInterface
{
  name = 'CreateGdprDeletionRequests1709000000144';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS gdpr_deletion_requests (
        id                UUID          PRIMARY KEY,
        user_id           UUID          NOT NULL,
        request_date      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        status            VARCHAR(20)   NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
        tables_processed  JSONB         NOT NULL DEFAULT '[]',
        error_message     TEXT,
        completed_date    TIMESTAMPTZ,
        created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_gdpr_deletion_requests_user_id
        ON gdpr_deletion_requests (user_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_gdpr_deletion_requests_status
        ON gdpr_deletion_requests (status)
        WHERE status IN ('pending', 'in_progress')
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_gdpr_deletion_requests_updated_at
        BEFORE UPDATE ON gdpr_deletion_requests
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    await queryRunner.query(`
      COMMENT ON TABLE gdpr_deletion_requests IS
        'Audit log of LGPD/GDPR data erasure requests — persists request status across restarts (replaces in-memory Map).'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_gdpr_deletion_requests_updated_at ON gdpr_deletion_requests`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS gdpr_deletion_requests`);
  }
}

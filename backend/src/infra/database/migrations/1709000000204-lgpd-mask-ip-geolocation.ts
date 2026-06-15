import { MigrationInterface, QueryRunner } from 'typeorm';

const isSqlite = (qr: QueryRunner) =>
  qr.connection.options.type === 'sqlite' ||
  qr.connection.options.type === 'better-sqlite3';

export class LgpdMaskIpGeolocation1709000000204 implements MigrationInterface {
  name = 'LgpdMaskIpGeolocation1709000000204';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (isSqlite(queryRunner)) {
      return;
    }

    // 1. Mascarar IPs em audit_logs para /24 (ex: 192.168.1.123 → 192.168.1.0)
    if (await queryRunner.hasTable('audit_logs')) {
      const hasIp =
        (await this.hasColumn(queryRunner, 'audit_logs', 'ip_address')) ||
        (await this.hasColumn(queryRunner, 'audit_logs', 'ipAddress'));

      if (hasIp) {
        const colName = (await this.hasColumn(
          queryRunner,
          'audit_logs',
          'ip_address',
        ))
          ? 'ip_address'
          : 'ipAddress';

        await queryRunner.query(`
          UPDATE "audit_logs"
          SET "${colName}" = regexp_replace(
            "${colName}",
            '(\\d+\\.\\d+\\.\\d+\\.)(\\d+)',
            '\\10'
          )
          WHERE "${colName}" ~ '^\\d+\\.\\d+\\.\\d+\\.\\d+$'
            AND "${colName}" NOT LIKE '%.0'
        `);
      }
    }

    // 2. Reduzir precisão de geolocalização em apr_risk_evidences (~1 km)
    if (await queryRunner.hasTable('apr_risk_evidences')) {
      const hasLat = await this.hasColumn(
        queryRunner,
        'apr_risk_evidences',
        'latitude',
      );
      const hasLng = await this.hasColumn(
        queryRunner,
        'apr_risk_evidences',
        'longitude',
      );

      if (hasLat && hasLng) {
        // Reduzir dados históricos de 7 para 2 casas decimais
        await queryRunner.query(`
          UPDATE "apr_risk_evidences"
          SET
            latitude = ROUND(latitude::numeric, 2),
            longitude = ROUND(longitude::numeric, 2)
          WHERE latitude IS NOT NULL OR longitude IS NOT NULL
        `);

        // Alterar precisão das colunas para impedir armazenamento futuro com alta precisão
        await queryRunner.query(`
          ALTER TABLE "apr_risk_evidences"
          ALTER COLUMN latitude TYPE numeric(7,2) USING ROUND(latitude::numeric, 2)
        `);
        await queryRunner.query(`
          ALTER TABLE "apr_risk_evidences"
          ALTER COLUMN longitude TYPE numeric(7,2) USING ROUND(longitude::numeric, 2)
        `);
      }

      // 3. Hash de device_id para pseudonimização
      const hasDeviceId = await this.hasColumn(
        queryRunner,
        'apr_risk_evidences',
        'device_id',
      );

      if (hasDeviceId) {
        // Verificar se pgcrypto está disponível
        const hasCrypto = (await queryRunner.query(`
          SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto' LIMIT 1
        `)) as Array<Record<string, unknown>>;

        if (hasCrypto.length > 0) {
          // Hash apenas valores que ainda não são SHA256 (64 hex chars)
          await queryRunner.query(`
            UPDATE "apr_risk_evidences"
            SET device_id = encode(digest(device_id, 'sha256'), 'hex')
            WHERE device_id IS NOT NULL
              AND length(device_id) <> 64
          `);
        } else {
          // Sem pgcrypto: truncar device_id para 8 chars (pseudonimização mínima)
          await queryRunner.query(`
            UPDATE "apr_risk_evidences"
            SET device_id = left(device_id, 8) || '...'
            WHERE device_id IS NOT NULL
              AND length(device_id) > 8
          `);
        }
      }

      // 4. Mascarar ip_address em apr_risk_evidences
      const hasIpEvidence = await this.hasColumn(
        queryRunner,
        'apr_risk_evidences',
        'ip_address',
      );

      if (hasIpEvidence) {
        await queryRunner.query(`
          UPDATE "apr_risk_evidences"
          SET ip_address = regexp_replace(
            ip_address,
            '(\\d+\\.\\d+\\.\\d+\\.)(\\d+)',
            '\\10'
          )
          WHERE ip_address ~ '^\\d+\\.\\d+\\.\\d+\\.\\d+$'
            AND ip_address NOT LIKE '%.0'
        `);
      }
    }
  }

  private async hasColumn(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
         AND column_name = $2`,
      [table, column],
    )) as Array<Record<string, unknown>>;
    return rows.length > 0;
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (isSqlite(queryRunner)) return;

    // Reverter o type change de latitude/longitude (SOMENTE a estrutura — os dados mascarados não podem ser revertidos)
    if (await queryRunner.hasTable('apr_risk_evidences')) {
      await queryRunner.query(`
        ALTER TABLE "apr_risk_evidences"
        ALTER COLUMN latitude TYPE numeric(10,7) USING latitude::numeric
      `);
      await queryRunner.query(`
        ALTER TABLE "apr_risk_evidences"
        ALTER COLUMN longitude TYPE numeric(10,7) USING longitude::numeric
      `);
    }
  }
}

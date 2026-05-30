const path = require('path');
const dotenv = require('dotenv');
const { connectRuntimePgClient } = require('./lib/pg-runtime-client');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  let connection;
  try {
    connection = await connectRuntimePgClient();
    const client = connection.client;

    await client.query('BEGIN');
    const result = await client.query(
      'SELECT table_name, deleted_count FROM cleanup_expired_data() ORDER BY table_name',
    );
    await client.query('ROLLBACK');

    console.log(
      JSON.stringify(
        {
          ok: true,
          rows: result.rows,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (connection?.client) {
      try {
        await connection.client.query('ROLLBACK');
      } catch {
        // noop
      }
    }

    console.error(
      '[GDPR:CLEANUP:SMOKE] Failed:',
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  } finally {
    if (connection?.client) {
      await connection.client.end().catch(() => undefined);
    }
  }
}

main();

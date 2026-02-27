import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function runAuditMigration() {
  const client = new Client({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    database: process.env.DATABASE_NAME || 'sst_db',
  });

  try {
    await client.connect();
    console.log('Connected to database.');

    // 1. Check if audit_logs table exists
    const checkTableQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'audit_logs'
      );
    `;
    const res = await client.query(checkTableQuery);
    if (!res.rows[0].exists) {
      console.log('Table audit_logs does not exist. Skipping rules creation.');
      return;
    }

    // 2. Create Rules for Immutability (WORM)
    console.log('Creating immutable rules for audit_logs...');

    // Rule to prevent UPDATE
    const createUpdateRule = `
      CREATE OR REPLACE RULE no_update_audit AS 
      ON UPDATE TO audit_logs DO INSTEAD NOTHING;
    `;
    await client.query(createUpdateRule);
    console.log('Rule no_update_audit created.');

    // Rule to prevent DELETE
    const createDeleteRule = `
      CREATE OR REPLACE RULE no_delete_audit AS 
      ON DELETE TO audit_logs DO INSTEAD NOTHING;
    `;
    await client.query(createDeleteRule);
    console.log('Rule no_delete_audit created.');

    console.log('Audit logs are now immutable (WORM).');
  } catch (err) {
    console.error('Error running migration:', err);
  } finally {
    await client.end();
  }
}

runAuditMigration();

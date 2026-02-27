/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { Client } from 'pg';

async function checkUsers() {
  const client = new Client({
    host: '127.0.0.1',
    port: 5432,
    user: 'postgres',
    password: 'postgres123',
    database: 'sst_db',
  });

  try {
    await client.connect();
    const res = await client.query('SELECT nome FROM profiles');
    console.log('Profiles:', res.rows);
  } catch (err) {
    console.error('Error connecting to DB:', err);
  } finally {
    await client.end();
  }
}

void checkUsers();

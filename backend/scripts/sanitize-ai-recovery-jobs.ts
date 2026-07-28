import { Queue } from 'bullmq';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'node:path';
import {
  assertSecureRedisConnection,
  resolveRedisConnection,
} from '../src/shared/redis/redis-connection.util';
import { sanitizeAiRecoveryJobData } from '../src/modules/ai/sst-agent/ai-recovery-job-data';

dotenv.config({
  path: path.resolve(__dirname, '../.env'),
  override: false,
  quiet: true,
});

const APPLY = process.argv.includes('--apply');
const QUEUE_NAME = 'ai-recovery';
const JOB_STATES = [
  'waiting',
  'delayed',
  'paused',
  'completed',
  'failed',
] as const;

async function main(): Promise<void> {
  const connection = resolveRedisConnection(process.env, 'queue');
  if (!connection) {
    throw new Error('Conexão Redis da fila não configurada.');
  }
  assertSecureRedisConnection(connection);

  const redis = connection.url
    ? new Redis(connection.url, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      })
    : new Redis({
        host: connection.host,
        port: connection.port,
        username: connection.username,
        password: connection.password,
        tls: connection.tls,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });
  const queue = new Queue(QUEUE_NAME, { connection: redis });

  let inspected = 0;
  let legacy = 0;
  let sanitized = 0;
  try {
    for (const state of JOB_STATES) {
      const jobs = await queue.getJobs([state], 0, -1, true);
      for (const job of jobs) {
        inspected += 1;
        const result = sanitizeAiRecoveryJobData(job.data);
        if (!result.changed) {
          continue;
        }
        legacy += 1;
        if (APPLY) {
          await job.updateData(result.data);
          sanitized += 1;
        }
      }
    }
  } finally {
    await queue.close();
    await redis.quit();
  }

  console.log(
    JSON.stringify({
      mode: APPLY ? 'apply' : 'dry-run',
      queue: QUEUE_NAME,
      inspected,
      legacy,
      sanitized,
    }),
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Falha desconhecida';
  console.error(`[ai-recovery-sanitize] ${message}`);
  process.exitCode = 1;
});

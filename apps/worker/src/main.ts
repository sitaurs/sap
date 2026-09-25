import { loadConfig } from '@sap/config';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { setDefaultResultOrder } from 'node:dns';

setDefaultResultOrder('ipv4first');
const config = loadConfig();
const connection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

const worker = new Worker(
  'sap-jobs',
  async (job) => {
    throw new Error(`Unsupported job type: ${job.name}`);
  },
  { connection, concurrency: 1 },
);

worker.on('error', (error) => console.error('worker_error', { message: error.message }));

async function shutdown(signal: string) {
  console.info('worker_shutdown', { signal });
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

import { loadConfig } from '@sap/config';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import postgres from 'postgres';
import { setDefaultResultOrder } from 'node:dns';
import { MlAdapter } from './ml-adapter.js';
import { MlClient } from './ml-client.js';
import { ObjectStore } from './object-store.js';
import { ScanProcessor } from './scan-processor.js';
import { ScanRepository } from './scan-repository.js';

const SCAN_JOB = 'scan.process';

setDefaultResultOrder('ipv4first');
const config = loadConfig();
const connection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});
const sql = postgres(config.DATABASE_URL);

const processor = new ScanProcessor(
  new ScanRepository(sql),
  new ObjectStore(config),
  new MlAdapter(new MlClient(config), config),
);

const worker = new Worker(
  'sap-jobs',
  async (job) => {
    if (job.name === SCAN_JOB) {
      const { scanId } = job.data as { scanId: string };
      await processor.process(scanId);
      return;
    }
    throw new Error(`Unsupported job type: ${job.name}`);
  },
  { connection, concurrency: 1 },
);

worker.on('error', (error) => console.error('worker_error', { message: error.message }));
worker.on('failed', (job, error) =>
  console.error('job_failed', { jobId: job?.id, name: job?.name, message: error.message }),
);

async function shutdown(signal: string) {
  console.info('worker_shutdown', { signal });
  await worker.close();
  await connection.quit();
  await sql.end({ timeout: 5 });
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

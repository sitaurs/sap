import { loadConfig } from '@sap/config';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import postgres from 'postgres';
import { setDefaultResultOrder } from 'node:dns';
import { DeletionProcessor } from './deletion-processor.js';
import { MaintenanceRepository } from './maintenance-repository.js';
import { drainOneDeletion, runSweep } from './maintenance-runner.js';
import { MlAdapter } from './ml-adapter.js';
import { MlClient } from './ml-client.js';
import { ObjectStore } from './object-store.js';
import { ScanProcessor } from './scan-processor.js';
import { ScanRepository } from './scan-repository.js';

const SCAN_JOB = 'scan.process';
/** How often to poll the outbox for pending deletion events. */
const DELETION_POLL_MS = 5_000;
/** How often to run the retention/orphan sweep. */
const SWEEP_INTERVAL_MS = 60 * 60 * 1_000;

setDefaultResultOrder('ipv4first');
const config = loadConfig();
const connection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});
const sql = postgres(config.DATABASE_URL);

const store = new ObjectStore(config);
const processor = new ScanProcessor(
  new ScanRepository(sql),
  store,
  new MlAdapter(new MlClient(config), config),
);

const maintenanceRepo = new MaintenanceRepository(sql);
const deletionProcessor = new DeletionProcessor(maintenanceRepo, store);

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

// Outbox relay: drain pending account-deletion events, then back off to a poll.
let stopping = false;
let deletionTimer: NodeJS.Timeout | undefined;
async function pollDeletions(): Promise<void> {
  if (stopping) return;
  try {
    let handled = true;
    while (handled && !stopping) {
      handled = await drainOneDeletion(maintenanceRepo, deletionProcessor);
    }
  } catch (error) {
    console.error('deletion_poll_error', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  }
  if (!stopping) deletionTimer = setTimeout(() => void pollDeletions(), DELETION_POLL_MS);
}

// Periodic retention/orphan sweep.
let sweepTimer: NodeJS.Timeout | undefined;
async function sweep(): Promise<void> {
  if (stopping) return;
  try {
    const result = await runSweep(maintenanceRepo, store);
    console.info('maintenance_sweep', result);
  } catch (error) {
    console.error('maintenance_sweep_error', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  }
  if (!stopping) sweepTimer = setTimeout(() => void sweep(), SWEEP_INTERVAL_MS);
}

void pollDeletions();
void sweep();

async function shutdown(signal: string) {
  console.info('worker_shutdown', { signal });
  stopping = true;
  if (deletionTimer) clearTimeout(deletionTimer);
  if (sweepTimer) clearTimeout(sweepTimer);
  await worker.close();
  await connection.quit();
  await sql.end({ timeout: 5 });
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

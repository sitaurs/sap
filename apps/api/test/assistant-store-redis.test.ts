import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { Redis } from 'ioredis';
import { incrementRateLimitCounter } from '../src/assistant/assistant-store.js';

const hasRedisServer = spawnSync('redis-server', ['--version'], { stdio: 'ignore' }).status === 0;

test('SAPA fixed-window Redis counter increments atomically and keeps a non-sliding TTL', {
  skip: !hasRedisServer && 'redis-server is not installed; run this regression with a local Redis server',
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'sapa-rate-limit-'));
  const socketPath = join(directory, 'redis.sock');
  const server = spawn('redis-server', [
    '--port', '0',
    '--unixsocket', socketPath,
    '--unixsocketperm', '700',
    '--save', '',
    '--appendonly', 'no',
    '--loglevel', 'warning',
  ], { stdio: 'ignore' });
  const redis = new Redis(socketPath, { maxRetriesPerRequest: 1 });
  redis.on('error', () => undefined);

  t.after(async () => {
    await redis.quit().catch(() => undefined);
    if (server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill('SIGTERM');
      await Promise.race([exited, delay(1_000)]);
    }
    await rm(directory, { recursive: true, force: true });
  });

  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`redis-server exited during startup (${server.exitCode})`);
    try {
      await redis.ping();
      ready = true;
      break;
    } catch {
      await delay(25);
    }
  }
  assert.ok(ready, 'the isolated Redis server should accept a connection');

  const key = 'test:sapa:rate:fixed-window';
  const ttlMs = 1_500;
  assert.equal(await incrementRateLimitCounter(redis, key, ttlMs), 1);
  const initialTtl = await redis.pttl(key);
  assert.ok(initialTtl > 0 && initialTtl <= ttlMs, `first increment sets a TTL (${initialTtl})`);

  await delay(120);
  const ttlBeforeBurst = await redis.pttl(key);
  const concurrentCounts = await Promise.all(
    Array.from({ length: 100 }, () => incrementRateLimitCounter(redis, key, ttlMs)),
  );
  assert.deepEqual(
    [...concurrentCounts].sort((left, right) => left - right),
    Array.from({ length: 100 }, (_, index) => index + 2),
    'concurrent Redis script calls must not lose or duplicate counter values',
  );
  const ttlAfterBurst = await redis.pttl(key);
  assert.ok(ttlAfterBurst > 0, 'the fixed-window counter still has an expiry');
  assert.ok(
    ttlAfterBurst <= ttlBeforeBurst && ttlAfterBurst <= ttlMs - 100,
    `later requests must not extend the original TTL (${ttlBeforeBurst} -> ${ttlAfterBurst} ms)`,
  );

  const legacyKey = 'test:sapa:rate:legacy-no-ttl';
  await redis.set(legacyKey, '1');
  assert.equal(await incrementRateLimitCounter(redis, legacyKey, ttlMs), 2);
  const repairedTtl = await redis.pttl(legacyKey);
  assert.ok(repairedTtl > 0 && repairedTtl <= ttlMs, 'a legacy counter without TTL is repaired');
});

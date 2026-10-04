import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { Redis } from 'ioredis';
import {
  appendConversationTurn,
  deleteConversationWithLock,
  releaseConversationLock,
  renewConversationLock,
  tryAcquireConversationLock,
} from '../src/assistant/assistant-store.js';

const hasRedisServer = spawnSync('redis-server', ['--version'], { stdio: 'ignore' }).status === 0;

test('SAPA conversation leases fence stale turns, serialize providers, and make delete win safely', {
  skip: !hasRedisServer && 'redis-server is not installed; run this regression with a local Redis server',
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'sapa-conversation-'));
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

  const conversationKey = 'test:sapa:conv:user-1:conversation-1';
  const lockKey = 'test:sapa:conv-lock:user-1:conversation-1';
  const staleToken = 'old-owner';
  const liveToken = 'new-owner';
  assert.equal(await tryAcquireConversationLock(redis, lockKey, staleToken, 75), true);
  assert.equal(await tryAcquireConversationLock(redis, lockKey, 'concurrent-request', 1_000), false,
    'only one in-flight request can own a conversation');

  await delay(110);
  assert.equal(await tryAcquireConversationLock(redis, lockKey, liveToken, 1_000), true,
    'another request can recover the lock after its short lease expires');
  assert.equal(await appendConversationTurn(
    redis, conversationKey, lockKey, staleToken, 'stale question', 'stale answer', 12, 1_800, false,
  ), -1, 'expired provider work must be fenced from committing');
  assert.equal(await redis.get(conversationKey), null, 'stale work must not create a transcript');

  assert.equal(await appendConversationTurn(
    redis, conversationKey, lockKey, liveToken, 'first question', 'first answer', 12, 1_800, true,
  ), 1);
  const afterFirstTurn = JSON.parse((await redis.get(conversationKey)) ?? 'null');
  assert.deepEqual(afterFirstTurn, [
    { role: 'user', content: 'first question' },
    { role: 'assistant', content: 'first answer' },
  ]);

  assert.equal(await deleteConversationWithLock(redis, conversationKey, lockKey, staleToken), -1,
    'a stale delete cannot remove a transcript owned by an active turn');
  assert.notEqual(await redis.get(conversationKey), null);
  await releaseConversationLock(redis, lockKey, liveToken);

  const deletingToken = 'delete-owner';
  assert.equal(await tryAcquireConversationLock(redis, lockKey, deletingToken, 1_000), true);
  assert.equal(await deleteConversationWithLock(redis, conversationKey, lockKey, deletingToken), 1);
  assert.equal(await redis.get(conversationKey), null, 'delete removes the transcript atomically with the lock');
  assert.equal(await redis.get(lockKey), null, 'successful delete also releases the lock');

  const postDeleteToken = 'post-delete-chat';
  assert.equal(await tryAcquireConversationLock(redis, lockKey, postDeleteToken, 1_000), true);
  assert.equal(await appendConversationTurn(
    redis, conversationKey, lockKey, postDeleteToken, 'resurrect', 'should not exist', 12, 1_800, false,
  ), -2, 'a request carrying a deleted conversation ID cannot resurrect it');
  await releaseConversationLock(redis, lockKey, postDeleteToken);

  const renewingToken = 'renewing-owner';
  assert.equal(await tryAcquireConversationLock(redis, lockKey, renewingToken, 100), true);
  await delay(60);
  assert.equal(await renewConversationLock(redis, lockKey, renewingToken, 100), true);
  await delay(60);
  assert.equal(await tryAcquireConversationLock(redis, lockKey, 'renewal-contender', 100), false,
    'a live request renews its short lease during a bounded provider call');
  assert.equal(await renewConversationLock(redis, lockKey, 'wrong-owner', 100), false,
    'only the lease owner may extend it');
  await releaseConversationLock(redis, lockKey, renewingToken);
});

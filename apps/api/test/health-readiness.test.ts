import assert from 'node:assert/strict';
import { once } from 'node:events';
import net, { type AddressInfo } from 'node:net';
import test from 'node:test';
import { Redis } from 'ioredis';
import { probeRedisHealth, summarizeReadiness, withTimeout } from '../src/health/health.service.js';

function decodeRespCommands(source: Buffer): { commands: string[][]; rest: Buffer } {
  let offset = 0;
  const commands: string[][] = [];
  while (offset < source.length) {
    const arrayEnd = source.indexOf('\r\n', offset);
    if (arrayEnd < 0 || source[offset] !== 42) break;
    const count = Number(source.toString('utf8', offset + 1, arrayEnd));
    if (!Number.isInteger(count) || count < 1) break;
    let cursor = arrayEnd + 2;
    const args: string[] = [];
    let complete = true;
    for (let index = 0; index < count; index += 1) {
      const lengthEnd = source.indexOf('\r\n', cursor);
      if (lengthEnd < 0 || source[cursor] !== 36) { complete = false; break; }
      const length = Number(source.toString('utf8', cursor + 1, lengthEnd));
      const start = lengthEnd + 2;
      const end = start + length;
      if (!Number.isInteger(length) || length < 0 || source.length < end + 2) { complete = false; break; }
      args.push(source.toString('utf8', start, end));
      cursor = end + 2;
    }
    if (!complete) break;
    commands.push(args);
    offset = cursor;
  }
  return { commands, rest: source.subarray(offset) };
}

function respondToRedisCommand(command: string[]): string {
  switch (command[0]?.toUpperCase()) {
    case 'PING': return '+PONG\r\n';
    case 'INFO': {
      const body = 'redis_version:7.2.0\r\nrole:master\r\nloading:0\r\n';
      return `$${Buffer.byteLength(body)}\r\n${body}\r\n`;
    }
    default: return '+OK\r\n';
  }
}

test('readiness matrix keeps DB as the safe-read gate and exposes auxiliary degradation', () => {
  assert.deepEqual(
    summarizeReadiness({ database: 'ok', redis: 'ok', objectStorage: 'ok' }, '1.1.0'),
    {
      status: 'ok', ready: true,
      dependencies: { database: 'ok', redis: 'ok', objectStorage: 'ok' },
      contractVersion: '1.1.0',
    },
  );
  assert.deepEqual(
    summarizeReadiness({ database: 'ok', redis: 'unavailable', objectStorage: 'ok' }, '1.1.0'),
    {
      status: 'degraded', ready: true,
      dependencies: { database: 'ok', redis: 'unavailable', objectStorage: 'ok' },
      contractVersion: '1.1.0',
    },
  );
  assert.deepEqual(
    summarizeReadiness({ database: 'unavailable', redis: 'ok', objectStorage: 'ok' }, '1.1.0'),
    {
      status: 'degraded', ready: false,
      dependencies: { database: 'unavailable', redis: 'ok', objectStorage: 'ok' },
      contractVersion: '1.1.0',
    },
  );
});

test('bounded probe invokes cancellation and rejects when its operation stalls', async () => {
  let cancelled = false;
  const stalled = new Promise<never>(() => undefined);
  await assert.rejects(withTimeout(stalled, 5, () => { cancelled = true; }), /timed out/);
  assert.equal(cancelled, true);
});

test('bounded probe passes through a successful dependency result', async () => {
  assert.equal(await withTimeout(Promise.resolve('PONG'), 100), 'PONG');
});

test('a Redis client recovers on a later probe after an initial refused connection', async () => {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = (reservation.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));

  const redis = new Redis({
    host: '127.0.0.1', port, lazyConnect: true, connectTimeout: 250,
    maxRetriesPerRequest: 1, enableReadyCheck: true, retryStrategy: () => null,
  });
  redis.on('error', () => undefined);
  let server: net.Server | undefined;
  try {
    assert.equal(await probeRedisHealth(redis, 1_000), 'unavailable');
    assert.equal(redis.status, 'end');

    server = net.createServer(socket => {
      let pending: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      socket.on('data', chunk => {
        pending = Buffer.concat([pending, chunk]);
        const decoded = decodeRespCommands(pending);
        pending = decoded.rest;
        for (const command of decoded.commands) socket.write(respondToRedisCommand(command));
      });
    });
    server.listen(port, '127.0.0.1');
    await once(server, 'listening');

    assert.equal(await probeRedisHealth(redis, 1_000), 'ok');
    assert.equal(redis.status, 'ready');
  } finally {
    redis.disconnect();
    if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  }
});

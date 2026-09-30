import { lookup } from 'node:dns/promises';
import net from 'node:net';
import postgres from 'postgres';

/** Transient connects to Neon occasionally stall or reset; retry a few times. */
const CONNECT_ATTEMPTS = 3;
/** Fail a stalled TCP connect fast instead of hanging on the OS-level timeout. */
const CONNECT_TIMEOUT_MS = 10_000;

/** Open one TCP socket, rejecting if the connect does not complete in time. */
function connectOnce(host: string, port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TCP connect to ${host}:${port} timed out after ${CONNECT_TIMEOUT_MS}ms`));
    }, CONNECT_TIMEOUT_MS);
    socket.once('connect', () => { clearTimeout(timer); resolve(socket); });
    socket.once('error', (error) => { clearTimeout(timer); socket.destroy(); reject(error); });
  });
}

/**
 * Neon publishes IPv4 and IPv6 records. Some VPS/developer networks resolve IPv6
 * but cannot route it, so a normal socket can hang until connect_timeout. Resolve
 * IPv4 explicitly while retaining the original hostname for TLS SNI.
 *
 * Neon also drops the occasional fresh connection (surfacing as `connect
 * ETIMEDOUT`/`ECONNRESET`); the socket factory re-resolves and retries a few
 * times with short backoff before surfacing the failure. Only connection setup
 * is retried — never a query — so this cannot cause a duplicate write.
 */
export function createPostgresClient(databaseUrl: string, max = 10) {
  const target = new URL(databaseUrl);
  const port = Number(target.port || 5432);
  const options = {
    max,
    idle_timeout: 20,
    connect_timeout: 10,
    socket: async () => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt += 1) {
        try {
          const { address } = await lookup(target.hostname, { family: 4 });
          const socket = await connectOnce(address, port);
          Object.assign(socket, { host: target.hostname });
          return socket;
        } catch (error) {
          lastError = error;
          if (attempt < CONNECT_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
          }
        }
      }
      throw lastError;
    },
  };
  return postgres(databaseUrl, options);
}

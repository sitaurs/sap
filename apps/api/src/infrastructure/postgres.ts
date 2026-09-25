import { lookup } from 'node:dns/promises';
import net from 'node:net';
import postgres from 'postgres';

/**
 * Neon publishes IPv4 and IPv6 records. Some VPS/developer networks resolve IPv6
 * but cannot route it, so a normal socket can hang until connect_timeout. Resolve
 * IPv4 explicitly while retaining the original hostname for TLS SNI.
 */
export function createPostgresClient(databaseUrl: string, max = 10) {
  const target = new URL(databaseUrl);
  const options = {
    max,
    idle_timeout: 20,
    connect_timeout: 10,
    socket: async () => {
      const { address } = await lookup(target.hostname, { family: 4 });
      const socket = await new Promise<net.Socket>((resolve, reject) => {
        const candidate = net.connect(
          { host: address, port: Number(target.port || 5432) },
          () => resolve(candidate),
        );
        candidate.once('error', reject);
      });
      Object.assign(socket, { host: target.hostname });
      return socket;
    },
  };
  return postgres(databaseUrl, options);
}

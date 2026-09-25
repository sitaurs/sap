import { Global, Module } from '@nestjs/common';
import { getConfig } from '@sap/config';
import type { Sql } from 'postgres';
import { createPostgresClient } from './postgres.js';

/**
 * Injection token for the shared `postgres` client. Repositories depend on this
 * rather than constructing their own pool so connection limits are honoured and
 * the pool is closed once on shutdown.
 */
export const DATABASE = Symbol('DATABASE');

export type Database = Sql;

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: (): Database => {
        const config = getConfig();
        return createPostgresClient(config.DATABASE_URL);
      },
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}

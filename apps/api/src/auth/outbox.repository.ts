import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../infrastructure/database.module.js';

/**
 * Write-side of the transactional outbox. B-03 only needs to enqueue the
 * account-deletion cleanup job; the relay/worker that drains these rows is B-11.
 * `dedup_key` is UNIQUE, so re-enqueueing the same aggregate is a no-op.
 */
@Injectable()
export class OutboxRepository {
  constructor(@Inject(DATABASE) private readonly sql: Database) {}

  async enqueue(input: {
    topic: string;
    aggregateId: string;
    dedupKey: string;
    payload: Record<string, string>;
  }): Promise<void> {
    await this.sql`
      INSERT INTO outbox_events (topic, aggregate_id, dedup_key, payload_minimal)
      VALUES (${input.topic}, ${input.aggregateId}, ${input.dedupKey}, ${this.sql.json(input.payload)})
      ON CONFLICT (dedup_key) DO NOTHING`;
  }
}

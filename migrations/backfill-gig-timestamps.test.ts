import { Types } from 'mongoose';

import { runGigTimestampMigration } from './1787875200000-backfill-gig-timestamps';
import type {
  GigTimestampMigrationDocument,
  GigTimestampMigrationStore,
} from './1787875200000-backfill-gig-timestamps';

class InMemoryStore implements GigTimestampMigrationStore {
  readonly backups = new Set<string>();

  constructor(readonly documents: GigTimestampMigrationDocument[]) {}

  readAll(): Promise<GigTimestampMigrationDocument[]> {
    return Promise.resolve(this.documents.map((document) => ({ ...document })));
  }

  backup(documents: readonly { _id: Types.ObjectId }[]) {
    let matchedCount = 0;
    let upsertedCount = 0;
    for (const document of documents) {
      const id = String(document._id);
      if (this.backups.has(id)) matchedCount += 1;
      else {
        this.backups.add(id);
        upsertedCount += 1;
      }
    }
    return Promise.resolve({ matchedCount, modifiedCount: 0, upsertedCount });
  }

  write(documents: readonly { _id: Types.ObjectId; timestamp: Date }[]) {
    let count = 0;
    for (const planned of documents) {
      const document = this.documents.find(
        (item) => String(item._id) === String(planned._id),
      );
      if (
        !document ||
        document.createdAt !== undefined ||
        document.updatedAt !== undefined
      )
        continue;
      document.createdAt = planned.timestamp;
      document.updatedAt = planned.timestamp;
      count += 1;
    }
    return Promise.resolve({ matchedCount: count, modifiedCount: count });
  }
}

describe('runGigTimestampMigration', () => {
  it('should use one Main post date and fall back to the ObjectId timestamp', async () => {
    const mainId = new Types.ObjectId();
    const fallbackId = new Types.ObjectId();
    const store = new InMemoryStore([
      { _id: mainId, posts: [{ type: 'Main', date: 1_780_000_000_000 }] },
      { _id: fallbackId, posts: [] },
    ]);

    const report = await runGigTimestampMigration(store, false);

    expect(report.before).toMatchObject({
      totalGigs: 2,
      singleMainPost: 1,
      objectIdFallback: 1,
      missingTimestamps: 2,
      blockingRecordIds: [],
    });
    expect(report.plan.timestampUpdates).toBe(2);
    expect(report.writes.timestamps).toEqual({
      matchedCount: 2,
      modifiedCount: 2,
    });
    expect(report.canApply).toBe(true);
    expect(store.documents[0]?.createdAt).toEqual(new Date(1_780_000_000_000));
    expect(store.documents[1]?.createdAt).toEqual(fallbackId.getTimestamp());
  });

  it('should be idempotent after a successful apply', async () => {
    const id = new Types.ObjectId();
    const store = new InMemoryStore([{ _id: id, posts: [] }]);
    await runGigTimestampMigration(store, false);

    const rerun = await runGigTimestampMigration(store, false);

    expect(rerun.plan.timestampUpdates).toBe(0);
    expect(rerun.writes.timestamps).toEqual({
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 0,
    });
    expect(rerun.canApply).toBe(true);
  });

  it('should block ambiguous Main posts and partial timestamps without writes', async () => {
    const ambiguousId = new Types.ObjectId();
    const partialId = new Types.ObjectId();
    const store = new InMemoryStore([
      {
        _id: ambiguousId,
        posts: [
          { type: 'Main', date: 1_780_000_000_000 },
          { type: 'Main', date: 1_780_000_100_000 },
        ],
      },
      { _id: partialId, posts: [], createdAt: partialId.getTimestamp() },
    ]);

    const report = await runGigTimestampMigration(store, false);

    expect(report.canApply).toBe(false);
    expect(report.before.blockingRecordIds).toEqual(
      [String(ambiguousId), String(partialId)].sort(),
    );
    expect(report.writes.timestamps.modifiedCount).toBe(0);
  });

  it('should not write during dry run', async () => {
    const id = new Types.ObjectId();
    const store = new InMemoryStore([{ _id: id, posts: [] }]);

    const report = await runGigTimestampMigration(store, true);

    expect(report.plan.timestampUpdates).toBe(1);
    expect(report.writes.timestamps.modifiedCount).toBe(0);
    expect(store.documents[0]?.createdAt).toBeUndefined();
  });
});

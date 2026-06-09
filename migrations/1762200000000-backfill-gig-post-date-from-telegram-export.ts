/**
 * Backfill gig post `date` from raw Telegram result.json exports.
 *
 * Set GIG_POST_DATE_EXPORT_PATH to comma-separated paths (main + moderation exports),
 * then: npm run migrate:up:dry → npm run migrate:up
 */
import fs from 'node:fs/promises';
import type { Types } from 'mongoose';
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { finishMigrationDryRun, isMigrationDryRun } from './migration-cli';

dotenv.config();

interface TelegramExportMessage {
  readonly id?: number;
  readonly date_unixtime?: string | number;
}

interface TelegramRawExport {
  readonly id?: number | string;
  readonly messages?: readonly TelegramExportMessage[];
}

interface GigPostDoc {
  readonly id?: number;
  readonly chatId?: number;
  readonly fileId?: string;
  readonly to?: string;
  readonly type?: string;
  readonly date?: number;
}

interface GigDoc {
  readonly _id: Types.ObjectId;
  readonly publicId?: string;
  readonly posts?: readonly GigPostDoc[];
}

interface NotUpdatedGigRef {
  readonly id: string;
  readonly publicId: string;
}

const MS_PER_SECOND = 1_000;

function resolveExportInputPaths(): string[] {
  return (process.env.GIG_POST_DATE_EXPORT_PATH ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function normalizeTelegramChatId(
  id: number | string | undefined,
): number | null {
  const raw = String(id ?? '').trim();
  if (!raw) {
    return null;
  }
  if (raw.startsWith('-100')) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const withPrefix = `-100${raw.replace(/^-+/, '')}`;
  const parsed = Number(withPrefix);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTelegramUnixSeconds(
  value: string | number | undefined,
): number | null {
  if (value === undefined) {
    return null;
  }
  const parsed =
    typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
}

function buildPostDateLookupKey(chatId: number, messageId: number): string {
  return `${chatId}:${messageId}`;
}

interface ExportIndexStats {
  readonly inputPath: string;
  readonly chatId: number;
  readonly messagesInExport: number;
  readonly messagesIndexed: number;
  readonly messagesSkippedNoDate: number;
}

interface PostTypeStats {
  postsTotal: number;
  postsUpdated: number;
  postsAlreadyCorrect: number;
  postsNotMatched: number;
  postsInvalidRef: number;
}

function createEmptyPostTypeStats(): PostTypeStats {
  return {
    postsTotal: 0,
    postsUpdated: 0,
    postsAlreadyCorrect: 0,
    postsNotMatched: 0,
    postsInvalidRef: 0,
  };
}

function resolvePostTypeKey(type: string | undefined): string {
  if (type === 'Moderation' || type === 'Publish') {
    return type;
  }
  return 'other';
}

async function loadMessageDateIndex(inputPaths: readonly string[]): Promise<{
  readonly index: Map<string, number>;
  readonly exports: ExportIndexStats[];
}> {
  const index = new Map<string, number>();
  const exports: ExportIndexStats[] = [];

  for (const inputPath of inputPaths) {
    const raw = await fs.readFile(inputPath, 'utf8');
    const parsed = JSON.parse(raw) as TelegramRawExport;

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray(parsed.messages)
    ) {
      throw new Error(
        `Unexpected JSON shape in ${inputPath}: expected root object with "messages" array`,
      );
    }

    const chatId = normalizeTelegramChatId(parsed.id);
    if (chatId === null) {
      throw new Error(
        `Expected root "id" to be a numeric Telegram chat id in ${inputPath}`,
      );
    }

    let messagesIndexed = 0;
    let messagesSkippedNoDate = 0;

    for (const message of parsed.messages) {
      if (!message || typeof message !== 'object') {
        continue;
      }
      if (!Number.isFinite(message.id)) {
        continue;
      }

      const dateSec = parseTelegramUnixSeconds(message.date_unixtime);
      if (dateSec === null) {
        messagesSkippedNoDate += 1;
        continue;
      }

      index.set(
        buildPostDateLookupKey(chatId, message.id),
        dateSec * MS_PER_SECOND,
      );
      messagesIndexed += 1;
    }

    exports.push({
      inputPath,
      chatId,
      messagesInExport: parsed.messages.length,
      messagesIndexed,
      messagesSkippedNoDate,
    });
  }

  return { index, exports };
}

export async function up(): Promise<void> {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI must be set in the environment');
  }

  const inputPaths = resolveExportInputPaths();
  if (inputPaths.length === 0) {
    throw new Error(
      'Telegram export path is required. Set GIG_POST_DATE_EXPORT_PATH (comma-separated) in .env or the shell, then run npm run migrate:up or npm run migrate:up:dry.',
    );
  }

  const dryRun = isMigrationDryRun();

  const { index: messageDateIndex, exports: exportStats } =
    await loadMessageDateIndex(inputPaths);

  await mongoose.connect(mongoUri);

  const collection = mongoose.connection.collection<GigDoc>('gigs');
  const cursor = collection.find({
    posts: { $exists: true, $ne: [] },
  });

  let gigsScanned = 0;
  let gigsUpdated = 0;
  const totals = createEmptyPostTypeStats();
  const byPostType: Record<string, PostTypeStats> = {
    Moderation: createEmptyPostTypeStats(),
    Publish: createEmptyPostTypeStats(),
    other: createEmptyPostTypeStats(),
  };
  const notUpdated: NotUpdatedGigRef[] = [];

  for await (const gig of cursor) {
    gigsScanned += 1;
    let isChanged = false;

    const posts = (gig.posts ?? []).map((post) => {
      const postTypeKey = resolvePostTypeKey(post.type);
      const typeStats = byPostType[postTypeKey] ?? byPostType.other;
      typeStats.postsTotal += 1;
      totals.postsTotal += 1;

      if (!Number.isFinite(post.id) || !Number.isFinite(post.chatId)) {
        typeStats.postsInvalidRef += 1;
        totals.postsInvalidRef += 1;
        notUpdated.push({
          id: String(gig._id),
          publicId: gig.publicId ?? '',
        });
        return post;
      }

      const lookupKey = buildPostDateLookupKey(post.chatId!, post.id!);
      const dateMs = messageDateIndex.get(lookupKey);
      if (dateMs === undefined) {
        typeStats.postsNotMatched += 1;
        totals.postsNotMatched += 1;
        notUpdated.push({
          id: String(gig._id),
          publicId: gig.publicId ?? '',
        });
        return post;
      }

      if (post.date === dateMs) {
        typeStats.postsAlreadyCorrect += 1;
        totals.postsAlreadyCorrect += 1;
        return post;
      }

      isChanged = true;
      typeStats.postsUpdated += 1;
      totals.postsUpdated += 1;
      return { ...post, date: dateMs };
    });

    if (!isChanged) {
      continue;
    }

    if (!dryRun) {
      await collection.updateOne({ _id: gig._id }, { $set: { posts } });
    }
    gigsUpdated += 1;
  }

  console.log(
    JSON.stringify(
      {
        migration: '1762200000000-backfill-gig-post-date-from-telegram-export',
        dryRun,
        inputPaths,
        exports: exportStats,
        gigsScanned,
        gigsUpdated,
        posts: {
          total: totals.postsTotal,
          updated: totals.postsUpdated,
          alreadyCorrect: totals.postsAlreadyCorrect,
          notMatched: totals.postsNotMatched,
          invalidRef: totals.postsInvalidRef,
        },
        byPostType,
        notUpdated,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();

  finishMigrationDryRun(
    dryRun,
    'Dry run complete: stats were logged, no gig documents were updated. Re-run with npm run migrate:up to apply.',
  );
}

export async function down(): Promise<void> {
  // Data backfill is not reverted; this only resets migration state.
}

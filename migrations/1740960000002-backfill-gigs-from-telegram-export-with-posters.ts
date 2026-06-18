import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AnyBulkWriteOperation } from 'mongoose';
import { GigSchema } from '../src/modules/gig/gig.schema';
import type { Gig } from '../src/modules/gig/gig.schema';
import { Messenger } from '../src/modules/gig/types/messenger.enum';
import { PostType } from '../src/modules/gig/types/postType.enum';
import { Status } from '../src/modules/gig/types/status.enum';
import { BadRequestException } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

dotenv.config();

interface TelegramExportMessage {
  id: number;
  title?: string;
  location?: string;
  date?: number;
  link?: string;
  photo?: string;
}

interface TelegramExport {
  id: number; // chat id
  name?: string;
  messages: TelegramExportMessage[];
}

function slugifyTitle(rawTitle: string): string {
  const str0 = (rawTitle ?? '').trim().toLowerCase();
  const str1 = str0.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const str2 = str1.replace(/[&+]/g, ' ');
  const str3 = str2
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return str3 || 'gig';
}

function msToYmdUtc(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '1970-01-01';
  return d.toISOString().slice(0, 10);
}

function normalizeDateToMs(date: number | undefined): number | null {
  if (!date || !Number.isFinite(date)) return null;
  if (date < 1_000_000_000_000) return Math.floor(date * 1000);
  return Math.floor(date);
}

function buildPublicId(input: {
  title: string;
  dateMs: number;
  messageId: number;
}): string {
  const yyyyMmDd = msToYmdUtc(input.dateMs);
  const msgSuffix = `m${String(input.messageId)}`;

  const reserved = 1 + yyyyMmDd.length + 1 + msgSuffix.length;
  const maxSlugLen = Math.max(1, 64 - reserved);

  let slug = slugifyTitle(input.title);
  if (slug.length > maxSlugLen) {
    slug = slug.slice(0, maxSlugLen).replace(/-+$/g, '');
  }
  if (!slug) slug = 'gig';

  const candidate = `${slug}-${yyyyMmDd}-${msgSuffix}`;
  return candidate.length > 64
    ? candidate.slice(0, 64).replace(/-+$/g, '')
    : candidate;
}

function pickSuggestedByUserId(): number {
  try {
    const raw = process.env.BOT_ADMINS;
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as Record<string, number>;
    const first = Object.values(parsed).find((v) => Number.isFinite(v));
    return typeof first === 'number' ? first : 0;
  } catch {
    return 0;
  }
}

function getBucketPrefix(): string {
  const raw = (process.env.S3_POSTERS_PREFIX ?? 'gigs').trim();
  const normalized = raw.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalized) return 'gigs';
  if (normalized.includes('..') || normalized.includes('\\')) return 'gigs';
  return normalized;
}

function normalizeCityForBucket(city: string): string {
  const TEMP_BARCELONA = 'barcelona';
  return city.toLowerCase() === TEMP_BARCELONA ? TEMP_BARCELONA : 'unknown';
}

function guessMimetypeFromExt(extRaw: string | undefined): string | undefined {
  const ext = String(extRaw ?? '')
    .trim()
    .toLowerCase();
  if (!ext) return undefined;
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return undefined;
}

function readCliFlag(flag: string): string | undefined {
  const eqPrefix = `${flag}=`;
  const eqMatch = process.argv.find((a) => a.startsWith(eqPrefix));
  if (eqMatch) return eqMatch.slice(eqPrefix.length);

  const idx = process.argv.findIndex((a) => a === flag);
  if (idx === -1) return undefined;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith('-')) return undefined;
  return value;
}

export async function up(): Promise<void> {
  const { MONGO_URI } = process.env;
  if (!MONGO_URI) throw new Error('MONGO_URI not found in process.env');

  const inputPath = (
    readCliFlag('--input') ??
    readCliFlag('--gigBackfillJsonPath') ??
    process.env.GIG_BACKFILL_JSON_PATH ??
    ''
  ).trim();
  if (!inputPath) {
    throw new Error(
      'Input JSON path is required. Pass --input "<path-to-*.structured.json>" or set GIG_BACKFILL_JSON_PATH.',
    );
  }

  const raw = await fs.readFile(inputPath, 'utf8');
  const parsed: TelegramExport = JSON.parse(raw);

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray(parsed.messages)
  ) {
    throw new Error(
      'Unexpected JSON shape: expected root object with "messages" array',
    );
  }

  const chatId = parsed.id;
  if (!Number.isFinite(chatId)) {
    throw new Error('Expected root "id" to be a numeric Telegram chat id');
  }

  const GigModel = mongoose.models.Gig
    ? mongoose.model<Gig>('Gig')
    : mongoose.model<Gig>('Gig', GigSchema, 'gigs');

  await mongoose.connect(MONGO_URI);

  const s3UploadConfigured = Boolean(
    (process.env.S3_BUCKET ?? '').trim() &&
    (process.env.S3_ENDPOINT ?? '').trim() &&
    (process.env.S3_ACCESS_KEY_ID ?? '').trim() &&
    (process.env.S3_SECRET_ACCESS_KEY ?? '').trim(),
  );

  const s3 = s3UploadConfigured
    ? new S3Client({
        // Cloudflare R2 uses region "auto" (AWS SDK still requires a value).
        region: (process.env.S3_REGION ?? 'auto').trim() || 'auto',
        endpoint: process.env.S3_ENDPOINT,
        // Boolean("false") === true — so parse explicitly
        forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE) === 'true',
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID!,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
        },
      })
    : null;

  const country = (process.env.GIG_BACKFILL_COUNTRY ?? 'ES')
    .trim()
    .toUpperCase();
  const city = (process.env.GIG_BACKFILL_CITY ?? 'barcelona').trim();
  const suggestedByUserId = pickSuggestedByUserId();

  const messages = parsed.messages
    .filter((m) => m && typeof m === 'object')
    .filter((m) => Number.isFinite(m.id))
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

  let skipped = 0;
  let postersReferenced = 0;
  let postersUploaded = 0;
  let postersMissingLocalFile = 0;
  let postersSkippedMissingS3Config = 0;

  const operations: AnyBulkWriteOperation<Gig>[] = [];

  for (const m of messages) {
    const dateMs = normalizeDateToMs(m.date);
    const title = String(m.title ?? '').trim();
    const venue = String(m.location ?? '').trim();
    const ticketsUrl = String(m.link ?? '').trim();
    const photoRel = String(m.photo ?? '').trim();

    if (!title || !dateMs || Number.isNaN(new Date(dateMs).getTime())) {
      skipped += 1;
      continue;
    }

    const publicId = buildPublicId({ title, dateMs, messageId: m.id });

    let posterBucketPath: string | undefined;
    if (photoRel) {
      postersReferenced += 1;
      if (!s3UploadConfigured) {
        postersSkippedMissingS3Config += 1;
      } else {
        const absPhotoPath = path.resolve(path.dirname(inputPath), photoRel);
        try {
          const buffer = await fs.readFile(absPhotoPath);
          const ext = path
            .basename(absPhotoPath)
            .split('.')
            .filter(Boolean)
            .pop();
          const fileExt = (ext ?? 'jpg').toLowerCase();

          const key = [
            getBucketPrefix(),
            new Date(dateMs).getUTCFullYear(),
            country.toLowerCase(),
            normalizeCityForBucket(city),
            `${publicId}.${fileExt}`,
          ].join('/');

          const bucket = process.env.S3_BUCKET;
          if (!bucket) {
            throw new BadRequestException('S3_BUCKET is not configured');
          }

          const command = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType:
              guessMimetypeFromExt(fileExt) ?? 'application/octet-stream',
          });

          if (!s3) throw new BadRequestException('S3 is not configured');
          await s3.send(command);

          // Store only the bucket key path (relative), e.g. "/<prefix>/<uuid>-file.jpg".
          posterBucketPath = `/${key}`;
          postersUploaded += 1;
        } catch {
          postersMissingLocalFile += 1;
        }
      }
    }

    operations.push({
      updateOne: {
        filter: { publicId },
        update: {
          $set: { status: Status.Published },
          $setOnInsert: {
            publicId,
            title,
            date: dateMs,
            city,
            country,
            venue: venue || 'Unknown venue',
            ticketsUrl: ticketsUrl || '',
            ...(posterBucketPath
              ? { poster: { bucketPath: posterBucketPath } }
              : {}),
            posts: [
              {
                to: Messenger.Telegram,
                type: PostType.Publish,
                id: m.id,
                chatId,
                date: dateMs,
              },
            ],
            suggestedBy: { userId: suggestedByUserId },
          },
        },
        upsert: true,
      },
    });
  }

  if (operations.length > 0) {
    await GigModel.bulkWrite(operations, { ordered: false });
  }

  console.log(
    JSON.stringify(
      {
        migration:
          '1740960000002-backfill-gigs-from-telegram-export-with-posters',
        input: inputPath,
        chatId,
        messages_total: parsed.messages.length,
        inserts_attempted: operations.length,
        skipped_missing_title_or_date: skipped,
        posters: {
          referenced: postersReferenced,
          uploaded: postersUploaded,
          missing_local_file: postersMissingLocalFile,
          skipped_missing_s3_config: postersSkippedMissingS3Config,
        },
        defaults: { country, city, suggestedByUserId },
      },
      null,
      2,
    ),
  );
}

export async function down(): Promise<void> {
  return;
}

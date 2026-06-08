import type { Types } from 'mongoose';
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

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
  readonly posts?: readonly GigPostDoc[];
}

export async function up(): Promise<void> {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI must be set in the environment');
  }

  await mongoose.connect(mongoUri);

  const collection = mongoose.connection.collection<GigDoc>('gigs');
  const cursor = collection.find({
    posts: { $exists: true, $ne: [] },
  });

  let updated = 0;

  for await (const gig of cursor) {
    const fallback = gig._id.getTimestamp().getTime();
    let isChanged = false;

    const posts = (gig.posts ?? []).map((post) => {
      if (typeof post.date === 'number' && Number.isFinite(post.date)) {
        return post;
      }
      isChanged = true;
      return { ...post, date: fallback };
    });

    if (!isChanged) {
      continue;
    }

    await collection.updateOne({ _id: gig._id }, { $set: { posts } });
    updated += 1;
  }

  console.log(
    JSON.stringify({
      migration: '1762100000000-backfill-gig-post-posted-at',
      updated,
    }),
  );

  await mongoose.disconnect();
}

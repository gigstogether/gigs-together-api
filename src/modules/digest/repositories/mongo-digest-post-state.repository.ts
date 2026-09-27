import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { DigestPostState as DigestPostStateSchema } from '../digest-post-state.schema';
import type { DigestPostStateDocument } from '../digest-post-state.schema';
import type { DigestPostState } from '../types/digest.types';
import type {
  DigestPostStateRepository,
  SaveSuccessfulDigestPostParams,
} from './digest-post-state.repository';
import { DigestPostStateRepositoryMapper } from './digest-post-state.repository.mapper';
import type { DigestPostStateLeanDocument } from './digest-post-state.repository.mapper';

const DIGEST_POST_STATE_PROJECTION = {
  _id: 0,
  postedAt: 1,
  postUrl: 1,
} as const;

@Injectable()
export class MongoDigestPostStateRepository implements DigestPostStateRepository {
  constructor(
    @InjectModel(DigestPostStateSchema.name)
    private readonly digestPostStateModel: Model<DigestPostStateDocument>,
  ) {}

  async findCurrent(): Promise<DigestPostState | null> {
    const doc = await this.digestPostStateModel
      .findOne({}, DIGEST_POST_STATE_PROJECTION)
      .lean<DigestPostStateLeanDocument>()
      .exec();

    if (!doc) {
      return null;
    }

    return DigestPostStateRepositoryMapper.toDigestPostState(doc);
  }

  async saveSuccessfulPost(
    params: SaveSuccessfulDigestPostParams,
  ): Promise<void> {
    await this.digestPostStateModel
      .findOneAndUpdate(
        {},
        {
          $set: {
            postedAt: params.postedAt,
            postUrl: params.postUrl,
          },
        },
        { upsert: true },
      )
      .exec();
  }
}

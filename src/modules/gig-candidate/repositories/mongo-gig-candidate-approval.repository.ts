import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import type { ClientSession, Model, UpdateQuery } from 'mongoose';
import { Gig } from '../../gig/gig.schema';
import type {
  GigSource,
  GigSourceProvider,
  GigSourceUser,
} from '../../gig/types/gig.types';
import { GigCandidateStatus } from '../types/gig-candidate-status.enum';
import type {
  ApproveGigCandidateRecordParams,
  GigCandidate as GigCandidateDomain,
} from '../types/gig-candidate.types';
import { GigCandidate } from '../gig-candidate.schema';
import type { GigCandidateDocument } from '../gig-candidate.schema';
import type {
  CreateGigAfterApprovalParams,
  GigApprovalResult,
  GigCandidateApprovalRepository,
  GigCandidateApprovalTransaction,
} from './gig-candidate-approval.repository';
import { GigCandidateRepositoryMapper } from './gig-candidate.repository.mapper';
import type { GigCandidateLeanDocument } from './gig-candidate.repository.mapper';

interface GigApprovalResultLeanDocument {
  _id: Types.ObjectId;
  publicId: string;
  title: string;
  date: number;
  endDate?: number;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  poster?: { bucketPath?: string; externalUrl?: string };
  source: unknown;
  version: number;
  isVisible: boolean;
}

type GigStoredSource =
  | (Omit<GigSourceUser, 'userId'> & { userId: Types.ObjectId })
  | GigSourceProvider;

@Injectable()
export class MongoGigCandidateApprovalRepository implements GigCandidateApprovalRepository {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(GigCandidate.name)
    private readonly gigCandidateModel: Model<GigCandidateDocument>,
    @InjectModel(Gig.name)
    private readonly gigModel: Model<Gig>,
  ) {}

  async withTransaction<TResult>(
    work: (transaction: GigCandidateApprovalTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(() =>
        work(this.createTransaction(session)),
      );
    } finally {
      await session.endSession();
    }
  }

  private createTransaction(
    session: ClientSession,
  ): GigCandidateApprovalTransaction {
    return {
      createGigId: () => new Types.ObjectId().toString(),
      findGigCandidateById: (gigCandidateId) =>
        this.findGigCandidateById(gigCandidateId, session),
      findGigById: (gigId) => this.findGigById(gigId, session),
      isGigPublicIdTaken: (publicId) =>
        this.isGigPublicIdTaken(publicId, session),
      approveGigCandidate: (params) =>
        this.approveGigCandidate(params, session),
      createGig: (params) => this.createGig(params, session),
    };
  }

  private async findGigCandidateById(
    gigCandidateId: string,
    session: ClientSession,
  ): Promise<GigCandidateDomain | null> {
    if (!Types.ObjectId.isValid(gigCandidateId)) {
      return null;
    }
    const gigCandidate = await this.gigCandidateModel
      .findById(gigCandidateId)
      .session(session)
      .lean<GigCandidateLeanDocument>()
      .exec();
    return gigCandidate
      ? GigCandidateRepositoryMapper.toGigCandidate(gigCandidate)
      : null;
  }

  private async findGigById(
    gigId: string,
    session: ClientSession,
  ): Promise<GigApprovalResult | null> {
    if (!Types.ObjectId.isValid(gigId)) {
      return null;
    }
    const gig = await this.gigModel
      .findById(gigId)
      .session(session)
      .lean<GigApprovalResultLeanDocument>()
      .exec();
    return gig ? this.mapGigApprovalResult(gig) : null;
  }

  private async isGigPublicIdTaken(
    publicId: string,
    session: ClientSession,
  ): Promise<boolean> {
    const existing = await this.gigModel
      .exists({ publicId })
      .session(session)
      .exec();
    return existing !== null;
  }

  private async approveGigCandidate(
    params: ApproveGigCandidateRecordParams,
    session: ClientSession,
  ): Promise<GigCandidateDomain | null> {
    if (
      !Types.ObjectId.isValid(params.gigCandidateId) ||
      !Types.ObjectId.isValid(params.gigId) ||
      !Types.ObjectId.isValid(params.approvedByUserId) ||
      !Number.isInteger(params.expectedVersion) ||
      params.expectedVersion < 0 ||
      Number.isNaN(params.approvedAt.getTime())
    ) {
      return null;
    }
    const update: UpdateQuery<GigCandidateDocument> = {
      $set: {
        status: GigCandidateStatus.Approved,
        gigId: new Types.ObjectId(params.gigId),
        approvedAt: params.approvedAt,
        approvedByUserId: new Types.ObjectId(params.approvedByUserId),
        gigDraft: params.gigDraft,
      },
      $inc: { version: 1 },
    };
    if (params.moderationPost !== undefined) {
      // TODO: Consider moving messenger post references to a dedicated collection
      //  instead of transferring embedded references between aggregates.
      update.$pull = {
        posts: {
          to: params.moderationPost.to,
          type: params.moderationPost.type,
          chatId: params.moderationPost.chatId,
          id: params.moderationPost.id,
        },
      };
    }

    const gigCandidate = await this.gigCandidateModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(params.gigCandidateId),
          status: GigCandidateStatus.Reviewing,
          version: params.expectedVersion,
          gigId: { $exists: false },
        },
        update,
        {
          returnDocument: 'after',
          runValidators: true,
          session,
        },
      )
      .lean<GigCandidateLeanDocument>()
      .exec();
    return gigCandidate
      ? GigCandidateRepositoryMapper.toGigCandidate(gigCandidate)
      : null;
  }

  private async createGig(
    params: CreateGigAfterApprovalParams,
    session: ClientSession,
  ): Promise<GigApprovalResult> {
    if (!Types.ObjectId.isValid(params.gigId)) {
      throw new Error(`Invalid Gig id: ${params.gigId}`);
    }
    const source = this.mapGigSourceToStorage(params.source);
    const created = await this.gigModel.create(
      [
        {
          _id: new Types.ObjectId(params.gigId),
          publicId: params.publicId,
          title: params.title,
          date: params.date,
          ...(params.endDate !== undefined ? { endDate: params.endDate } : {}),
          city: params.city,
          country: params.country,
          venue: params.venue,
          ticketsUrl: params.ticketsUrl,
          ...(params.poster !== undefined
            ? { poster: { ...params.poster } }
            : {}),
          source,
          version: 0,
          isVisible: true,
          posts:
            params.moderationPost === undefined
              ? []
              : [{ ...params.moderationPost }],
        },
      ],
      { session },
    );
    const gig = created[0];
    if (!gig) {
      throw new Error(`Gig ${params.gigId} was not created.`);
    }
    return this.mapGigApprovalResult(
      gig.toObject<GigApprovalResultLeanDocument>(),
    );
  }

  private mapGigApprovalResult(
    gig: GigApprovalResultLeanDocument,
  ): GigApprovalResult {
    return {
      id: gig._id.toString(),
      publicId: gig.publicId,
      title: gig.title,
      date: gig.date,
      ...(gig.endDate !== undefined ? { endDate: gig.endDate } : {}),
      city: gig.city,
      country: gig.country,
      venue: gig.venue,
      ticketsUrl: gig.ticketsUrl,
      ...(gig.poster !== undefined ? { poster: { ...gig.poster } } : {}),
      source: this.mapGigSourceFromStorage(gig.source),
      version: gig.version,
      isVisible: gig.isVisible,
    };
  }

  private mapGigSourceToStorage(source: GigSource): GigStoredSource {
    return source.type === 'user'
      ? { ...source, userId: new Types.ObjectId(source.userId) }
      : {
          type: 'provider',
          provider: { ...source.provider },
        };
  }

  private mapGigSourceFromStorage(source: unknown): GigSource {
    if (!this.isRecord(source) || typeof source.type !== 'string') {
      throw new Error('Gig source is missing or invalid.');
    }
    if (source.type === 'user') {
      if (
        !(source.userId instanceof Types.ObjectId) ||
        !this.isRecord(source.origin) ||
        (source.origin.type !== 'form' &&
          source.origin.type !== 'admin' &&
          source.origin.type !== 'messenger')
      ) {
        throw new Error('Gig user source is invalid.');
      }
      return {
        type: 'user',
        userId: source.userId.toString(),
        origin: { type: source.origin.type },
      };
    }
    if (source.type === 'provider' && this.isRecord(source.provider)) {
      const provider = source.provider;
      if (
        typeof provider.name === 'string' &&
        provider.name.length > 0 &&
        typeof provider.externalEventId === 'string' &&
        typeof provider.sourceUrl === 'string' &&
        provider.fetchedAt instanceof Date
      ) {
        return {
          type: 'provider',
          provider: {
            name: provider.name,
            externalEventId: provider.externalEventId,
            sourceUrl: provider.sourceUrl,
            fetchedAt: new Date(provider.fetchedAt),
            ...(typeof provider.externalVersionId === 'string'
              ? { externalVersionId: provider.externalVersionId }
              : {}),
            ...(provider.providerUpdatedAt instanceof Date
              ? { providerUpdatedAt: new Date(provider.providerUpdatedAt) }
              : {}),
          },
        };
      }
    }
    throw new Error('Gig provider source is invalid.');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { GigCandidateStatus } from '../types/gig-candidate-status.enum';
import type {
  AppendGigCandidatePostIfAbsentParams,
  CreateGigCandidateParams,
  GigCandidate as GigCandidateDomain,
  FindGigCandidatesParams,
  RejectGigCandidateRecordParams,
  SendGigCandidateToModerationParams,
  UpdateGigCandidateDraftParams,
} from '../types/gig-candidate.types';
import {
  ADMIN_GIG_CANDIDATE_LIST_DEFAULT_SORT_ORDER,
  AdminGigCandidateListSortBy,
  AdminGigCandidateListSortOrder,
} from '../gig-candidate-list-sort';
import { GigCandidate } from '../gig-candidate.schema';
import type { GigCandidateDocument } from '../gig-candidate.schema';
import type { GigCandidateRepository } from './gig-candidate.repository';
import { GigCandidateRepositoryMapper } from './gig-candidate.repository.mapper';
import type { GigCandidateLeanDocument } from './gig-candidate.repository.mapper';

const GIG_CANDIDATE_LEAN_PROJECTION = {
  _id: 1,
  source: 1,
  gigDraft: 1,
  version: 1,
  status: 1,
  posts: 1,
  gigId: 1,
  approvedAt: 1,
  approvedByUserId: 1,
  rejectedAt: 1,
  rejectedByUserId: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

@Injectable()
export class MongoGigCandidateRepository implements GigCandidateRepository {
  private static readonly MAX_LIST_LIMIT = 100;

  constructor(
    @InjectModel(GigCandidate.name)
    private readonly gigCandidateModel: Model<GigCandidateDocument>,
  ) {}

  createId(): string {
    return new Types.ObjectId().toString();
  }

  async createGigCandidate(
    params: CreateGigCandidateParams,
  ): Promise<GigCandidateDomain> {
    if (!Types.ObjectId.isValid(params.gigCandidateId)) {
      throw new Error(`Invalid GigCandidate id: ${params.gigCandidateId}`);
    }

    const created = await this.gigCandidateModel.create({
      _id: new Types.ObjectId(params.gigCandidateId),
      source: {
        ...params.source,
        userId: new Types.ObjectId(params.source.userId),
      },
      gigDraft: params.gigDraft,
      version: 0,
      status: params.status,
      posts: [],
    });

    return GigCandidateRepositoryMapper.toGigCandidate(
      created.toObject<GigCandidateLeanDocument>(),
    );
  }

  async updateGigCandidateDraft(
    params: UpdateGigCandidateDraftParams,
  ): Promise<GigCandidateDomain | null> {
    if (
      !Types.ObjectId.isValid(params.gigCandidateId) ||
      !Number.isInteger(params.expectedVersion) ||
      params.expectedVersion < 0
    ) {
      return null;
    }
    const updated = await this.gigCandidateModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(params.gigCandidateId),
          status: GigCandidateStatus.Reviewing,
          version: params.expectedVersion,
        },
        {
          $set: { gigDraft: params.gigDraft },
          $inc: { version: 1 },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .select(GIG_CANDIDATE_LEAN_PROJECTION)
      .lean<GigCandidateLeanDocument>()
      .exec();

    return updated
      ? GigCandidateRepositoryMapper.toGigCandidate(updated)
      : null;
  }

  async sendGigCandidateToModeration(
    params: SendGigCandidateToModerationParams,
  ): Promise<GigCandidateDomain | null> {
    if (!this.isValidConditionalUpdate(params)) {
      return null;
    }

    const updated = await this.gigCandidateModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(params.gigCandidateId),
          status: GigCandidateStatus.New,
          version: params.expectedVersion,
        },
        {
          $set: { status: GigCandidateStatus.Reviewing },
          $inc: { version: 1 },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .select(GIG_CANDIDATE_LEAN_PROJECTION)
      .lean<GigCandidateLeanDocument>()
      .exec();

    return updated
      ? GigCandidateRepositoryMapper.toGigCandidate(updated)
      : null;
  }

  async rejectGigCandidate(
    params: RejectGigCandidateRecordParams,
  ): Promise<GigCandidateDomain | null> {
    if (
      !this.isValidConditionalUpdate(params) ||
      !Types.ObjectId.isValid(params.rejectedByUserId) ||
      Number.isNaN(params.rejectedAt.getTime())
    ) {
      return null;
    }

    const updated = await this.gigCandidateModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(params.gigCandidateId),
          status: {
            $in: [GigCandidateStatus.New, GigCandidateStatus.Reviewing],
          },
          version: params.expectedVersion,
        },
        {
          $set: {
            status: GigCandidateStatus.Rejected,
            rejectedAt: params.rejectedAt,
            rejectedByUserId: new Types.ObjectId(params.rejectedByUserId),
          },
          $inc: { version: 1 },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .select(GIG_CANDIDATE_LEAN_PROJECTION)
      .lean<GigCandidateLeanDocument>()
      .exec();

    return updated
      ? GigCandidateRepositoryMapper.toGigCandidate(updated)
      : null;
  }

  async findById(gigCandidateId: string): Promise<GigCandidateDomain | null> {
    if (!Types.ObjectId.isValid(gigCandidateId)) {
      return null;
    }

    const doc = await this.gigCandidateModel
      .findById(gigCandidateId, GIG_CANDIDATE_LEAN_PROJECTION)
      .lean<GigCandidateLeanDocument>()
      .exec();

    return doc ? GigCandidateRepositoryMapper.toGigCandidate(doc) : null;
  }

  async findMany(
    params: FindGigCandidatesParams,
  ): Promise<GigCandidateDomain[]> {
    const limit = Math.min(
      Math.max(1, params.limit),
      MongoGigCandidateRepository.MAX_LIST_LIMIT,
    );
    const sortOrder =
      params.sortOrder ?? ADMIN_GIG_CANDIDATE_LIST_DEFAULT_SORT_ORDER;
    const sortDirection: 1 | -1 =
      sortOrder === AdminGigCandidateListSortOrder.Asc ? 1 : -1;
    const sort: Record<string, 1 | -1> =
      params.sortBy === AdminGigCandidateListSortBy.EventDate
        ? { 'gigDraft.date': sortDirection, _id: sortDirection }
        : { createdAt: sortDirection, _id: sortDirection };

    const docs = await this.gigCandidateModel
      .find({ status: params.status }, GIG_CANDIDATE_LEAN_PROJECTION)
      .sort(sort)
      .limit(limit)
      .lean<GigCandidateLeanDocument[]>()
      .exec();

    return docs.map((doc) => GigCandidateRepositoryMapper.toGigCandidate(doc));
  }

  async appendGigCandidatePostIfAbsent(
    params: AppendGigCandidatePostIfAbsentParams,
  ): Promise<GigCandidateDomain | null> {
    if (
      !Types.ObjectId.isValid(params.gigCandidateId) ||
      !Number.isInteger(params.expectedVersion) ||
      params.expectedVersion < 0
    ) {
      return null;
    }

    const updated = await this.gigCandidateModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(params.gigCandidateId),
          version: params.expectedVersion,
          posts: {
            $not: {
              $elemMatch: {
                to: params.post.to,
                type: params.post.type,
              },
            },
          },
        },
        {
          $push: { posts: params.post },
          $inc: { version: 1 },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .select(GIG_CANDIDATE_LEAN_PROJECTION)
      .lean<GigCandidateLeanDocument>()
      .exec();

    return updated
      ? GigCandidateRepositoryMapper.toGigCandidate(updated)
      : null;
  }

  private isValidConditionalUpdate(
    params: SendGigCandidateToModerationParams,
  ): boolean {
    return (
      Types.ObjectId.isValid(params.gigCandidateId) &&
      Number.isInteger(params.expectedVersion) &&
      params.expectedVersion >= 0
    );
  }
}

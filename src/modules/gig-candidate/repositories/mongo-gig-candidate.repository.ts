import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { GigCandidateStatus } from '../types/gig-candidate-status.enum';
import type {
  AppendGigCandidatePostParams,
  CreateGigCandidateRecordParams,
  MarkGigCandidateAcceptedParams,
  MarkGigCandidateRejectedParams,
  GigCandidateRecord,
} from '../types/gig-candidate.types';
import { GigCandidate } from '../gig-candidate.schema';
import type { GigCandidateDocument } from '../gig-candidate.schema';
import type { GigCandidateRepository } from './gig-candidate.repository';
import { GigCandidateRepositoryMapper } from './gig-candidate.repository.mapper';
import type { GigCandidateLeanDocument } from './gig-candidate.repository.mapper';

const GIG_CANDIDATE_LEAN_PROJECTION = {
  _id: 1,
  source: 1,
  title: 1,
  date: 1,
  endDate: 1,
  city: 1,
  country: 1,
  venue: 1,
  ticketsUrl: 1,
  poster: 1,
  status: 1,
  posts: 1,
  suggestedBy: 1,
  gigId: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

@Injectable()
export class MongoGigCandidateRepository implements GigCandidateRepository {
  constructor(
    @InjectModel(GigCandidate.name)
    private readonly gigCandidateModel: Model<GigCandidateDocument>,
  ) {}

  createId(): string {
    return new Types.ObjectId().toString();
  }

  async create(
    params: CreateGigCandidateRecordParams,
  ): Promise<GigCandidateRecord> {
    if (!Types.ObjectId.isValid(params.id)) {
      throw new Error(`Invalid GigCandidate id: ${params.id}`);
    }

    const created = await this.gigCandidateModel.create({
      _id: new Types.ObjectId(params.id),
      source: params.source,
      title: params.title,
      date: params.date,
      ...(params.endDate !== undefined ? { endDate: params.endDate } : {}),
      city: params.city,
      country: params.country,
      ...(params.venue !== undefined ? { venue: params.venue } : {}),
      ...(params.ticketsUrl !== undefined
        ? { ticketsUrl: params.ticketsUrl }
        : {}),
      ...(params.poster !== undefined ? { poster: params.poster } : {}),
      status: GigCandidateStatus.Pending,
      posts: [],
      suggestedBy: params.suggestedBy,
    });

    const lean = await this.gigCandidateModel
      .findById(created._id, GIG_CANDIDATE_LEAN_PROJECTION)
      .lean<GigCandidateLeanDocument>()
      .exec();

    if (!lean) {
      throw new Error(
        `GigCandidate create succeeded but document ${params.id} was not found.`,
      );
    }

    return GigCandidateRepositoryMapper.toGigCandidateRecord(lean);
  }

  async findById(id: string): Promise<GigCandidateRecord | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const doc = await this.gigCandidateModel
      .findById(id, GIG_CANDIDATE_LEAN_PROJECTION)
      .lean<GigCandidateLeanDocument>()
      .exec();

    if (!doc) {
      return null;
    }

    return GigCandidateRepositoryMapper.toGigCandidateRecord(doc);
  }

  async appendSuggestionPost(
    params: AppendGigCandidatePostParams,
  ): Promise<GigCandidateRecord | null> {
    if (!Types.ObjectId.isValid(params.id)) {
      return null;
    }

    const updated = await this.gigCandidateModel
      .findByIdAndUpdate(
        params.id,
        { $push: { posts: params.post } },
        { returnDocument: 'after' },
      )
      .select(GIG_CANDIDATE_LEAN_PROJECTION)
      .lean<GigCandidateLeanDocument>()
      .exec();

    if (!updated) {
      return null;
    }

    return GigCandidateRepositoryMapper.toGigCandidateRecord(updated);
  }

  async markAccepted(
    params: MarkGigCandidateAcceptedParams,
  ): Promise<GigCandidateRecord | null> {
    if (
      !Types.ObjectId.isValid(params.id) ||
      !Types.ObjectId.isValid(params.gigId)
    ) {
      return null;
    }

    const updated = await this.gigCandidateModel
      .findByIdAndUpdate(
        params.id,
        {
          $set: {
            status: GigCandidateStatus.Accepted,
            gigId: new Types.ObjectId(params.gigId),
          },
        },
        { returnDocument: 'after' },
      )
      .select(GIG_CANDIDATE_LEAN_PROJECTION)
      .lean<GigCandidateLeanDocument>()
      .exec();

    if (!updated) {
      return null;
    }

    return GigCandidateRepositoryMapper.toGigCandidateRecord(updated);
  }

  async markRejected(
    params: MarkGigCandidateRejectedParams,
  ): Promise<GigCandidateRecord | null> {
    if (!Types.ObjectId.isValid(params.id)) {
      return null;
    }

    const updated = await this.gigCandidateModel
      .findByIdAndUpdate(
        params.id,
        { $set: { status: GigCandidateStatus.Rejected } },
        { returnDocument: 'after' },
      )
      .select(GIG_CANDIDATE_LEAN_PROJECTION)
      .lean<GigCandidateLeanDocument>()
      .exec();

    if (!updated) {
      return null;
    }

    return GigCandidateRepositoryMapper.toGigCandidateRecord(updated);
  }
}

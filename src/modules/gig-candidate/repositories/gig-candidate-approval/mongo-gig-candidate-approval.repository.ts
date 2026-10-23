import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import type { ClientSession, Model, UpdateQuery } from 'mongoose';
import { Gig } from '../../../gig/gig.schema';
import { GigCandidateStatus } from '../../types/gig-candidate-status.enum';
import type { GigCandidate as GigCandidateDomain } from '../../types/gig-candidate.types';
import { GigCandidate } from '../../gig-candidate.schema';
import type { GigCandidateDocument } from '../../gig-candidate.schema';
import type {
  ApproveGigCandidateRecordParams,
  CreateGigAfterApprovalParams,
  GigApprovalResult,
  GigCandidateApprovalRepository,
  GigCandidateApprovalTransaction,
} from './gig-candidate-approval.repository';
import { GigCandidateApprovalRepositoryMapper } from './gig-candidate-approval.repository.mapper';
import type { GigApprovalResultLeanDocument } from './gig-candidate-approval.repository.mapper';
import { GigCandidateRepositoryMapper } from '../gig-candidate.repository.mapper';
import type { GigCandidateLeanDocument } from '../gig-candidate.repository.mapper';

// TODO: Extract this cross-aggregate transaction boundary as GigCandidateApprovalUnitOfWork.
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
    return gig
      ? GigCandidateApprovalRepositoryMapper.toGigApprovalResult(gig)
      : null;
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
    const document =
      GigCandidateApprovalRepositoryMapper.toGigCreationData(params);
    const created = await this.gigModel.create([document], { session });
    const gig = created[0];
    if (!gig) {
      throw new Error(`Gig ${params.gigId} was not created.`);
    }
    return GigCandidateApprovalRepositoryMapper.toGigApprovalResult(
      gig.toObject<GigApprovalResultLeanDocument>(),
    );
  }
}

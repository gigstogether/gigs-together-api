import { Types } from 'mongoose';
import type { GigStoredSource } from '@modules/gig/gig.schema';
import { GigRepositoryMapper } from '@modules/gig/repositories/gig.repository.mapper';
import type { GigCandidateDraft, GigData } from '@modules/gig/types/gig.types';
import type { GigCandidatePost } from '../../types/gig-candidate.types';
import type {
  CreateGigAfterApprovalParams,
  GigApprovalResult,
} from './gig-candidate-approval.repository';

export interface ApprovedGigCandidateStateFields {
  id: string;
  gigDraft: GigCandidateDraft;
  gigId?: string;
  approvedAt?: Date;
  approvedByUserId?: string;
  hasRejectionAudit: boolean;
}

export interface GigApprovalResultLeanDocument {
  _id: Types.ObjectId;
  communityIds: unknown;
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

export interface GigCreationPersistenceData {
  _id: Types.ObjectId;
  communityIds: Types.ObjectId[];
  publicId: string;
  title: string;
  date: number;
  endDate?: number;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  poster?: { bucketPath?: string; externalUrl?: string };
  source: GigStoredSource;
  version: number;
  isVisible: boolean;
  posts: GigCandidatePost[];
}

export class GigCandidateApprovalRepositoryMapper {
  static assertApprovedStateIsValid(
    params: ApprovedGigCandidateStateFields,
  ): void {
    if (
      params.gigId === undefined ||
      params.approvedAt === undefined ||
      params.approvedByUserId === undefined ||
      params.hasRejectionAudit
    ) {
      throw new Error(
        `GigCandidate ${params.id} Approved state is inconsistent.`,
      );
    }

    const requiredFields: Array<keyof GigData> = [
      'communityIds',
      'title',
      'date',
      'city',
      'country',
      'venue',
      'ticketsUrl',
    ];
    const missingFields = requiredFields.filter(
      (field) => params.gigDraft[field] === undefined,
    );
    if (missingFields.length > 0) {
      throw new Error(
        `GigCandidate ${params.id} Approved gigDraft is missing: ${missingFields.join(', ')}.`,
      );
    }
  }

  static toGigCreationData(
    params: CreateGigAfterApprovalParams,
  ): GigCreationPersistenceData {
    const data: GigCreationPersistenceData = {
      _id: new Types.ObjectId(params.gigId),
      communityIds: GigRepositoryMapper.toStoredCommunityIds(
        params.communityIds,
      ),
      publicId: params.publicId,
      title: params.title,
      date: params.date,
      city: params.city,
      country: params.country,
      venue: params.venue,
      ticketsUrl: params.ticketsUrl,
      source: GigRepositoryMapper.toStoredSource(params.source),
      version: 0,
      isVisible: true,
      posts:
        params.moderationPost === undefined
          ? []
          : [{ ...params.moderationPost }],
    };

    if (params.endDate !== undefined) {
      data.endDate = params.endDate;
    }
    if (params.poster !== undefined) {
      data.poster = { ...params.poster };
    }

    return data;
  }

  static toGigApprovalResult(
    gig: GigApprovalResultLeanDocument,
  ): GigApprovalResult {
    const result: GigApprovalResult = {
      id: gig._id.toString(),
      communityIds: GigRepositoryMapper.fromStoredCommunityIds(
        gig.communityIds,
        `Gig ${gig._id.toString()}`,
      ),
      publicId: gig.publicId,
      title: gig.title,
      date: gig.date,
      city: gig.city,
      country: gig.country,
      venue: gig.venue,
      ticketsUrl: gig.ticketsUrl,
      source: GigRepositoryMapper.fromStoredSource(gig.source),
      version: gig.version,
      isVisible: gig.isVisible,
    };

    if (gig.endDate !== undefined) {
      result.endDate = gig.endDate;
    }
    if (gig.poster !== undefined) {
      result.poster = { ...gig.poster };
    }

    return result;
  }
}

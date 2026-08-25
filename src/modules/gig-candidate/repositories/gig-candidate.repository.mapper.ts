import { Messenger } from '../../../shared/types/messenger.enum';
import type { GigData } from '../../gig/types/gig.types';
import { GigCandidateStatus } from '../types/gig-candidate-status.enum';
import type {
  GigCandidate,
  GigCandidatePost,
  GigCandidateSource,
  GigCandidateSourceProvider,
  GigCandidateSourceUser,
  GigCandidateSourceUserOrigin,
} from '../types/gig-candidate.types';

type MongoId = { toString(): string } | string;
type GigCandidateLeanUserSource = Omit<GigCandidateSourceUser, 'userId'> & {
  userId: MongoId;
};
type GigCandidateLeanSource =
  GigCandidateLeanUserSource | GigCandidateSourceProvider;

const GIG_CANDIDATE_MESSENGER_ORIGIN_KEYS = new Set([
  'type',
  'messenger',
  'chatId',
  'messageId',
]);

export interface GigCandidateLeanDocument {
  _id: MongoId;
  source: GigCandidateLeanSource;
  gigDraft: Partial<GigData>;
  version: number;
  status: GigCandidateStatus;
  posts: GigCandidatePost[];
  gigId?: MongoId;
  approvedAt?: Date;
  approvedByUserId?: MongoId;
  rejectedAt?: Date;
  rejectedByUserId?: MongoId;
  createdAt: Date;
  updatedAt: Date;
}

interface GigCandidateStateFields {
  id: string;
  status: GigCandidateStatus;
  gigDraft: Partial<GigData>;
  gigId?: string;
  approvedAt?: Date;
  approvedByUserId?: string;
  rejectedAt?: Date;
  rejectedByUserId?: string;
}

export class GigCandidateRepositoryMapper {
  static toGigCandidate(doc: GigCandidateLeanDocument): GigCandidate {
    const id = this.toId(doc._id, 'id');
    const gigId = this.toOptionalId(doc.gigId, 'gigId');
    const approvedByUserId = this.toOptionalId(
      doc.approvedByUserId,
      'approvedByUserId',
    );
    const rejectedByUserId = this.toOptionalId(
      doc.rejectedByUserId,
      'rejectedByUserId',
    );

    this.assertStateInvariants({
      id,
      status: doc.status,
      gigDraft: doc.gigDraft,
      gigId,
      approvedAt: doc.approvedAt,
      approvedByUserId,
      rejectedAt: doc.rejectedAt,
      rejectedByUserId,
    });

    return {
      id,
      source: this.toSource(doc.source, id),
      gigDraft: { ...doc.gigDraft },
      version: doc.version,
      status: doc.status,
      posts: doc.posts.map((post) => ({ ...post })),
      ...(gigId !== undefined ? { gigId } : {}),
      ...(doc.approvedAt !== undefined ? { approvedAt: doc.approvedAt } : {}),
      ...(approvedByUserId !== undefined ? { approvedByUserId } : {}),
      ...(doc.rejectedAt !== undefined ? { rejectedAt: doc.rejectedAt } : {}),
      ...(rejectedByUserId !== undefined ? { rejectedByUserId } : {}),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private static toSource(
    source: GigCandidateLeanSource,
    id: string,
  ): GigCandidateSource {
    if (typeof source !== 'object' || source === null) {
      throw new Error(`GigCandidate ${id} source must be an object.`);
    }

    switch (source.type) {
      case 'user': {
        if ('provider' in source) {
          throw new Error(`GigCandidate ${id} user source is inconsistent.`);
        }
        return {
          ...source,
          userId: this.toId(source.userId, 'source.userId'),
          origin: this.toUserOrigin(source.origin, id),
          ...(source.attachments !== undefined
            ? {
                attachments: source.attachments.map((attachment) => ({
                  ...attachment,
                })),
              }
            : {}),
        };
      }
      case 'provider':
        if (
          'userId' in source ||
          'origin' in source ||
          'originalText' in source ||
          'attachments' in source
        ) {
          throw new Error(
            `GigCandidate ${id} provider source is inconsistent.`,
          );
        }
        return {
          type: 'provider',
          provider: { ...source.provider },
        };
      default:
        throw new Error(`GigCandidate ${id} source type is invalid.`);
    }
  }

  private static toUserOrigin(
    origin: GigCandidateSourceUserOrigin,
    id: string,
  ): GigCandidateSourceUserOrigin {
    if (!this.isRecord(origin)) {
      throw new Error(`GigCandidate ${id} source origin must be an object.`);
    }

    switch (origin.type) {
      case 'form':
      case 'admin':
        return { type: origin.type };
      case 'messenger':
        if (!Object.values(Messenger).includes(origin.messenger)) {
          throw new Error(`GigCandidate ${id} source messenger is invalid.`);
        }
        if (
          Object.keys(origin).some(
            (key) => !GIG_CANDIDATE_MESSENGER_ORIGIN_KEYS.has(key),
          )
        ) {
          throw new Error(
            `GigCandidate ${id} source messenger origin is inconsistent.`,
          );
        }
        if (typeof origin.chatId !== 'string' || !origin.chatId.trim()) {
          throw new Error(`GigCandidate ${id} source chatId is invalid.`);
        }
        if (typeof origin.messageId !== 'string' || !origin.messageId.trim()) {
          throw new Error(`GigCandidate ${id} source messageId is invalid.`);
        }
        return {
          type: 'messenger',
          messenger: origin.messenger,
          chatId: origin.chatId,
          messageId: origin.messageId,
        };
      default:
        throw new Error(`GigCandidate ${id} source origin type is invalid.`);
    }
  }

  private static assertStateInvariants(params: GigCandidateStateFields): void {
    const hasApprovalAudit =
      params.approvedAt !== undefined || params.approvedByUserId !== undefined;
    const hasRejectionAudit =
      params.rejectedAt !== undefined || params.rejectedByUserId !== undefined;

    switch (params.status) {
      case GigCandidateStatus.New:
      case GigCandidateStatus.Reviewing:
        if (
          params.gigId !== undefined ||
          hasApprovalAudit ||
          hasRejectionAudit
        ) {
          throw new Error(
            `GigCandidate ${params.id} ${params.status} state has terminal fields.`,
          );
        }
        return;
      case GigCandidateStatus.Approved:
        if (
          params.gigId === undefined ||
          params.approvedAt === undefined ||
          params.approvedByUserId === undefined ||
          hasRejectionAudit
        ) {
          throw new Error(
            `GigCandidate ${params.id} Approved state is inconsistent.`,
          );
        }
        this.assertCompleteGigDraft(params.gigDraft, params.id);
        return;
      case GigCandidateStatus.Rejected:
        if (
          params.gigId !== undefined ||
          hasApprovalAudit ||
          params.rejectedAt === undefined ||
          params.rejectedByUserId === undefined
        ) {
          throw new Error(
            `GigCandidate ${params.id} Rejected state is inconsistent.`,
          );
        }
        return;
      default:
        throw new Error(`GigCandidate ${params.id} status is invalid.`);
    }
  }

  private static assertCompleteGigDraft(
    gigDraft: Partial<GigData>,
    id: string,
  ): void {
    const requiredFields: Array<keyof GigData> = [
      'title',
      'date',
      'city',
      'country',
      'venue',
      'ticketsUrl',
    ];
    const missingFields = requiredFields.filter(
      (field) => gigDraft[field] === undefined,
    );
    if (missingFields.length > 0) {
      throw new Error(
        `GigCandidate ${id} Approved gigDraft is missing: ${missingFields.join(', ')}.`,
      );
    }
  }

  private static toId(value: MongoId, field: string): string {
    const id = typeof value === 'string' ? value : value.toString();
    if (!id || id === '[object Object]') {
      throw new Error(`GigCandidate ${field} must be a valid id.`);
    }
    return id;
  }

  private static toOptionalId(
    value: MongoId | undefined,
    field: string,
  ): string | undefined {
    return value === undefined ? undefined : this.toId(value, field);
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}

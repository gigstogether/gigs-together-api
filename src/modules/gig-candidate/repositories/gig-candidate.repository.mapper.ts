import { Types } from 'mongoose';
import { Messenger } from '@shared/types/messenger.enum';
import { isRecord } from '@shared/utils/is-record';
import {
  fromObjectIdArray,
  toObjectIdArray,
} from '@shared/utils/mongoose-object-id-array';
import type { GigCandidateDraft } from '@modules/gig/types/gig.types';
import { GigSourceType } from '../../gig/types/gig-source-type.enum';
import type { GigCandidateStoredSource } from '../gig-candidate.schema';
import { GigCandidateStatus } from '../types/gig-candidate-status.enum';
import { GigSourceUserOriginType } from '../../gig/types/gig-source-user-origin-type.enum';
import { isGigCandidateSourceMessengerUser } from '../gig-candidate-source.guards';
import type {
  GigCandidate,
  GigCandidatePost,
  GigCandidateSource,
  GigCandidateSourceIdentifiedUser,
  GigCandidateSourceMessengerUser,
  GigCandidateSourceProvider,
} from '../types/gig-candidate.types';
import { GigCandidateApprovalRepositoryMapper } from '../gig-candidate-approval/repositories/gig-candidate-approval.repository.mapper';

type MongoId = { toString(): string } | string;
type GigCandidateLeanIdentifiedUserSource = Omit<
  GigCandidateSourceIdentifiedUser,
  'userId'
> & { userId: MongoId };
type GigCandidateLeanMessengerUserSource = Omit<
  GigCandidateSourceMessengerUser,
  'userId'
> & { userId?: MongoId };
type GigCandidateLeanSource =
  | GigCandidateLeanIdentifiedUserSource
  | GigCandidateLeanMessengerUserSource
  | GigCandidateSourceProvider;

const GIG_CANDIDATE_MESSENGER_SOURCE_KEYS = new Set([
  'type',
  'userId',
  'origin',
  'originalText',
  'image',
]);
const GIG_CANDIDATE_MESSENGER_IMAGE_KEYS = new Set([
  'bucketPath',
  'telegramFileId',
]);
const GIG_CANDIDATE_MESSENGER_ORIGIN_KEYS = new Set([
  'type',
  'messenger',
  'message',
]);
const GIG_CANDIDATE_MESSENGER_MESSAGE_KEYS = new Set(['chatId', 'messageId']);
const GIG_CANDIDATE_IDENTIFIED_USER_SOURCE_KEYS = new Set([
  'type',
  'userId',
  'origin',
]);
const GIG_CANDIDATE_PROVIDER_SOURCE_KEYS = new Set(['type', 'provider']);

export interface GigCandidateLeanDocument {
  _id: MongoId;
  source: GigCandidateLeanSource;
  localityId?: MongoId;
  gigDraft: Omit<GigCandidateDraft, 'communityIds' | 'venueIds'> & {
    communityIds: unknown;
    venueIds?: unknown;
  };
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
  localityId?: string;
  gigDraft: GigCandidateDraft;
  gigId?: string;
  approvedAt?: Date;
  approvedByUserId?: string;
  rejectedAt?: Date;
  rejectedByUserId?: string;
}

export class GigCandidateRepositoryMapper {
  static toStoredGigDraft(gigDraft: GigCandidateDraft): Omit<
    GigCandidateDraft,
    'communityIds' | 'venueIds'
  > & {
    communityIds: Types.ObjectId[];
    venueIds?: Types.ObjectId[];
  } {
    const { communityIds, venueIds, ...draft } = gigDraft;
    const storedDraft: Omit<GigCandidateDraft, 'communityIds' | 'venueIds'> & {
      communityIds: Types.ObjectId[];
      venueIds?: Types.ObjectId[];
    } = {
      ...this.mapGigCandidateDraftFields(draft),
      communityIds: toObjectIdArray(
        communityIds,
        'GigCandidate gigDraft communityIds',
      ),
    };

    if (venueIds !== undefined) {
      storedDraft.venueIds = toObjectIdArray(
        venueIds,
        'GigCandidate gigDraft venueIds',
      );
    }

    return storedDraft;
  }

  static toStoredSource(source: GigCandidateSource): GigCandidateStoredSource {
    switch (source.type) {
      case GigSourceType.User: {
        if (isGigCandidateSourceMessengerUser(source)) {
          this.assertMessengerUserSourceContentIsValid(source);
          const storedSource: GigCandidateStoredSource = {
            type: GigSourceType.User,
            origin: {
              type: GigSourceUserOriginType.Messenger,
              messenger: source.origin.messenger,
              message: { ...source.origin.message },
            },
          };
          if (source.originalText !== undefined) {
            storedSource.originalText = source.originalText;
          }
          if (source.image !== undefined) {
            storedSource.image = { ...source.image };
          }
          if (source.userId !== undefined) {
            storedSource.userId = this.toObjectId(source.userId);
          }
          return storedSource;
        }
        if (!Types.ObjectId.isValid(source.userId)) {
          throw new Error(
            `Invalid GigCandidate source user id: ${source.userId}`,
          );
        }
        return {
          type: GigSourceType.User,
          userId: new Types.ObjectId(source.userId),
          origin: { ...source.origin },
        };
      }
      case GigSourceType.Provider:
        return {
          type: GigSourceType.Provider,
          provider: { ...source.provider },
        };
      default:
        throw new Error('Unsupported GigCandidate source type.');
    }
  }

  static toGigCandidate(doc: GigCandidateLeanDocument): GigCandidate {
    const id = this.toId(doc._id, 'id');
    const { communityIds, venueIds, ...draft } = doc.gigDraft;
    const gigDraft: GigCandidateDraft = {
      ...this.mapGigCandidateDraftFields(draft),
      communityIds: fromObjectIdArray(
        communityIds,
        `GigCandidate ${id} gigDraft communityIds`,
      ),
    };
    if (venueIds !== undefined) {
      gigDraft.venueIds = fromObjectIdArray(
        venueIds,
        `GigCandidate ${id} gigDraft venueIds`,
      );
    }
    const localityId = this.toOptionalId(doc.localityId, 'localityId');
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
      localityId,
      gigDraft,
      gigId,
      approvedAt: doc.approvedAt,
      approvedByUserId,
      rejectedAt: doc.rejectedAt,
      rejectedByUserId,
    });

    const gigCandidate: GigCandidate = {
      id,
      source: this.toSource(doc.source, id),
      gigDraft,
      version: doc.version,
      status: doc.status,
      posts: doc.posts.map((post) => ({ ...post })),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
    if (localityId !== undefined) {
      gigCandidate.localityId = localityId;
    }
    if (gigId !== undefined) {
      gigCandidate.gigId = gigId;
    }
    if (doc.approvedAt !== undefined) {
      gigCandidate.approvedAt = doc.approvedAt;
    }
    if (approvedByUserId !== undefined) {
      gigCandidate.approvedByUserId = approvedByUserId;
    }
    if (doc.rejectedAt !== undefined) {
      gigCandidate.rejectedAt = doc.rejectedAt;
    }
    if (rejectedByUserId !== undefined) {
      gigCandidate.rejectedByUserId = rejectedByUserId;
    }

    return gigCandidate;
  }

  private static mapGigCandidateDraftFields(
    draft: Omit<GigCandidateDraft, 'communityIds' | 'venueIds'>,
  ): Omit<GigCandidateDraft, 'communityIds' | 'venueIds'> {
    const fields: Omit<GigCandidateDraft, 'communityIds' | 'venueIds'> = {};
    if (draft.title !== undefined) {
      fields.title = draft.title;
    }
    if (draft.date !== undefined) {
      fields.date = draft.date;
    }
    if (draft.endDate !== undefined) {
      fields.endDate = draft.endDate;
    }
    if (draft.ticketsUrl !== undefined) {
      fields.ticketsUrl = draft.ticketsUrl;
    }
    if (draft.poster !== undefined) {
      fields.poster = { ...draft.poster };
    }
    return fields;
  }

  private static toSource(
    source: GigCandidateLeanSource,
    id: string,
  ): GigCandidateSource {
    if (typeof source !== 'object' || source === null) {
      throw new Error(`GigCandidate ${id} source must be an object.`);
    }

    switch (source.type) {
      case GigSourceType.User: {
        if (!isRecord(source.origin)) {
          throw new Error(`GigCandidate ${id} user source is inconsistent.`);
        }

        if (this.isLeanMessengerUserSource(source)) {
          return this.toMessengerUserSource(source, id);
        }

        if (
          source.origin.type !== GigSourceUserOriginType.Form &&
          source.origin.type !== GigSourceUserOriginType.Admin
        ) {
          throw new Error(`GigCandidate ${id} source origin type is invalid.`);
        }

        if (source.userId === undefined) {
          throw new Error(`GigCandidate ${id} source user id is invalid.`);
        }
        if (
          Object.keys(source).some(
            (key) => !GIG_CANDIDATE_IDENTIFIED_USER_SOURCE_KEYS.has(key),
          )
        ) {
          throw new Error(`GigCandidate ${id} user source is inconsistent.`);
        }
        return {
          type: GigSourceType.User,
          userId: this.toId(source.userId, 'source.userId'),
          origin: { type: source.origin.type },
        };
      }
      case GigSourceType.Provider:
        if (
          Object.keys(source).some(
            (key) => !GIG_CANDIDATE_PROVIDER_SOURCE_KEYS.has(key),
          )
        ) {
          throw new Error(
            `GigCandidate ${id} provider source is inconsistent.`,
          );
        }
        return {
          type: GigSourceType.Provider,
          provider: { ...source.provider },
        };
      default:
        throw new Error(`GigCandidate ${id} source type is invalid.`);
    }
  }

  private static toMessengerUserSource(
    source: GigCandidateLeanMessengerUserSource,
    id: string,
  ): GigCandidateSourceMessengerUser {
    this.assertStoredMessengerUserSourceIsValid(source, id);

    const origin = source.origin;
    const message = origin.message;

    const messengerSource: GigCandidateSourceMessengerUser = {
      type: GigSourceType.User,
      origin: {
        type: GigSourceUserOriginType.Messenger,
        messenger: Messenger.Telegram,
        message: {
          chatId: message.chatId,
          messageId: message.messageId,
        },
      },
    };
    if (source.originalText !== undefined) {
      messengerSource.originalText = source.originalText;
    }
    if (source.image !== undefined) {
      messengerSource.image = { ...source.image };
    }
    if (source.userId !== undefined) {
      messengerSource.userId = this.toId(source.userId, 'source.userId');
    }
    return messengerSource;
  }

  private static assertStoredMessengerUserSourceIsValid(
    source: GigCandidateLeanMessengerUserSource,
    id: string,
  ): void {
    const origin = source.origin;
    if (
      Object.keys(source).some(
        (key) => !GIG_CANDIDATE_MESSENGER_SOURCE_KEYS.has(key),
      )
    ) {
      throw new Error(`GigCandidate ${id} messenger source is inconsistent.`);
    }
    if (
      Object.keys(origin).some(
        (key) => !GIG_CANDIDATE_MESSENGER_ORIGIN_KEYS.has(key),
      )
    ) {
      throw new Error(`GigCandidate ${id} messenger source is inconsistent.`);
    }
    if (origin.messenger !== Messenger.Telegram) {
      throw new Error(`GigCandidate ${id} messenger source is inconsistent.`);
    }
    if (!isRecord(origin.message)) {
      throw new Error(`GigCandidate ${id} messenger source is inconsistent.`);
    }

    const message = origin.message;
    if (
      Object.keys(origin.message).some(
        (key) => !GIG_CANDIDATE_MESSENGER_MESSAGE_KEYS.has(key),
      )
    ) {
      throw new Error(`GigCandidate ${id} messenger source is inconsistent.`);
    }
    if (
      !Number.isSafeInteger(message.chatId) ||
      message.chatId === 0 ||
      !Number.isSafeInteger(message.messageId) ||
      message.messageId <= 0
    ) {
      throw new Error(`GigCandidate ${id} messenger source is inconsistent.`);
    }
    this.assertMessengerUserSourceContentIsValid(source, id);
  }

  private static assertMessengerUserSourceContentIsValid(
    source: Pick<GigCandidateSourceMessengerUser, 'originalText' | 'image'>,
    id?: string,
  ): void {
    const errorMessage =
      id === undefined
        ? 'GigCandidate messenger source is inconsistent.'
        : `GigCandidate ${id} messenger source is inconsistent.`;
    if (
      source.originalText !== undefined &&
      (typeof source.originalText !== 'string' ||
        source.originalText.trim() === '')
    ) {
      throw new Error(errorMessage);
    }
    if (
      source.image !== undefined &&
      (!isRecord(source.image) ||
        Object.keys(source.image).some(
          (key) => !GIG_CANDIDATE_MESSENGER_IMAGE_KEYS.has(key),
        ) ||
        typeof source.image.bucketPath !== 'string' ||
        source.image.bucketPath.trim() === '' ||
        (source.image.telegramFileId !== undefined &&
          (typeof source.image.telegramFileId !== 'string' ||
            source.image.telegramFileId.trim() === '')))
    ) {
      throw new Error(errorMessage);
    }
    if (source.originalText === undefined && source.image === undefined) {
      throw new Error(errorMessage);
    }
  }

  private static isLeanMessengerUserSource(
    source: GigCandidateLeanSource,
  ): source is GigCandidateLeanMessengerUserSource {
    return (
      source.type === GigSourceType.User &&
      source.origin.type === GigSourceUserOriginType.Messenger
    );
  }

  private static toObjectId(value: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new Error(`Invalid GigCandidate source user id: ${value}`);
    }
    return new Types.ObjectId(value);
  }

  private static assertStateInvariants(params: GigCandidateStateFields): void {
    if (
      params.localityId !== undefined &&
      params.gigDraft.venueIds !== undefined
    ) {
      throw new Error(
        `GigCandidate ${params.id} must not store localityId and gigDraft.venueIds together.`,
      );
    }

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
        GigCandidateApprovalRepositoryMapper.assertApprovedStateIsValid({
          id: params.id,
          gigDraft: params.gigDraft,
          gigId: params.gigId,
          approvedAt: params.approvedAt,
          approvedByUserId: params.approvedByUserId,
          hasRejectionAudit,
        });
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
}

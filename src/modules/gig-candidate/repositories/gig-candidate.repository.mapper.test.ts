import { Types } from 'mongoose';
import { Messenger } from '../../../shared/types/messenger.enum';
import { GigSourceType } from '../../gig/types/gig-source-type.enum';
import { GigSourceUserOriginType } from '../../gig/types/gig-source-user-origin-type.enum';
import { GigCandidateStatus } from '../types/gig-candidate-status.enum';
import type { GigCandidateSourceMessengerUser } from '../types/gig-candidate.types';
import { GigCandidateRepositoryMapper } from './gig-candidate.repository.mapper';
import type { GigCandidateLeanDocument } from './gig-candidate.repository.mapper';

const GIG_CANDIDATE_ID = '507f1f77bcf86cd799439099';
const USER_ID = '507f1f77bcf86cd799439088';
const GIG_ID = '507f1f77bcf86cd799439011';

function buildTargetDocument(
  overrides: Partial<GigCandidateLeanDocument> = {},
): GigCandidateLeanDocument {
  return {
    _id: GIG_CANDIDATE_ID,
    source: {
      type: GigSourceType.User,
      userId: USER_ID,
      origin: { type: GigSourceUserOriginType.Form },
    },
    gigDraft: {},
    version: 0,
    status: GigCandidateStatus.New,
    posts: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  };
}

const completeGigDraft = {
  title: 'Band',
  date: 1_800_000_000_000,
  city: 'Barcelona',
  country: 'ES',
  venue: 'Venue',
  ticketsUrl: 'https://example.com/tickets',
};

describe('GigCandidateRepositoryMapper', () => {
  describe('toStoredSource', () => {
    it('should convert a user id to ObjectId', () => {
      const source = GigCandidateRepositoryMapper.toStoredSource({
        type: GigSourceType.User,
        userId: USER_ID,
        origin: { type: GigSourceUserOriginType.Form },
      });

      expect(source).toEqual({
        type: GigSourceType.User,
        userId: expect.any(Types.ObjectId),
        origin: { type: GigSourceUserOriginType.Form },
      });
    });

    it('should preserve an anonymous messenger source', () => {
      const source = {
        type: GigSourceType.User,
        origin: {
          type: GigSourceUserOriginType.Messenger,
          messenger: Messenger.Telegram,
          message: { chatId: -100123, messageId: 42 },
        },
        originalText: 'Unchanged text',
      } satisfies GigCandidateSourceMessengerUser;

      expect(GigCandidateRepositoryMapper.toStoredSource(source)).toEqual(
        source,
      );
    });

    it('should convert an optional messenger user id to ObjectId', () => {
      const source = GigCandidateRepositoryMapper.toStoredSource({
        type: GigSourceType.User,
        userId: USER_ID,
        origin: {
          type: GigSourceUserOriginType.Messenger,
          messenger: Messenger.Telegram,
          message: { chatId: -100123, messageId: 42 },
        },
        originalText: 'Unchanged text',
      });

      expect(source).toEqual({
        type: GigSourceType.User,
        userId: expect.any(Types.ObjectId),
        origin: {
          type: GigSourceUserOriginType.Messenger,
          messenger: Messenger.Telegram,
          message: { chatId: -100123, messageId: 42 },
        },
        originalText: 'Unchanged text',
      });
    });
  });

  describe('toGigCandidate', () => {
    it.each([
      {
        name: 'New',
        document: buildTargetDocument(),
      },
      {
        name: 'Reviewing',
        document: buildTargetDocument({
          status: GigCandidateStatus.Reviewing,
          gigDraft: { title: 'Draft title' },
        }),
      },
      {
        name: 'Approved',
        document: buildTargetDocument({
          status: GigCandidateStatus.Approved,
          gigDraft: completeGigDraft,
          gigId: GIG_ID,
          approvedAt: new Date('2026-01-03T00:00:00.000Z'),
          approvedByUserId: USER_ID,
        }),
      },
      {
        name: 'Rejected',
        document: buildTargetDocument({
          status: GigCandidateStatus.Rejected,
          rejectedAt: new Date('2026-01-03T00:00:00.000Z'),
          rejectedByUserId: USER_ID,
        }),
      },
    ])('should map a valid $name state', ({ document }) => {
      const gigCandidate =
        GigCandidateRepositoryMapper.toGigCandidate(document);

      expect(gigCandidate.status).toBe(document.status);
    });

    it.each([
      {
        name: 'New with gigId',
        document: buildTargetDocument({ gigId: GIG_ID }),
      },
      {
        name: 'Reviewing with approval audit',
        document: buildTargetDocument({
          status: GigCandidateStatus.Reviewing,
          approvedAt: new Date('2026-01-03T00:00:00.000Z'),
          approvedByUserId: USER_ID,
        }),
      },
      {
        name: 'New with rejection audit',
        document: buildTargetDocument({
          rejectedAt: new Date('2026-01-03T00:00:00.000Z'),
          rejectedByUserId: USER_ID,
        }),
      },
      {
        name: 'Approved without gigId',
        document: buildTargetDocument({
          status: GigCandidateStatus.Approved,
          gigDraft: completeGigDraft,
          approvedAt: new Date('2026-01-03T00:00:00.000Z'),
          approvedByUserId: USER_ID,
        }),
      },
      {
        name: 'Approved with incomplete audit',
        document: buildTargetDocument({
          status: GigCandidateStatus.Approved,
          gigDraft: completeGigDraft,
          gigId: GIG_ID,
          approvedAt: new Date('2026-01-03T00:00:00.000Z'),
        }),
      },
      {
        name: 'Approved with incomplete gigDraft',
        document: buildTargetDocument({
          status: GigCandidateStatus.Approved,
          gigDraft: { title: 'Band' },
          gigId: GIG_ID,
          approvedAt: new Date('2026-01-03T00:00:00.000Z'),
          approvedByUserId: USER_ID,
        }),
      },
      {
        name: 'Approved with rejection audit',
        document: buildTargetDocument({
          status: GigCandidateStatus.Approved,
          gigDraft: completeGigDraft,
          gigId: GIG_ID,
          approvedAt: new Date('2026-01-03T00:00:00.000Z'),
          approvedByUserId: USER_ID,
          rejectedAt: new Date('2026-01-04T00:00:00.000Z'),
          rejectedByUserId: USER_ID,
        }),
      },
      {
        name: 'Rejected with gigId',
        document: buildTargetDocument({
          status: GigCandidateStatus.Rejected,
          gigId: GIG_ID,
          rejectedAt: new Date('2026-01-03T00:00:00.000Z'),
          rejectedByUserId: USER_ID,
        }),
      },
      {
        name: 'Rejected without reviewer',
        document: buildTargetDocument({
          status: GigCandidateStatus.Rejected,
          rejectedAt: new Date('2026-01-03T00:00:00.000Z'),
        }),
      },
      {
        name: 'Rejected with approval audit',
        document: buildTargetDocument({
          status: GigCandidateStatus.Rejected,
          approvedAt: new Date('2026-01-03T00:00:00.000Z'),
          approvedByUserId: USER_ID,
          rejectedAt: new Date('2026-01-04T00:00:00.000Z'),
          rejectedByUserId: USER_ID,
        }),
      },
    ])('should reject invalid $name state', ({ document }) => {
      expect(() =>
        GigCandidateRepositoryMapper.toGigCandidate(document),
      ).toThrowError(/GigCandidate/);
    });

    it('should parse messenger source and preserve original text', () => {
      const document = buildTargetDocument({
        source: {
          type: GigSourceType.User,
          origin: {
            type: GigSourceUserOriginType.Messenger,
            messenger: Messenger.Telegram,
            message: { chatId: -100123, messageId: 42 },
          },
          originalText: 'Unchanged text',
        },
      });

      const gigCandidate =
        GigCandidateRepositoryMapper.toGigCandidate(document);

      expect(gigCandidate.source).toEqual(document.source);
    });

    it('should reject an invalid messenger message reference', () => {
      const document = buildTargetDocument({
        source: {
          type: GigSourceType.User,
          origin: {
            type: GigSourceUserOriginType.Messenger,
            messenger: Messenger.Telegram,
            message: { chatId: -100123, messageId: 0 },
          },
          originalText: 'Unchanged text',
        },
      });

      expect(() =>
        GigCandidateRepositoryMapper.toGigCandidate(document),
      ).toThrowError(/messenger source is inconsistent/);
    });

    it('should reject messenger fields outside the target contract', () => {
      const source: GigCandidateSourceMessengerUser & {
        unexpectedField: string;
      } = {
        type: GigSourceType.User,
        origin: {
          type: GigSourceUserOriginType.Messenger,
          messenger: Messenger.Telegram,
          message: { chatId: -100123, messageId: 42 },
        },
        originalText: 'Unchanged text',
        unexpectedField: 'unexpected',
      };
      const document = buildTargetDocument({
        source,
      });

      expect(() =>
        GigCandidateRepositoryMapper.toGigCandidate(document),
      ).toThrowError(/messenger source is inconsistent/);
    });

    it('should parse provider source without flat user fields', () => {
      const document = buildTargetDocument({
        source: {
          type: GigSourceType.Provider,
          provider: {
            name: 'exampleProvider',
            externalEventId: 'event-1',
            externalVersionId: 'version-1',
            sourceUrl: 'https://example.com/events/1',
            fetchedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        },
      });

      const gigCandidate =
        GigCandidateRepositoryMapper.toGigCandidate(document);

      expect(gigCandidate.source).toEqual(document.source);
    });

    it('should reject source-specific fields outside the selected union member', () => {
      const document = buildTargetDocument({
        source: {
          type: GigSourceType.Provider,
          userId: USER_ID,
          provider: {
            name: 'exampleProvider',
            externalEventId: 'event-1',
            sourceUrl: 'https://example.com/events/1',
            fetchedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        } as unknown as GigCandidateLeanDocument['source'],
      });

      expect(() =>
        GigCandidateRepositoryMapper.toGigCandidate(document),
      ).toThrowError(/inconsistent/);
    });
  });
});

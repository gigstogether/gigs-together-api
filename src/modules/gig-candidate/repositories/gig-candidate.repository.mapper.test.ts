import { Messenger } from '../../../shared/types/messenger.enum';
import { GigCandidateStatus } from '../types/gig-candidate-status.enum';
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
      type: 'user',
      userId: USER_ID,
      origin: { type: 'form' },
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

    it('should parse user messenger source and preserve original input', () => {
      const document = buildTargetDocument({
        source: {
          type: 'user',
          userId: USER_ID,
          origin: {
            type: 'messenger',
            messenger: Messenger.Telegram,
            chatId: 'chat-1',
            messageId: 'message-1',
          },
          originalText: 'Unchanged text',
          attachments: [{ bucketPath: 'gigCandidate/screenshot.jpg' }],
        },
      });

      const gigCandidate =
        GigCandidateRepositoryMapper.toGigCandidate(document);

      expect(gigCandidate.source).toEqual(document.source);
    });

    it('should reject messenger origin without chatId', () => {
      const document = buildTargetDocument({
        source: {
          type: 'user',
          userId: USER_ID,
          origin: {
            type: 'messenger',
            messenger: Messenger.Telegram,
            messageId: 'message-1',
          },
        } as unknown as GigCandidateLeanDocument['source'],
      });

      expect(() =>
        GigCandidateRepositoryMapper.toGigCandidate(document),
      ).toThrowError(/chatId is invalid/);
    });

    it('should reject messenger origin fields outside the target contract', () => {
      const document = buildTargetDocument({
        source: {
          type: 'user',
          userId: USER_ID,
          origin: {
            type: 'messenger',
            messenger: Messenger.Telegram,
            chatId: 'chat-1',
            messageId: 'message-1',
            unexpectedField: 'unexpected',
          },
        } as unknown as GigCandidateLeanDocument['source'],
      });

      expect(() =>
        GigCandidateRepositoryMapper.toGigCandidate(document),
      ).toThrowError(/messenger origin is inconsistent/);
    });

    it('should parse provider source without flat user fields', () => {
      const document = buildTargetDocument({
        source: {
          type: 'provider',
          provider: {
            name: 'setlistFm',
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
          type: 'provider',
          userId: USER_ID,
          provider: {
            name: 'setlistFm',
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

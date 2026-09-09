import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Gig } from '../../gig/gig.schema';
import { Messenger } from '../../../shared/types/messenger.enum';
import { PostType } from '../../../shared/types/post-type.enum';
import { GigCandidateStatus } from '../types/gig-candidate-status.enum';
import { GigCandidate } from '../gig-candidate.schema';
import { MongoGigCandidateApprovalRepository } from './mongo-gig-candidate-approval.repository';

describe('MongoGigCandidateApprovalRepository', () => {
  const session = {
    withTransaction: vi.fn(),
    endSession: vi.fn(),
  };
  const connection = { startSession: vi.fn() };
  const gigCandidateFindById = vi.fn();
  const gigCandidateFindOneAndUpdate = vi.fn();
  const gigFindById = vi.fn();
  const gigExists = vi.fn();
  const gigCreate = vi.fn();
  let repository: MongoGigCandidateApprovalRepository;

  beforeEach(async () => {
    session.withTransaction.mockImplementation((work: () => Promise<unknown>) =>
      work(),
    );
    connection.startSession.mockResolvedValue(session);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MongoGigCandidateApprovalRepository,
        { provide: getConnectionToken(), useValue: connection },
        {
          provide: getModelToken(GigCandidate.name),
          useValue: {
            findById: gigCandidateFindById,
            findOneAndUpdate: gigCandidateFindOneAndUpdate,
          },
        },
        {
          provide: getModelToken(Gig.name),
          useValue: {
            findById: gigFindById,
            exists: gigExists,
            create: gigCreate,
          },
        },
      ],
    }).compile();
    repository = module.get(MongoGigCandidateApprovalRepository);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should use one session for the conditional approval and statusless Gig insert', async () => {
    const gigCandidateId = '507f1f77bcf86cd799439099';
    const gigId = '507f1f77bcf86cd799439011';
    const approvedByUserId = '507f1f77bcf86cd799439077';
    const moderationPost = {
      to: Messenger.Telegram,
      type: PostType.Moderation,
      date: 1_700_000_001_000,
      id: 50,
      chatId: -200,
    } as const;
    const reviewing = buildGigCandidateDocument({
      _id: new Types.ObjectId(gigCandidateId),
      status: GigCandidateStatus.Reviewing,
      version: 0,
      posts: [moderationPost],
    });
    const approved = buildGigCandidateDocument({
      ...reviewing,
      gigDraft: {
        title: 'Radiohead',
        date: Date.UTC(2026, 5, 12),
        city: 'Barcelona',
        country: 'ES',
        venue: 'Palau Sant Jordi',
        ticketsUrl: 'https://tickets.example/radiohead',
      },
      status: GigCandidateStatus.Approved,
      version: 1,
      posts: [],
      gigId: new Types.ObjectId(gigId),
      approvedAt: new Date('2026-09-01T12:00:00.000Z'),
      approvedByUserId: new Types.ObjectId(approvedByUserId),
    });
    gigCandidateFindById.mockReturnValue(queryResult(reviewing));
    gigExists.mockReturnValue(sessionQueryResult(null));
    gigCandidateFindOneAndUpdate.mockReturnValue(updateQueryResult(approved));
    gigCreate.mockResolvedValue([
      {
        toObject: vi.fn().mockReturnValue({
          _id: new Types.ObjectId(gigId),
          publicId: 'radiohead-2026-06-12',
          title: 'Radiohead',
          date: Date.UTC(2026, 5, 12),
          city: 'Barcelona',
          country: 'ES',
          venue: 'Palau Sant Jordi',
          ticketsUrl: 'https://tickets.example/radiohead',
          source: {
            type: 'user',
            userId: new Types.ObjectId('507f1f77bcf86cd799439088'),
            origin: { type: 'messenger' },
          },
          version: 0,
          isVisible: true,
        }),
      },
    ]);

    const result = await repository.withTransaction(async (transaction) => {
      const loaded = await transaction.findGigCandidateById(gigCandidateId);
      const isTaken = await transaction.isGigPublicIdTaken(
        'radiohead-2026-06-12',
      );
      const updated = await transaction.approveGigCandidate({
        gigCandidateId,
        expectedVersion: 0,
        approvedByUserId,
        gigId,
        approvedAt: new Date('2026-09-01T12:00:00.000Z'),
        gigDraft: {
          title: 'Radiohead',
          date: Date.UTC(2026, 5, 12),
          city: 'Barcelona',
          country: 'ES',
          venue: 'Palau Sant Jordi',
          ticketsUrl: 'https://tickets.example/radiohead',
        },
        moderationPost,
      });
      const gig = await transaction.createGig({
        gigId,
        publicId: 'radiohead-2026-06-12',
        title: 'Radiohead',
        date: Date.UTC(2026, 5, 12),
        city: 'Barcelona',
        country: 'ES',
        venue: 'Palau Sant Jordi',
        ticketsUrl: 'https://tickets.example/radiohead',
        source: {
          type: 'user',
          userId: '507f1f77bcf86cd799439088',
          origin: { type: 'messenger' },
        },
        moderationPost,
      });
      return { loaded, isTaken, updated, gig };
    });

    expect(result.loaded?.status).toBe(GigCandidateStatus.Reviewing);
    expect(result.isTaken).toBe(false);
    expect(result.updated?.gigId).toBe(gigId);
    expect(result.gig).toMatchObject({
      id: gigId,
      version: 0,
      isVisible: true,
    });
    expect(gigCandidateFindOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: expect.any(Types.ObjectId),
        status: GigCandidateStatus.Reviewing,
        version: 0,
        gigId: { $exists: false },
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: GigCandidateStatus.Approved,
          gigId: expect.any(Types.ObjectId),
          approvedByUserId: expect.any(Types.ObjectId),
        }),
        $pull: {
          posts: {
            to: Messenger.Telegram,
            type: PostType.Moderation,
            chatId: moderationPost.chatId,
            id: moderationPost.id,
          },
        },
        $inc: { version: 1 },
      }),
      expect.objectContaining({ session }),
    );
    const createdGigDocument = gigCreate.mock.calls[0]?.[0]?.[0];
    expect(createdGigDocument).not.toHaveProperty('status');
    expect(createdGigDocument).not.toHaveProperty('suggestedBy');
    expect(createdGigDocument).not.toHaveProperty('gigCandidateId');
    expect(createdGigDocument).toMatchObject({
      version: 0,
      isVisible: true,
      source: {
        type: 'user',
        userId: expect.any(Types.ObjectId),
        origin: { type: 'messenger' },
      },
      posts: [moderationPost],
    });
    expect(gigCreate.mock.calls[0]?.[1]).toEqual({ session });
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it('should map a provider source with an arbitrary non-empty name', async () => {
    const gigId = '507f1f77bcf86cd799439011';
    const fetchedAt = new Date('2026-09-01T12:00:00.000Z');
    gigFindById.mockReturnValue(
      queryResult({
        _id: new Types.ObjectId(gigId),
        publicId: 'provider-gig-2026-09-20',
        title: 'Provider Gig',
        date: Date.UTC(2026, 8, 20),
        city: 'Barcelona',
        country: 'ES',
        venue: 'Venue',
        ticketsUrl: 'https://tickets.example/provider-gig',
        version: 0,
        isVisible: true,
        source: {
          type: 'provider',
          provider: {
            name: 'exampleProvider',
            externalEventId: 'event-42',
            sourceUrl: 'https://provider.example/events/event-42',
            fetchedAt,
          },
        },
      }),
    );

    const result = await repository.withTransaction((transaction) =>
      transaction.findGigById(gigId),
    );

    expect(result?.source).toEqual({
      type: 'provider',
      provider: {
        name: 'exampleProvider',
        externalEventId: 'event-42',
        sourceUrl: 'https://provider.example/events/event-42',
        fetchedAt,
      },
    });
  });

  it('should reject an empty provider name from persistence', async () => {
    const gigId = '507f1f77bcf86cd799439011';
    gigFindById.mockReturnValue(
      queryResult({
        _id: new Types.ObjectId(gigId),
        publicId: 'provider-gig-2026-09-20',
        title: 'Provider Gig',
        date: Date.UTC(2026, 8, 20),
        city: 'Barcelona',
        country: 'ES',
        venue: 'Venue',
        ticketsUrl: 'https://tickets.example/provider-gig',
        version: 0,
        isVisible: true,
        source: {
          type: 'provider',
          provider: {
            name: '',
            externalEventId: 'event-42',
            sourceUrl: 'https://provider.example/events/event-42',
            fetchedAt: new Date('2026-09-01T12:00:00.000Z'),
          },
        },
      }),
    );

    await expect(
      repository.withTransaction((transaction) =>
        transaction.findGigById(gigId),
      ),
    ).rejects.toThrow('Gig provider source is invalid.');
  });

  it('should keep the post transfer and Gig insert in one rollback boundary', async () => {
    const moderationPost = {
      to: Messenger.Telegram,
      type: PostType.Moderation,
      date: 1_700_000_001_000,
      id: 50,
      chatId: -200,
    } as const;
    gigCandidateFindOneAndUpdate.mockReturnValue(
      updateQueryResult(
        buildGigCandidateDocument({
          status: GigCandidateStatus.Approved,
          version: 1,
          posts: [],
          gigDraft: {
            title: 'Radiohead',
            date: Date.UTC(2026, 5, 12),
            city: 'Barcelona',
            country: 'ES',
            venue: 'Palau Sant Jordi',
            ticketsUrl: 'https://tickets.example/radiohead',
          },
          gigId: new Types.ObjectId('507f1f77bcf86cd799439011'),
          approvedAt: new Date('2026-09-01T12:00:00.000Z'),
          approvedByUserId: new Types.ObjectId('507f1f77bcf86cd799439077'),
        }),
      ),
    );
    gigCreate.mockRejectedValue(new Error('Gig insert failed'));

    await expect(
      repository.withTransaction(async (transaction) => {
        await transaction.approveGigCandidate({
          gigCandidateId: '507f1f77bcf86cd799439099',
          expectedVersion: 0,
          approvedByUserId: '507f1f77bcf86cd799439077',
          gigId: '507f1f77bcf86cd799439011',
          approvedAt: new Date('2026-09-01T12:00:00.000Z'),
          gigDraft: {
            title: 'Radiohead',
            date: Date.UTC(2026, 5, 12),
            city: 'Barcelona',
            country: 'ES',
            venue: 'Palau Sant Jordi',
            ticketsUrl: 'https://tickets.example/radiohead',
          },
          moderationPost,
        });
        return transaction.createGig({
          gigId: '507f1f77bcf86cd799439011',
          publicId: 'radiohead-2026-06-12',
          title: 'Radiohead',
          date: Date.UTC(2026, 5, 12),
          city: 'Barcelona',
          country: 'ES',
          venue: 'Palau Sant Jordi',
          ticketsUrl: 'https://tickets.example/radiohead',
          source: {
            type: 'user',
            userId: '507f1f77bcf86cd799439088',
            origin: { type: 'admin' },
          },
          moderationPost,
        });
      }),
    ).rejects.toThrow('Gig insert failed');
    expect(gigCandidateFindOneAndUpdate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        $pull: {
          posts: {
            to: Messenger.Telegram,
            type: PostType.Moderation,
            chatId: moderationPost.chatId,
            id: moderationPost.id,
          },
        },
      }),
      expect.objectContaining({ session }),
    );
    expect(gigCreate.mock.calls[0]?.[1]).toEqual({ session });
    expect(session.withTransaction).toHaveBeenCalledOnce();
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it('should return null for a losing conditional approval without inserting a Gig', async () => {
    gigCandidateFindOneAndUpdate.mockReturnValue(updateQueryResult(null));

    const result = await repository.withTransaction((transaction) =>
      transaction.approveGigCandidate({
        gigCandidateId: '507f1f77bcf86cd799439099',
        expectedVersion: 0,
        approvedByUserId: '507f1f77bcf86cd799439077',
        gigId: '507f1f77bcf86cd799439011',
        approvedAt: new Date('2026-09-01T12:00:00.000Z'),
        gigDraft: {
          title: 'Radiohead',
          date: Date.UTC(2026, 5, 12),
          city: 'Barcelona',
          country: 'ES',
          venue: 'Palau Sant Jordi',
          ticketsUrl: 'https://tickets.example/radiohead',
        },
      }),
    );

    expect(result).toBeNull();
    expect(gigCreate).not.toHaveBeenCalled();
  });
});

function buildGigCandidateDocument(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    _id: new Types.ObjectId('507f1f77bcf86cd799439099'),
    source: {
      type: 'user',
      userId: new Types.ObjectId('507f1f77bcf86cd799439088'),
      origin: { type: 'admin' },
    },
    gigDraft: {
      title: 'Radiohead',
      date: Date.UTC(2026, 5, 12),
      city: 'Barcelona',
      country: 'ES',
    },
    version: 0,
    status: GigCandidateStatus.Reviewing,
    posts: [],
    createdAt: new Date('2026-08-24T10:00:00.000Z'),
    updatedAt: new Date('2026-08-24T10:00:00.000Z'),
    ...overrides,
  };
}

function queryResult(value: unknown) {
  const exec = vi.fn().mockResolvedValue(value);
  const lean = vi.fn().mockReturnValue({ exec });
  const session = vi.fn().mockReturnValue({ lean });
  return { session };
}

function sessionQueryResult(value: unknown) {
  const exec = vi.fn().mockResolvedValue(value);
  const session = vi.fn().mockReturnValue({ exec });
  return { session };
}

function updateQueryResult(value: unknown) {
  const exec = vi.fn().mockResolvedValue(value);
  const lean = vi.fn().mockReturnValue({ exec });
  return { lean };
}

import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Messenger } from '../../../shared/types/messenger.enum';
import { GigCandidatePostType } from '../types/gig-candidate-post-type.enum';
import { GigCandidateStatus } from '../types/gig-candidate-status.enum';
import type { GigCandidateSourceUser } from '../types/gig-candidate.types';
import { GigCandidate } from '../gig-candidate.schema';
import {
  AdminGigCandidateListSortBy,
  AdminGigCandidateListSortOrder,
} from '../gig-candidate-list-sort';
import { MongoGigCandidateRepository } from './mongo-gig-candidate.repository';

describe('MongoGigCandidateRepository', () => {
  let repository: MongoGigCandidateRepository;

  const createMock = vi.fn();
  const findByIdMock = vi.fn();
  const findMock = vi.fn();
  const findOneAndUpdateMock = vi.fn();

  beforeEach(async () => {
    createMock.mockReset();
    findByIdMock.mockReset();
    findMock.mockReset();
    findOneAndUpdateMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MongoGigCandidateRepository,
        {
          provide: getModelToken(GigCandidate.name),
          useValue: {
            create: createMock,
            findById: findByIdMock,
            find: findMock,
            findOneAndUpdate: findOneAndUpdateMock,
          },
        },
      ],
    }).compile();

    repository = module.get(MongoGigCandidateRepository);
  });

  describe('createId', () => {
    it('should return a valid ObjectId string', () => {
      expect(Types.ObjectId.isValid(repository.createId())).toBe(true);
    });
  });

  describe('createGigCandidate', () => {
    it('should persist the target shape with immutable source and version zero', async () => {
      const gigCandidateId = '507f1f77bcf86cd799439099';
      const source = {
        type: 'user',
        userId: '507f1f77bcf86cd799439088',
        origin: { type: 'form' },
        originalText: 'Original submission',
      } satisfies GigCandidateSourceUser;
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const updatedAt = new Date('2026-01-02T00:00:00.000Z');
      createMock.mockResolvedValue({
        toObject: vi.fn().mockReturnValue({
          _id: gigCandidateId,
          source,
          gigDraft: {},
          version: 0,
          status: GigCandidateStatus.Pending,
          posts: [],
          createdAt,
          updatedAt,
        }),
      });

      const result = await repository.createGigCandidate({
        gigCandidateId,
        source,
        gigDraft: {},
        status: GigCandidateStatus.Pending,
      });

      expect(result).toEqual(
        expect.objectContaining({
          id: gigCandidateId,
          source,
          gigDraft: {},
          version: 0,
        }),
      );
      expect(createMock).toHaveBeenCalledWith({
        _id: expect.any(Types.ObjectId),
        source: {
          ...source,
          userId: expect.any(Types.ObjectId),
        },
        gigDraft: {},
        version: 0,
        status: GigCandidateStatus.Pending,
        posts: [],
      });
      expect(findByIdMock).not.toHaveBeenCalled();
    });
  });

  describe('updateGigCandidateDraft', () => {
    it('should update only Reviewing gigDraft at expected version and increment version', async () => {
      const gigCandidateId = '507f1f77bcf86cd799439099';
      const source = {
        type: 'user',
        userId: '507f1f77bcf86cd799439088',
        origin: { type: 'admin' },
      } satisfies GigCandidateSourceUser;
      findOneAndUpdateMock.mockReturnValue(
        updateQueryResult({
          _id: gigCandidateId,
          source,
          gigDraft: { title: 'Updated title' },
          version: 2,
          status: GigCandidateStatus.Reviewing,
          posts: [],
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        }),
      );

      const result = await repository.updateGigCandidateDraft({
        gigCandidateId,
        expectedVersion: 1,
        gigDraft: { title: 'Updated title' },
      });

      expect(result?.version).toBe(2);
      expect(findOneAndUpdateMock).toHaveBeenCalledWith(
        {
          _id: expect.any(Types.ObjectId),
          status: GigCandidateStatus.Reviewing,
          version: 1,
        },
        {
          $set: { gigDraft: { title: 'Updated title' } },
          $inc: { version: 1 },
        },
        { returnDocument: 'after', runValidators: true },
      );
    });

    it('should return null without writing when expected version is invalid', async () => {
      const result = await repository.updateGigCandidateDraft({
        gigCandidateId: '507f1f77bcf86cd799439099',
        expectedVersion: -1,
        gigDraft: {},
      });

      expect(result).toBeNull();
      expect(findOneAndUpdateMock).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return null when gigCandidateId is invalid', async () => {
      await expect(repository.findById('not-an-id')).resolves.toBeNull();
      expect(findByIdMock).not.toHaveBeenCalled();
    });

    it('should map the target document when found', async () => {
      const gigCandidateId = '507f1f77bcf86cd799439099';
      findByIdMock.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue({
            _id: gigCandidateId,
            source: {
              type: 'user',
              userId: '507f1f77bcf86cd799439088',
              origin: { type: 'form' },
            },
            gigDraft: { title: 'Band' },
            version: 0,
            status: GigCandidateStatus.Pending,
            posts: [],
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-02T00:00:00.000Z'),
          }),
        }),
      });

      await expect(repository.findById(gigCandidateId)).resolves.toEqual(
        expect.objectContaining({
          id: gigCandidateId,
          status: GigCandidateStatus.Pending,
          gigDraft: { title: 'Band' },
        }),
      );
    });
  });

  describe('findMany', () => {
    it('should filter by status and sort by gigDraft event date', async () => {
      const sortMock = vi.fn();
      const limitMock = vi.fn();
      const leanMock = vi.fn();
      findMock.mockReturnValue({ sort: sortMock });
      sortMock.mockReturnValue({ limit: limitMock });
      limitMock.mockReturnValue({ lean: leanMock });
      leanMock.mockReturnValue({ exec: vi.fn().mockResolvedValue([]) });

      await repository.findMany({
        status: GigCandidateStatus.Pending,
        limit: 20,
        sortBy: AdminGigCandidateListSortBy.EventDate,
        sortOrder: AdminGigCandidateListSortOrder.Asc,
      });

      expect(findMock).toHaveBeenCalledWith(
        { status: GigCandidateStatus.Pending },
        expect.objectContaining({ gigDraft: 1, status: 1 }),
      );
      expect(sortMock).toHaveBeenCalledWith({
        'gigDraft.date': 1,
        _id: 1,
      });
      expect(limitMock).toHaveBeenCalledWith(20);
    });
  });

  describe('appendGigCandidatePost', () => {
    it('should conditionally append the post and increment version', async () => {
      const gigCandidateId = '507f1f77bcf86cd799439099';
      const post = {
        to: Messenger.Telegram,
        type: GigCandidatePostType.Suggestion,
        date: 1,
        id: 2,
        chatId: 3,
      };
      findOneAndUpdateMock.mockReturnValue(
        updateQueryResult({
          _id: gigCandidateId,
          source: {
            type: 'user',
            userId: '507f1f77bcf86cd799439088',
            origin: { type: 'form' },
          },
          gigDraft: {},
          version: 1,
          status: GigCandidateStatus.Pending,
          posts: [post],
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        }),
      );

      const result = await repository.appendGigCandidatePost({
        gigCandidateId,
        expectedVersion: 0,
        post,
      });

      expect(result?.version).toBe(1);
      expect(findOneAndUpdateMock).toHaveBeenCalledWith(
        { _id: expect.any(Types.ObjectId), version: 0 },
        { $push: { posts: post }, $inc: { version: 1 } },
        { returnDocument: 'after', runValidators: true },
      );
    });
  });
});

function updateQueryResult(value: unknown) {
  return {
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(value),
      }),
    }),
  };
}

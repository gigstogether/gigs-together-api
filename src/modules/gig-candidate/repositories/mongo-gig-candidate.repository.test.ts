import { GigCandidateSource } from '../types/gig-candidate-source.enum';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

import { GigCandidateStatus } from '../types/gig-candidate-status.enum';
import { GigCandidate } from '../gig-candidate.schema';
import { MongoGigCandidateRepository } from './mongo-gig-candidate.repository';
import {
  AdminGigCandidateListSortBy,
  AdminGigCandidateListSortOrder,
} from '../gig-candidate-list-sort';

describe('MongoGigCandidateRepository', () => {
  let repository: MongoGigCandidateRepository;

  const createMock = vi.fn();
  const findByIdMock = vi.fn();
  const findMock = vi.fn();
  const findByIdAndUpdateMock = vi.fn();

  beforeEach(async () => {
    createMock.mockReset();
    findByIdMock.mockReset();
    findMock.mockReset();
    findByIdAndUpdateMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MongoGigCandidateRepository,
        {
          provide: getModelToken(GigCandidate.name),
          useValue: {
            create: createMock,
            findById: findByIdMock,
            find: findMock,
            findByIdAndUpdate: findByIdAndUpdateMock,
          },
        },
      ],
    }).compile();

    repository = module.get(MongoGigCandidateRepository);
  });

  describe('findMany', () => {
    it('should filter by status and sort by event date', async () => {
      const sortMock = vi.fn();
      const limitMock = vi.fn();
      const leanMock = vi.fn();
      const execMock = vi.fn().mockResolvedValue([
        {
          _id: '507f1f77bcf86cd799439099',
          source: GigCandidateSource.User,
          title: 'Band',
          date: 1,
          city: 'Barcelona',
          country: 'ES',
          status: GigCandidateStatus.Pending,
          posts: [],
          suggestedBy: { userId: 1 },
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      ]);
      findMock.mockReturnValue({ sort: sortMock });
      sortMock.mockReturnValue({ limit: limitMock });
      limitMock.mockReturnValue({ lean: leanMock });
      leanMock.mockReturnValue({ exec: execMock });

      const result = await repository.findMany({
        status: GigCandidateStatus.Pending,
        limit: 20,
        sortBy: AdminGigCandidateListSortBy.EventDate,
        sortOrder: AdminGigCandidateListSortOrder.Asc,
      });

      expect(result).toHaveLength(1);
      expect(findMock).toHaveBeenCalledWith(
        { status: GigCandidateStatus.Pending },
        expect.objectContaining({ title: 1, status: 1 }),
      );
      expect(sortMock).toHaveBeenCalledWith({ date: 1, _id: 1 });
      expect(limitMock).toHaveBeenCalledWith(20);
    });

    it('should cap limit and default to newest creation date', async () => {
      const sortMock = vi.fn();
      const limitMock = vi.fn();
      const leanMock = vi.fn();
      findMock.mockReturnValue({ sort: sortMock });
      sortMock.mockReturnValue({ limit: limitMock });
      limitMock.mockReturnValue({ lean: leanMock });
      leanMock.mockReturnValue({ exec: vi.fn().mockResolvedValue([]) });

      await repository.findMany({
        status: GigCandidateStatus.Accepted,
        limit: 500,
      });

      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
      expect(limitMock).toHaveBeenCalledWith(100);
    });
  });

  describe('createId', () => {
    it('should return a valid ObjectId string', () => {
      const id = repository.createId();

      expect(Types.ObjectId.isValid(id)).toBe(true);
    });
  });

  describe('findById', () => {
    it('should return null when id is not a valid ObjectId', async () => {
      await expect(repository.findById('not-an-id')).resolves.toBeNull();
      expect(findByIdMock).not.toHaveBeenCalled();
    });

    it('should map a lean document to a GigCandidateRecord when found', async () => {
      const id = '507f1f77bcf86cd799439099';
      findByIdMock.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue({
            _id: id,
            source: GigCandidateSource.User,
            title: 'Band',
            date: 1,
            city: 'Barcelona',
            country: 'ES',
            status: GigCandidateStatus.Pending,
            posts: [],
            suggestedBy: { userId: 1 },
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-02T00:00:00.000Z'),
          }),
        }),
      });

      await expect(repository.findById(id)).resolves.toEqual(
        expect.objectContaining({
          id,
          title: 'Band',
          status: GigCandidateStatus.Pending,
          posts: [],
        }),
      );
    });
  });

  describe('markAccepted', () => {
    it('should return null when gigId is not a valid ObjectId', async () => {
      await expect(
        repository.markAccepted({
          id: '507f1f77bcf86cd799439099',
          gigId: 'bad',
        }),
      ).resolves.toBeNull();
      expect(findByIdAndUpdateMock).not.toHaveBeenCalled();
    });

    it('should persist Accepted status and gigId when ids are valid', async () => {
      const id = '507f1f77bcf86cd799439099';
      const gigId = '507f1f77bcf86cd799439011';
      findByIdAndUpdateMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue({
              _id: id,
              source: GigCandidateSource.User,
              title: 'Band',
              date: 1,
              city: 'Barcelona',
              country: 'ES',
              status: GigCandidateStatus.Accepted,
              posts: [],
              suggestedBy: { userId: 1 },
              gigId,
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              updatedAt: new Date('2026-01-02T00:00:00.000Z'),
            }),
          }),
        }),
      });

      const result = await repository.markAccepted({ id, gigId });

      expect(result?.status).toBe(GigCandidateStatus.Accepted);
      expect(result?.gigId).toBe(gigId);
      expect(findByIdAndUpdateMock).toHaveBeenCalledWith(
        id,
        {
          $set: {
            status: GigCandidateStatus.Accepted,
            gigId: expect.any(Types.ObjectId),
          },
        },
        { returnDocument: 'after' },
      );
    });
  });

  describe('markRejected', () => {
    it('should persist Rejected status when id is valid', async () => {
      const id = '507f1f77bcf86cd799439099';
      findByIdAndUpdateMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue({
              _id: id,
              source: GigCandidateSource.User,
              title: 'Band',
              date: 1,
              city: 'Barcelona',
              country: 'ES',
              status: GigCandidateStatus.Rejected,
              posts: [],
              suggestedBy: { userId: 1 },
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              updatedAt: new Date('2026-01-02T00:00:00.000Z'),
            }),
          }),
        }),
      });

      const result = await repository.markRejected({ id });

      expect(result?.status).toBe(GigCandidateStatus.Rejected);
    });
  });
});

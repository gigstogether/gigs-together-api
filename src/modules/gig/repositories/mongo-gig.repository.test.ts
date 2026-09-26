import { getModelToken } from '@nestjs/mongoose';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';

import { Messenger } from '../../../shared/types/messenger.enum';
import { PostType } from '../../../shared/types/post-type.enum';
import { Gig } from '../gig.schema';
import {
  AdminGigListSortBy,
  AdminGigListSortOrder,
} from '../types/admin-gig-list-sort.types';
import type { GigLeanDocument } from './gig.repository.mapper';
import { MongoGigRepository } from './mongo-gig.repository';

function buildDocument(
  overrides: Partial<GigLeanDocument> = {},
): GigLeanDocument {
  return {
    _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
    publicId: 'radiohead-barcelona-2026-06-12',
    title: 'Radiohead',
    date: Date.UTC(2026, 5, 12),
    city: 'barcelona',
    country: 'ES',
    venue: 'Palau Sant Jordi',
    ticketsUrl: 'https://tickets.example/radiohead',
    isVisible: true,
    version: 3,
    source: {
      type: 'user',
      userId: new Types.ObjectId('507f1f77bcf86cd799439012'),
      origin: { type: 'admin' },
    },
    posts: [],
    createdAt: new Date('2026-05-30T14:22:00.000Z'),
    updatedAt: new Date('2026-05-30T14:22:00.000Z'),
    ...overrides,
  };
}

function createLeanQuery<T>(result: T) {
  return {
    lean: vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(result),
    }),
  };
}

describe('MongoGigRepository', () => {
  let repository: MongoGigRepository;

  const find = vi.fn();
  const findOne = vi.fn();
  const findById = vi.fn();
  const findOneAndUpdate = vi.fn();
  const aggregate = vi.fn();
  const exists = vi.fn();
  const countDocuments = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MongoGigRepository,
        {
          provide: getModelToken(Gig.name),
          useValue: {
            find,
            findOne,
            findById,
            findOneAndUpdate,
            aggregate,
            exists,
            countDocuments,
          },
        },
      ],
    }).compile();

    repository = module.get(MongoGigRepository);
  });

  describe('publicId lookups', () => {
    it('should report whether a Gig exists by publicId', async () => {
      const exec = vi.fn().mockResolvedValue({ _id: 'gig-id' });
      exists.mockReturnValue({ exec });

      await expect(
        repository.existsByPublicId('radiohead-barcelona-2026-06-12'),
      ).resolves.toBe(true);
      expect(exists).toHaveBeenCalledWith({
        publicId: 'radiohead-barcelona-2026-06-12',
      });
    });

    it('should exclude the current Gig from a uniqueness check', async () => {
      const exec = vi.fn().mockResolvedValue(null);
      exists.mockReturnValue({ exec });

      await expect(
        repository.isPublicIdTaken({
          publicId: 'radiohead-barcelona-2026-06-12',
          excludeGigId: '507f1f77bcf86cd799439011',
        }),
      ).resolves.toBe(false);
      expect(exists).toHaveBeenCalledWith({
        publicId: 'radiohead-barcelona-2026-06-12',
        _id: {
          $ne: new Types.ObjectId('507f1f77bcf86cd799439011'),
        },
      });
    });
  });

  describe('counts', () => {
    it('should count all and visible Gigs independently', async () => {
      countDocuments
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(10) })
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(7) });

      await expect(repository.countAll()).resolves.toBe(10);
      await expect(repository.countVisible()).resolves.toBe(7);
      expect(countDocuments).toHaveBeenNthCalledWith(1, {});
      expect(countDocuments).toHaveBeenNthCalledWith(2, { isVisible: true });
    });
  });

  describe('findMany', () => {
    it('should sort, limit, and map admin Gigs', async () => {
      const document = buildDocument();
      const lean = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([document]),
      });
      const limit = vi.fn().mockReturnValue({ lean });
      const sort = vi.fn().mockReturnValue({ limit });
      find.mockReturnValue({ sort, limit });

      await expect(
        repository.findMany({
          limit: 20,
          sortBy: AdminGigListSortBy.EventDate,
          sortOrder: AdminGigListSortOrder.Desc,
        }),
      ).resolves.toMatchObject([{ id: String(document._id) }]);
      expect(sort).toHaveBeenCalledWith({ date: -1, _id: -1 });
      expect(limit).toHaveBeenCalledWith(20);
    });
  });

  describe('findById', () => {
    it('should map a Gig found by its domain ID', async () => {
      const document = buildDocument();
      findById.mockReturnValue(createLeanQuery(document));

      await expect(
        repository.findById('507f1f77bcf86cd799439011'),
      ).resolves.toMatchObject({ id: '507f1f77bcf86cd799439011' });
      expect(findById).toHaveBeenCalledWith(
        new Types.ObjectId('507f1f77bcf86cd799439011'),
      );
    });
  });

  describe('updateByPublicId', () => {
    it('should atomically update the expected version and remove an absent end date', async () => {
      const document = buildDocument({ version: 4 });
      findOneAndUpdate.mockReturnValue(createLeanQuery(document));

      await expect(
        repository.updateByPublicId({
          publicId: document.publicId,
          expectedVersion: 3,
          title: document.title,
          date: document.date,
          city: document.city,
          country: document.country,
          venue: document.venue,
          ticketsUrl: document.ticketsUrl,
        }),
      ).resolves.toMatchObject({ id: String(document._id), version: 4 });

      expect(findOneAndUpdate).toHaveBeenCalledWith(
        { publicId: document.publicId, version: 3 },
        {
          $set: {
            title: document.title,
            date: document.date,
            city: document.city,
            country: document.country,
            venue: document.venue,
            ticketsUrl: document.ticketsUrl,
          },
          $inc: { version: 1 },
          $unset: { endDate: 1 },
        },
        { returnDocument: 'after' },
      );
    });
  });

  describe('updateVisibility', () => {
    it('should conditionally update visibility and increment version', async () => {
      const document = buildDocument({ isVisible: false, version: 4 });
      findOneAndUpdate.mockReturnValue(createLeanQuery(document));

      await repository.updateVisibility({
        publicId: document.publicId,
        expectedVersion: 3,
        isVisible: false,
      });

      expect(findOneAndUpdate).toHaveBeenCalledWith(
        { publicId: document.publicId, version: 3 },
        { $set: { isVisible: false }, $inc: { version: 1 } },
        { returnDocument: 'after' },
      );
    });
  });

  describe('appendMainPost', () => {
    it('should reject an existing Main post in the atomic update filter', async () => {
      const document = buildDocument({ version: 4 });
      findOneAndUpdate.mockReturnValue(createLeanQuery(document));
      const post = {
        to: Messenger.Telegram,
        type: PostType.Main,
        date: Date.UTC(2026, 5, 1),
        id: 42,
        chatId: -100123,
      };

      await repository.appendMainPost({
        gigId: String(document._id),
        expectedVersion: 3,
        post,
      });

      expect(findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: new Types.ObjectId(String(document._id)),
          version: 3,
          posts: {
            $not: {
              $elemMatch: {
                to: Messenger.Telegram,
                type: PostType.Main,
              },
            },
          },
        },
        { $push: { posts: post }, $inc: { version: 1 } },
        { returnDocument: 'after' },
      );
    });
  });

  describe('updateTelegramPostFileId', () => {
    it('should match the exact post snapshot without incrementing Gig version', async () => {
      const document = buildDocument();
      findOneAndUpdate.mockReturnValue(createLeanQuery(document));

      await repository.updateTelegramPostFileId({
        gigId: String(document._id),
        expectedVersion: 3,
        type: PostType.Moderation,
        messageId: 42,
        chatId: -100123,
        fileId: 'new-file-id',
      });

      expect(findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: new Types.ObjectId(String(document._id)),
          version: 3,
          posts: {
            $elemMatch: {
              to: Messenger.Telegram,
              type: PostType.Moderation,
              id: 42,
              chatId: -100123,
            },
          },
        },
        { $set: { 'posts.$.fileId': 'new-file-id' } },
        { returnDocument: 'after' },
      );
    });
  });

  describe('findVisiblePage', () => {
    it('should query visible ongoing Gigs and return an ascending previous page', async () => {
      const earlier = buildDocument({
        _id: new Types.ObjectId('507f1f77bcf86cd799439010'),
        date: 10,
      });
      const later = buildDocument({ date: 20 });
      const limit = vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([later, earlier]),
        }),
      });
      const sort = vi.fn().mockReturnValue({ limit });
      const collation = vi.fn().mockReturnValue({ sort });
      find.mockReturnValue({ collation });

      const result = await repository.findVisiblePage({
        from: 5,
        to: 30,
        city: 'barcelona',
        country: 'ES',
        limit: 1,
        direction: 'prev',
        cursor: { date: 25, gigId: '507f1f77bcf86cd799439015' },
      });

      expect(result).toMatchObject({
        gigs: [{ date: 20 }],
        hasMore: true,
      });
      expect(find).toHaveBeenCalledWith({
        $and: [
          {
            isVisible: true,
            city: 'barcelona',
            country: 'ES',
            $and: [
              { $or: [{ date: { $gte: 5 } }, { endDate: { $gte: 5 } }] },
              { date: { $lte: 30 } },
            ],
          },
          {
            $or: [
              { date: { $lt: 25 } },
              {
                date: 25,
                _id: {
                  $lt: new Types.ObjectId('507f1f77bcf86cd799439015'),
                },
              },
            ],
          },
        ],
      });
      expect(sort).toHaveBeenCalledWith({ date: -1, _id: -1 });
      expect(limit).toHaveBeenCalledWith(2);
    });
  });

  describe('findVisibleInRange', () => {
    it('should apply the inclusive range and location filters', async () => {
      const sort = vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([]),
        }),
      });
      const collation = vi.fn().mockReturnValue({ sort });
      find.mockReturnValue({ collation });

      await repository.findVisibleInRange({
        from: 10,
        to: 20,
        city: 'barcelona',
        country: 'ES',
      });

      expect(find).toHaveBeenCalledWith({
        isVisible: true,
        city: 'barcelona',
        country: 'ES',
        date: { $gte: 10, $lte: 20 },
      });
      expect(sort).toHaveBeenCalledWith({ date: 1, _id: 1 });
    });
  });

  describe('findVisibleDateByPublicId', () => {
    it('should return null when no visible Gig matches', async () => {
      const exec = vi.fn().mockResolvedValue(null);
      const lean = vi.fn().mockReturnValue({ exec });
      const collation = vi.fn().mockReturnValue({ lean });
      findOne.mockReturnValue({ collation });

      await expect(
        repository.findVisibleDateByPublicId('missing-gig'),
      ).resolves.toBeNull();
      expect(findOne).toHaveBeenCalledWith(
        { publicId: 'missing-gig', isVisible: true },
        { date: 1 },
      );
    });
  });

  describe('findVisibleAround', () => {
    it('should return bounded pages on both sides of the anchor', async () => {
      const before = buildDocument({ date: 10 });
      const after = buildDocument({
        _id: new Types.ObjectId('507f1f77bcf86cd799439013'),
        date: 20,
      });
      const createFindChain = (documents: GigLeanDocument[]) => ({
        collation: vi.fn().mockReturnValue({
          sort: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              lean: vi.fn().mockReturnValue({
                exec: vi.fn().mockResolvedValue(documents),
              }),
            }),
          }),
        }),
      });
      find
        .mockReturnValueOnce(createFindChain([before]))
        .mockReturnValueOnce(createFindChain([after]));

      await expect(
        repository.findVisibleAround({
          anchor: 15,
          todayStart: 5,
          beforeLimit: 1,
          afterLimit: 1,
          city: 'barcelona',
          country: 'ES',
        }),
      ).resolves.toMatchObject({
        before: [{ date: 10 }],
        after: [{ date: 20 }],
        hasPrevious: false,
        hasNext: false,
      });
      expect(find).toHaveBeenNthCalledWith(1, {
        isVisible: true,
        city: 'barcelona',
        country: 'ES',
        date: { $gte: 5, $lt: 15 },
      });
      expect(find).toHaveBeenNthCalledWith(2, {
        isVisible: true,
        city: 'barcelona',
        country: 'ES',
        date: { $gte: 15 },
      });
    });
  });

  describe('findVisibleDates', () => {
    it('should aggregate unique visible dates without loading Gig documents', async () => {
      const allowDiskUse = vi
        .fn()
        .mockResolvedValue([{ _id: 10 }, { _id: 20 }]);
      aggregate.mockReturnValue({ allowDiskUse });

      await expect(
        repository.findVisibleDates({
          from: 1,
          to: 30,
          city: 'barcelona',
          country: 'ES',
        }),
      ).resolves.toEqual([10, 20]);

      expect(aggregate).toHaveBeenCalledWith([
        {
          $match: {
            isVisible: true,
            city: 'barcelona',
            country: 'ES',
            date: { $gte: 1, $lte: 30 },
          },
        },
        { $group: { _id: '$date' } },
        { $sort: { _id: 1 } },
      ]);
      expect(allowDiskUse).toHaveBeenCalledWith(true);
    });
  });
});

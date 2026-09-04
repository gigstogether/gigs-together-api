import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { GigService } from './gig.service';
import { Gig } from './gig.schema';
import { AiService } from '../ai/ai.service';
import { CalendarService } from '../calendar/calendar.service';
import { GigPosterService } from './gig.poster.service';
import { TelegramService } from '../telegram/telegram.service';
import { BucketService } from '../bucket/bucket.service';
import { Types } from 'mongoose';
import {
  AdminGigListSortBy,
  AdminGigListSortOrder,
} from './types/admin-gig-list-sort.types';

describe('GigService', () => {
  let service: GigService;

  const execMock = vi.fn();
  const leanMock = vi.fn().mockReturnValue({ exec: execMock });
  const limitMock = vi.fn().mockReturnValue({ lean: leanMock });
  const sortForLimitMock = vi.fn().mockReturnValue({ limit: limitMock });
  const sortForCollationMock = vi.fn().mockReturnValue({ exec: execMock });
  const collationMock = vi.fn().mockReturnValue({ sort: sortForCollationMock });
  const aggregateExecMock = vi.fn();
  const aggregateMock = vi.fn().mockReturnValue({ exec: aggregateExecMock });
  const findMock = vi.fn().mockReturnValue({
    sort: sortForLimitMock,
    collation: collationMock,
    limit: limitMock,
  });
  const countDocumentsMock = vi.fn();
  const findByIdExecMock = vi.fn();
  const findByIdLeanMock = vi.fn().mockReturnValue({ exec: findByIdExecMock });
  const findByIdMock = vi.fn().mockReturnValue({ lean: findByIdLeanMock });
  const findOneExecMock = vi.fn();
  const findOneLeanMock = vi.fn().mockReturnValue({ exec: findOneExecMock });
  const findOneMock = vi.fn().mockReturnValue({ lean: findOneLeanMock });
  const findOneAndUpdateMock = vi.fn();
  const findByIdAndUpdateMock = vi.fn();
  const existsMock = vi.fn();
  const uploadPosterMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    execMock.mockResolvedValue([]);
    aggregateExecMock.mockResolvedValue([]);
    countDocumentsMock.mockReturnValue({ exec: vi.fn().mockResolvedValue(0) });
    findByIdExecMock.mockResolvedValue(null);
    findOneExecMock.mockResolvedValue(null);
    findOneAndUpdateMock.mockResolvedValue(null);
    findByIdAndUpdateMock.mockResolvedValue(null);
    existsMock.mockResolvedValue(null);
    uploadPosterMock.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GigService,
        {
          provide: getModelToken(Gig.name),
          useValue: {
            find: findMock,
            findById: findByIdMock,
            findOne: findOneMock,
            findOneAndUpdate: findOneAndUpdateMock,
            findByIdAndUpdate: findByIdAndUpdateMock,
            exists: existsMock,
            aggregate: aggregateMock,
            countDocuments: countDocumentsMock,
          },
        },
        {
          provide: AiService,
          useValue: {
            lookupGigV1: vi.fn(),
          },
        },
        { provide: CalendarService, useValue: {} },
        { provide: GigPosterService, useValue: { upload: uploadPosterMock } },
        { provide: TelegramService, useValue: {} },
        { provide: BucketService, useValue: {} },
      ],
    }).compile();

    service = module.get<GigService>(GigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateUniquePublicId', () => {
    it('should preserve the existing Gig model uniqueness check by default', async () => {
      const publicIdLookupLean = vi.fn().mockResolvedValue(null);
      findOneMock.mockReturnValueOnce({ lean: publicIdLookupLean });

      await expect(
        service.generateUniquePublicId({
          title: 'Radiohead',
          yyyyMmDd: '2026-06-12',
        }),
      ).resolves.toBe('radiohead-2026-06-12');

      expect(findOneMock).toHaveBeenCalledWith(
        { publicId: 'radiohead-2026-06-12' },
        { _id: 1 },
      );
    });

    it('should use the supplied transaction-aware uniqueness check', async () => {
      const isPublicIdTaken = vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await expect(
        service.generateUniquePublicId({
          title: 'Beyoncé & Friends',
          yyyyMmDd: '2026-06-12',
          isPublicIdTaken,
        }),
      ).resolves.toBe('beyonce-friends-2026-06-12-2');

      expect(isPublicIdTaken).toHaveBeenNthCalledWith(
        1,
        'beyonce-friends-2026-06-12',
      );
      expect(isPublicIdTaken).toHaveBeenNthCalledWith(
        2,
        'beyonce-friends-2026-06-12-2',
      );
      expect(findOneMock).not.toHaveBeenCalled();
    });

    it('should keep a generated public ID within the schema limit', async () => {
      await expect(
        service.generateUniquePublicId({
          title: 'A'.repeat(200),
          yyyyMmDd: '2026-06-12',
          isPublicIdTaken: vi.fn().mockResolvedValue(false),
        }),
      ).resolves.toHaveLength(64);
    });
  });

  describe('getVisibleGigDocumentsInInclusiveMsRange', () => {
    it('should query visible gigs with inclusive date bounds when fromMs and toMs are given', async () => {
      const fromMs = new Date(2024, 5, 10, 0, 0, 0, 0).getTime();
      const toMs = new Date(2024, 5, 16, 23, 59, 59, 999).getTime();

      await service.getVisibleGigDocumentsInInclusiveMsRange({
        fromMs,
        toMs,
      });

      expect(findMock).toHaveBeenCalledWith({
        isVisible: true,
        date: { $gte: fromMs, $lte: toMs },
      });
      expect(collationMock).toHaveBeenCalledWith({
        locale: 'en',
        strength: 2,
      });
      expect(sortForCollationMock).toHaveBeenCalledWith({ date: 1, _id: 1 });
    });
  });

  describe('getGigs', () => {
    it('should return all Gigs without sorting when sortBy is omitted', async () => {
      const plainGig = { _id: new Types.ObjectId(), publicId: 'gig-1' };
      execMock.mockResolvedValue([plainGig]);

      await expect(service.getGigs({ limit: 10 })).resolves.toEqual([plainGig]);
      expect(findMock).toHaveBeenCalledWith({});
      expect(limitMock).toHaveBeenCalledWith(10);
      expect(sortForLimitMock).not.toHaveBeenCalled();
    });

    it('should sort Gigs by creation timestamp and ID', async () => {
      const plainGig = { _id: new Types.ObjectId(), publicId: 'gig-2' };
      execMock.mockResolvedValue([plainGig]);

      await expect(
        service.getGigs({
          limit: 15,
          sortBy: AdminGigListSortBy.CreatedAt,
          sortOrder: AdminGigListSortOrder.Desc,
        }),
      ).resolves.toEqual([plainGig]);
      expect(sortForLimitMock).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
      expect(limitMock).toHaveBeenCalledWith(15);
    });

    it('should sort Gigs by event date and ID', async () => {
      const plainGig = { _id: new Types.ObjectId(), publicId: 'gig-3' };
      execMock.mockResolvedValue([plainGig]);

      await expect(
        service.getGigs({
          limit: 20,
          sortBy: AdminGigListSortBy.EventDate,
          sortOrder: AdminGigListSortOrder.Asc,
        }),
      ).resolves.toEqual([plainGig]);
      expect(sortForLimitMock).toHaveBeenCalledWith({ date: 1, _id: 1 });
      expect(limitMock).toHaveBeenCalledWith(20);
    });
  });

  describe('getGigById', () => {
    it('should return plain gig when id is valid', async () => {
      const gigId = new Types.ObjectId('507f1f77bcf86cd799439011');
      const plainGig = { _id: gigId, publicId: 'gig-1' };
      findByIdExecMock.mockResolvedValue(plainGig);

      await expect(service.getGigById(gigId.toString())).resolves.toBe(
        plainGig,
      );

      expect(findByIdMock).toHaveBeenCalledWith(gigId.toString());
      expect(findByIdLeanMock).toHaveBeenCalledTimes(1);
      expect(findByIdExecMock).toHaveBeenCalledTimes(1);
    });

    it('should throw BadRequestException when id is invalid', async () => {
      await expect(
        service.getGigById('not-an-object-id'),
      ).rejects.toMatchObject({
        message: 'Invalid MongoDB ID: not-an-object-id',
      });
    });

    it('should throw NotFoundException when gig is missing', async () => {
      const gigId = new Types.ObjectId('507f1f77bcf86cd799439011');
      findByIdExecMock.mockResolvedValue(null);

      await expect(service.getGigById(gigId.toString())).rejects.toMatchObject({
        message: `Gig with ID ${gigId.toString()} not found`,
      });
    });
  });

  describe('getGigByPublicId', () => {
    it('should return plain gig when publicId is valid', async () => {
      const plainGig = {
        _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
        publicId: 'radiohead-barcelona-2026-06-12',
      };
      findOneExecMock.mockResolvedValue(plainGig);

      await expect(
        service.getGigByPublicId('radiohead-barcelona-2026-06-12'),
      ).resolves.toBe(plainGig);

      expect(findOneMock).toHaveBeenCalledWith({
        publicId: 'radiohead-barcelona-2026-06-12',
      });
      expect(findOneLeanMock).toHaveBeenCalledTimes(1);
      expect(findOneExecMock).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when gig is missing', async () => {
      findOneExecMock.mockResolvedValue(null);

      await expect(
        service.getGigByPublicId('missing-gig'),
      ).rejects.toMatchObject({
        message: 'Gig with publicId "missing-gig" not found',
      });
    });
  });

  describe('updateGigByPublicId', () => {
    const body = {
      gig: {
        title: 'Radiohead',
        date: '2026-06-12',
        city: 'Barcelona',
        country: 'ES',
        venue: 'Palau Sant Jordi',
        ticketsUrl: 'https://tickets.example/radiohead',
      },
    };

    it('should conditionally edit a Gig and increment its version', async () => {
      const updatedGig = { publicId: 'radiohead-2026-06-12', version: 5 };
      findOneAndUpdateMock.mockResolvedValue(updatedGig);

      await expect(
        service.updateGigByPublicId({
          publicId: 'radiohead-2026-06-12',
          expectedVersion: 4,
          gig: body.gig,
          posterFile: undefined,
        }),
      ).resolves.toBe(updatedGig);

      expect(findOneAndUpdateMock).toHaveBeenCalledWith(
        { publicId: 'radiohead-2026-06-12', version: 4 },
        {
          $set: {
            title: 'Radiohead',
            date: new Date('2026-06-12').getTime(),
            city: 'Barcelona',
            country: 'ES',
            venue: 'Palau Sant Jordi',
            ticketsUrl: 'https://tickets.example/radiohead',
          },
          $inc: { version: 1 },
          $unset: { endDate: 1 },
        },
        { returnDocument: 'after' },
      );
    });

    it('should return conflict when an edit uses a stale version', async () => {
      existsMock.mockResolvedValue({ _id: new Types.ObjectId() });

      await expect(
        service.updateGigByPublicId({
          publicId: 'radiohead-2026-06-12',
          expectedVersion: 3,
          gig: body.gig,
          posterFile: undefined,
        }),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Gig with publicId "radiohead-2026-06-12" has a newer version',
      });
    });
  });

  describe('updateGigVisibilityByPublicId', () => {
    it('should conditionally change visibility and increment version', async () => {
      const updatedGig = {
        publicId: 'radiohead-2026-06-12',
        isVisible: false,
        version: 8,
      };
      findOneAndUpdateMock.mockResolvedValue(updatedGig);

      await expect(
        service.updateGigVisibilityByPublicId({
          publicId: 'radiohead-2026-06-12',
          expectedVersion: 7,
          isVisible: false,
        }),
      ).resolves.toBe(updatedGig);

      expect(findOneAndUpdateMock).toHaveBeenCalledWith(
        { publicId: 'radiohead-2026-06-12', version: 7 },
        {
          $set: { isVisible: false },
          $inc: { version: 1 },
        },
        { returnDocument: 'after' },
      );
    });
  });
});

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

import { Status } from './types/status.enum';
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

  beforeEach(async () => {
    vi.clearAllMocks();
    execMock.mockResolvedValue([]);
    aggregateExecMock.mockResolvedValue([]);
    countDocumentsMock.mockReturnValue({ exec: vi.fn().mockResolvedValue(0) });
    findByIdExecMock.mockResolvedValue(null);
    findOneExecMock.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GigService,
        {
          provide: getModelToken(Gig.name),
          useValue: {
            find: findMock,
            findById: findByIdMock,
            findOne: findOneMock,
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
        { provide: GigPosterService, useValue: { upload: vi.fn() } },
        { provide: TelegramService, useValue: {} },
        { provide: BucketService, useValue: {} },
      ],
    }).compile();

    service = module.get<GigService>(GigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPublishedGigDocumentsInInclusiveMsRange', () => {
    it('should query published gigs with inclusive date bounds when fromMs and toMs are given', async () => {
      const fromMs = new Date(2024, 5, 10, 0, 0, 0, 0).getTime();
      const toMs = new Date(2024, 5, 16, 23, 59, 59, 999).getTime();

      await service.getPublishedGigDocumentsInInclusiveMsRange({
        fromMs,
        toMs,
      });

      expect(findMock).toHaveBeenCalledWith({
        status: Status.Published,
        date: { $gte: fromMs, $lte: toMs },
      });
      expect(collationMock).toHaveBeenCalledWith({
        locale: 'en',
        strength: 2,
      });
      expect(sortForCollationMock).toHaveBeenCalledWith({ date: 1, _id: 1 });
    });
  });

  describe('getGigsByStatus', () => {
    it('should return plain gigs without sort when sortBy is omitted', async () => {
      const plainGig = { _id: new Types.ObjectId(), publicId: 'gig-1' };
      execMock.mockResolvedValue([plainGig]);

      await expect(
        service.getGigsByStatus({
          statuses: [Status.Pending],
          limit: 10,
        }),
      ).resolves.toEqual([plainGig]);

      expect(findMock).toHaveBeenCalledWith({ status: Status.Pending });
      expect(limitMock).toHaveBeenCalledWith(10);
      expect(leanMock).toHaveBeenCalled();
      expect(sortForLimitMock).not.toHaveBeenCalled();
      expect(aggregateMock).not.toHaveBeenCalled();
    });

    it('should throw when sortBy is unsupported', () => {
      const invalidSortBy = 'invalid' as AdminGigListSortBy;

      expect(() =>
        service.getGigsByStatus({
          statuses: [Status.Pending],
          limit: 10,
          sortBy: invalidSortBy,
        }),
      ).toThrow('Unsupported admin gig list sortBy: invalid');
    });

    it('should return plain gigs when sort is createdAt', async () => {
      const plainGig = { _id: new Types.ObjectId(), publicId: 'gig-2' };
      execMock.mockResolvedValue([plainGig]);

      await expect(
        service.getGigsByStatus({
          statuses: [Status.Pending],
          limit: 15,
          sortBy: AdminGigListSortBy.CreatedAt,
          sortOrder: AdminGigListSortOrder.Desc,
        }),
      ).resolves.toEqual([plainGig]);

      expect(findMock).toHaveBeenCalledWith({ status: Status.Pending });
      expect(sortForLimitMock).toHaveBeenCalledWith({ _id: -1 });
      expect(limitMock).toHaveBeenCalledWith(15);
      expect(aggregateMock).not.toHaveBeenCalled();
    });

    it('should return plain gigs when sort is eventDate', async () => {
      const plainGig = { _id: new Types.ObjectId(), publicId: 'gig-3' };
      execMock.mockResolvedValue([plainGig]);

      await expect(
        service.getGigsByStatus({
          statuses: [Status.Published],
          limit: 20,
          sortBy: AdminGigListSortBy.EventDate,
          sortOrder: AdminGigListSortOrder.Asc,
        }),
      ).resolves.toEqual([plainGig]);

      expect(findMock).toHaveBeenCalledWith({ status: Status.Published });
      expect(sortForLimitMock).toHaveBeenCalledWith({ date: 1, _id: 1 });
      expect(limitMock).toHaveBeenCalledWith(20);
      expect(aggregateMock).not.toHaveBeenCalled();
    });

    it('should query multiple statuses with $in when more than one status is given', async () => {
      const plainGig = { _id: new Types.ObjectId(), publicId: 'gig-4' };
      execMock.mockResolvedValue([plainGig]);

      await expect(
        service.getGigsByStatus({
          statuses: [Status.Approved, Status.Published],
          limit: 20,
        }),
      ).resolves.toEqual([plainGig]);

      expect(findMock).toHaveBeenCalledWith({
        status: { $in: [Status.Approved, Status.Published] },
      });
    });
  });

  describe('getGigCountByStatus', () => {
    it('should return gig count for the given status', async () => {
      const countExecMock = vi.fn().mockResolvedValue(7);
      countDocumentsMock.mockReturnValue({ exec: countExecMock });

      await expect(service.getGigCountByStatus(Status.Pending)).resolves.toBe(
        7,
      );

      expect(countDocumentsMock).toHaveBeenCalledWith({
        status: Status.Pending,
      });
      expect(countExecMock).toHaveBeenCalledTimes(1);
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
});

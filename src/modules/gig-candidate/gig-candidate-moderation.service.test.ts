import { GigCandidateSource } from './types/gig-candidate-source.enum';
import { BadRequestException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { GigService } from '../gig/gig.service';
import { TelegramService } from '../telegram/telegram.service';
import { GigCandidateModerationService } from './gig-candidate-moderation.service';
import { GigCandidateService } from './gig-candidate.service';
import { GigCandidateStatus } from './types/gig-candidate-status.enum';
import type { GigCandidateRecord } from './types/gig-candidate.types';

describe('GigCandidateModerationService', () => {
  let service: GigCandidateModerationService;

  const gigCandidateId = '507f1f77bcf86cd799439099';
  const gigId = '507f1f77bcf86cd799439011';

  function buildGigCandidateRecord(
    overrides: Partial<GigCandidateRecord> = {},
  ): GigCandidateRecord {
    return {
      id: gigCandidateId,
      source: GigCandidateSource.User,
      title: 'Suggested Band',
      date: Date.parse('2026-08-01T00:00:00.000Z'),
      city: 'Barcelona',
      country: 'ES',
      status: GigCandidateStatus.Pending,
      posts: [],
      suggestedBy: { userId: 42, username: 'fan' },
      poster: { bucketPath: 'gigs/gc' },
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  const gigCandidateServiceMock = {
    getByIdOrThrow: vi.fn(),
    findById: vi.fn(),
    markAccepted: vi.fn(),
    markRejected: vi.fn(),
  };

  const gigServiceMock = {
    createFromGigCandidate: vi.fn(),
    setPendingWithOptionalModerationPost: vi.fn(),
  };

  const telegramServiceMock = {
    sendToModeration: vi.fn(),
    updateGigCandidateSuggestionPost: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GigCandidateModerationService,
        { provide: GigCandidateService, useValue: gigCandidateServiceMock },
        { provide: GigService, useValue: gigServiceMock },
        { provide: TelegramService, useValue: telegramServiceMock },
      ],
    }).compile();

    service = module.get(GigCandidateModerationService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('accept', () => {
    it('should create Gig, mark GigCandidate Accepted, and link gigId when Pending', async () => {
      const pending = buildGigCandidateRecord();
      const accepted = buildGigCandidateRecord({
        status: GigCandidateStatus.Accepted,
        gigId,
      });
      gigCandidateServiceMock.getByIdOrThrow.mockResolvedValue(pending);
      gigServiceMock.createFromGigCandidate.mockResolvedValue({
        _id: { toString: () => gigId },
        publicId: 'suggested-band-2026-08-01',
      });
      gigServiceMock.setPendingWithOptionalModerationPost.mockResolvedValue({
        _id: { toString: () => gigId },
        publicId: 'suggested-band-2026-08-01',
      });
      telegramServiceMock.sendToModeration.mockResolvedValue({
        message_id: 10,
        date: 1_700_000_000,
        chat: { id: -1001 },
        photo: [{ file_id: 'f1', width: 1, height: 1 }],
      });
      gigCandidateServiceMock.markAccepted.mockResolvedValue(accepted);

      await service.accept({ gigCandidateId });

      expect(gigServiceMock.createFromGigCandidate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Suggested Band',
          gigCandidateId,
          suggestedBy: pending.suggestedBy,
        }),
      );
      expect(
        gigServiceMock.setPendingWithOptionalModerationPost,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          gigId,
          moderationPost: expect.objectContaining({
            id: 10,
            chatId: -1001,
          }),
        }),
      );
      expect(gigCandidateServiceMock.markAccepted).toHaveBeenCalledWith({
        id: gigCandidateId,
        gigId,
      });
    });

    it('should throw BadRequestException when GigCandidate is already Accepted', async () => {
      gigCandidateServiceMock.getByIdOrThrow.mockResolvedValue(
        buildGigCandidateRecord({ status: GigCandidateStatus.Accepted }),
      );

      await expect(service.accept({ gigCandidateId })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(gigServiceMock.createFromGigCandidate).not.toHaveBeenCalled();
    });
    it('should throw BadRequestException when GigCandidate is already Rejected', async () => {
      gigCandidateServiceMock.getByIdOrThrow.mockResolvedValue(
        buildGigCandidateRecord({ status: GigCandidateStatus.Rejected }),
      );

      await expect(service.accept({ gigCandidateId })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(gigServiceMock.createFromGigCandidate).not.toHaveBeenCalled();
    });
  });

  describe('rejectIfGigCandidate', () => {
    it('should return false when GigCandidate does not exist', async () => {
      gigCandidateServiceMock.findById.mockResolvedValue(null);

      const isHandled = await service.rejectIfGigCandidate({ gigCandidateId });

      expect(isHandled).toBe(false);
    });

    it('should mark Rejected and return true when GigCandidate is Pending', async () => {
      gigCandidateServiceMock.findById.mockResolvedValue(
        buildGigCandidateRecord(),
      );
      gigCandidateServiceMock.markRejected.mockResolvedValue(
        buildGigCandidateRecord({ status: GigCandidateStatus.Rejected }),
      );

      const isHandled = await service.rejectIfGigCandidate({ gigCandidateId });

      expect(isHandled).toBe(true);
      expect(gigCandidateServiceMock.markRejected).toHaveBeenCalledWith({
        id: gigCandidateId,
      });
    });

    it('should throw BadRequestException when GigCandidate is already Accepted', async () => {
      gigCandidateServiceMock.findById.mockResolvedValue(
        buildGigCandidateRecord({ status: GigCandidateStatus.Accepted }),
      );

      await expect(
        service.rejectIfGigCandidate({ gigCandidateId }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should throw BadRequestException when GigCandidate is already Rejected', async () => {
      gigCandidateServiceMock.findById.mockResolvedValue(
        buildGigCandidateRecord({ status: GigCandidateStatus.Rejected }),
      );

      await expect(
        service.rejectIfGigCandidate({ gigCandidateId }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

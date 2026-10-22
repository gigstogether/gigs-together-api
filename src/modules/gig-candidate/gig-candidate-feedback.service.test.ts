import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Messenger } from '../../shared/types/messenger.enum';
import { GigSourceType } from '../gig/types/gig-source-type.enum';
import { GigSourceUserOriginType } from '../gig/types/gig-source-user-origin-type.enum';
import { TelegramGigCandidateService } from '../telegram/telegram-gig-candidate/telegram-gig-candidate.service';
import { UserService } from '../user/user.service';
import { UserRole } from '../user/types/user-role.enum';
import { GigCandidateFeedbackService } from './gig-candidate-feedback.service';
import { GigCandidateStatus } from './types/gig-candidate-status.enum';
import type { GigCandidate } from './types/gig-candidate.types';

describe('GigCandidateFeedbackService', () => {
  const userServiceMock = {
    findActiveUserById: vi.fn(),
  };
  const telegramGigCandidateServiceMock = {
    sendFeedback: vi.fn(),
  };

  async function createService(
    isAdminSubmissionFeedbackEnabled = false,
  ): Promise<GigCandidateFeedbackService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GigCandidateFeedbackService,
        { provide: UserService, useValue: userServiceMock },
        {
          provide: TelegramGigCandidateService,
          useValue: telegramGigCandidateServiceMock,
        },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            SHOULD_SEND_GIG_SUBMISSION_FEEDBACK_TO_ADMINS:
              isAdminSubmissionFeedbackEnabled ? 'true' : '',
          }),
        },
      ],
    }).compile();

    return module.get(GigCandidateFeedbackService);
  }

  beforeEach(() => {
    userServiceMock.findActiveUserById.mockResolvedValue({
      id: '507f1f77bcf86cd799439088',
      status: 'active',
      roles: [],
      identities: [
        {
          type: 'messenger',
          messenger: Messenger.Telegram,
          externalUserId: '42',
        },
      ],
      createdAt: new Date('2026-08-22T10:00:00.000Z'),
      updatedAt: new Date('2026-08-22T10:00:00.000Z'),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should send lifecycle feedback to the submitter Telegram identity', async () => {
    const service = await createService();
    const gigCandidate = buildGigCandidate();

    await service.sendBestEffort(gigCandidate, {
      kind: 'submitted',
      subject: 'Radiohead',
    });

    expect(userServiceMock.findActiveUserById).toHaveBeenCalledWith(
      gigCandidate.source.type === GigSourceType.User
        ? gigCandidate.source.userId
        : undefined,
    );
    expect(telegramGigCandidateServiceMock.sendFeedback).toHaveBeenCalledWith({
      kind: 'submitted',
      subject: 'Radiohead',
      chatId: '42',
    });
  });

  it('should prefer the source message over text for messenger lifecycle feedback', async () => {
    const service = await createService();
    const gigCandidate = buildGigCandidate({
      source: {
        type: GigSourceType.User,
        userId: '507f1f77bcf86cd799439088',
        origin: {
          type: GigSourceUserOriginType.Messenger,
          messenger: Messenger.Telegram,
          message: { chatId: -100123, messageId: 17 },
        },
        originalText: 'Radiohead in Barcelona',
      },
    });

    await service.sendBestEffort(gigCandidate, {
      kind: 'rejected',
      subject: 'Radiohead',
    });

    expect(telegramGigCandidateServiceMock.sendFeedback).toHaveBeenCalledWith({
      kind: 'rejected',
      subject: {
        type: 'telegramMessage',
        chatId: -100123,
        messageId: 17,
      },
      chatId: '42',
    });
  });

  it('should preserve public-link feedback content', async () => {
    const service = await createService();
    const gigCandidate = buildGigCandidate();

    await service.sendBestEffort(gigCandidate, {
      kind: 'acceptedWithPublicLink',
      publicId: 'radiohead-2026-06-12',
      subject: 'Radiohead',
    });

    expect(telegramGigCandidateServiceMock.sendFeedback).toHaveBeenCalledWith({
      kind: 'acceptedWithPublicLink',
      publicId: 'radiohead-2026-06-12',
      subject: 'Radiohead',
      chatId: '42',
    });
  });

  it('should skip admin-origin feedback before loading the user when disabled', async () => {
    const service = await createService();
    const gigCandidate = buildGigCandidate({
      source: {
        type: GigSourceType.User,
        userId: '507f1f77bcf86cd799439088',
        origin: { type: GigSourceUserOriginType.Admin },
      },
    });

    await service.sendBestEffort(gigCandidate, {
      kind: 'acceptedForModeration',
      subject: 'Radiohead',
    });

    expect(userServiceMock.findActiveUserById).not.toHaveBeenCalled();
    expect(telegramGigCandidateServiceMock.sendFeedback).not.toHaveBeenCalled();
  });

  it('should send admin-origin feedback when enabled', async () => {
    const service = await createService(true);
    const gigCandidate = buildGigCandidate({
      source: {
        type: GigSourceType.User,
        userId: '507f1f77bcf86cd799439088',
        origin: { type: GigSourceUserOriginType.Admin },
      },
    });
    userServiceMock.findActiveUserById.mockResolvedValue({
      id: '507f1f77bcf86cd799439088',
      status: 'active',
      roles: [UserRole.Admin],
      identities: [
        {
          type: 'messenger',
          messenger: Messenger.Telegram,
          externalUserId: '42',
        },
      ],
      createdAt: new Date('2026-08-22T10:00:00.000Z'),
      updatedAt: new Date('2026-08-22T10:00:00.000Z'),
    });

    await service.sendBestEffort(gigCandidate, {
      kind: 'acceptedForModeration',
      subject: 'Radiohead',
    });

    expect(telegramGigCandidateServiceMock.sendFeedback).toHaveBeenCalledWith({
      kind: 'acceptedForModeration',
      subject: 'Radiohead',
      chatId: '42',
    });
  });

  it('should skip feedback when the source cannot identify a user', async () => {
    const service = await createService();
    const gigCandidate = buildGigCandidate({
      source: {
        type: GigSourceType.User,
        origin: {
          type: GigSourceUserOriginType.Messenger,
          messenger: Messenger.Telegram,
          message: { chatId: -100123, messageId: 17 },
        },
        originalText: 'Radiohead in Barcelona',
      },
    });

    await service.sendBestEffort(gigCandidate, { kind: 'rejected' });

    expect(userServiceMock.findActiveUserById).not.toHaveBeenCalled();
    expect(telegramGigCandidateServiceMock.sendFeedback).not.toHaveBeenCalled();
  });

  it('should log a diagnostic warning and keep the caller successful when sending fails', async () => {
    const loggerWarnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const service = await createService();
    const gigCandidate = buildGigCandidate();
    telegramGigCandidateServiceMock.sendFeedback.mockRejectedValueOnce(
      new Error('Telegram unavailable'),
    );

    await expect(
      service.sendBestEffort(gigCandidate, {
        kind: 'submitted',
        subject: 'Radiohead',
      }),
    ).resolves.toBeUndefined();
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      `sendGigCandidateFeedback failed for gigCandidateId=${gigCandidate.id}: Telegram unavailable`,
    );
  });
});

function buildGigCandidate(
  overrides: Partial<GigCandidate> = {},
): GigCandidate {
  return {
    id: '507f1f77bcf86cd799439099',
    status: GigCandidateStatus.New,
    version: 0,
    source: {
      type: GigSourceType.User,
      userId: '507f1f77bcf86cd799439088',
      origin: { type: GigSourceUserOriginType.Form },
    },
    gigDraft: { title: 'Radiohead' },
    posts: [],
    createdAt: new Date('2026-08-22T10:00:00.000Z'),
    updatedAt: new Date('2026-08-22T10:00:00.000Z'),
    ...overrides,
  };
}

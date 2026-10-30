import { Logger, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AlertCode, AlertSeverity } from '../../alerting/alert-delivery';
import { AlertingService } from '../../alerting/alerting.service';
import { CalendarService } from '../../calendar/calendar.service';
import type { CalendarEvent } from '../../calendar/calendar.types';
import { GigFeedRevalidationService } from '../../gig/gig-feed/gig-feed-revalidation.service';
import { GigService } from '../../gig/gig.service';
import { GigSourceType } from '../../gig/types/gig-source-type.enum';
import { GigSourceUserOriginType } from '../../gig/types/gig-source-user-origin-type.enum';
import { TelegramGigService } from '../../telegram/telegram-gig/telegram-gig.service';
import { GigCandidateFeedbackService } from '../gig-candidate-feedback.service';
import {
  GigCandidateConflictError,
  GigCandidateCommand,
} from '../gig-candidate-state-machine';
import { GigCandidateStatus } from '../types/gig-candidate-status.enum';
import { GIG_CANDIDATE_APPROVAL_REPOSITORY } from '../repositories/gig-candidate-approval/gig-candidate-approval.repository';
import type { GigApprovalResult } from '../repositories/gig-candidate-approval/gig-candidate-approval.repository';
import type { GigCandidate } from '../types/gig-candidate.types';
import { GigCandidateApprovalService } from './gig-candidate-approval.service';

describe('GigCandidateApprovalService', () => {
  const approvalTransactionMock = {
    createGigId: vi.fn(),
    findGigCandidateById: vi.fn(),
    findGigById: vi.fn(),
    isGigPublicIdTaken: vi.fn(),
    approveGigCandidate: vi.fn(),
    createGig: vi.fn(),
  };
  const gigCandidateApprovalRepositoryMock = {
    withTransaction: vi.fn(),
  };
  const revalidateGigFeedOrThrowMock =
    vi.fn<GigFeedRevalidationService['revalidateGigFeedOrThrow']>();
  const calendarAddEventMock = vi.fn<CalendarService['addEvent']>();
  const gigToCalendarPayloadMock = vi.fn<GigService['gigToCalendarPayload']>();
  const sendAlertBestEffortMock = vi.fn<AlertingService['sendBestEffort']>();
  const sendFeedbackBestEffortMock =
    vi.fn<GigCandidateFeedbackService['sendBestEffort']>();
  const calendarEvent: CalendarEvent = {
    title: 'Radiohead',
    description: 'Tickets: https://example.com/tickets',
    location: 'La Riviera, Madrid',
    startLocalDateTime: '2026-10-30T20:00:00',
    endLocalDateTime: '2026-10-30T22:00:00',
    timeZone: 'Europe/Madrid',
  };
  const approvedGigCandidate: GigCandidate = {
    id: 'gig-candidate-id',
    status: GigCandidateStatus.Approved,
    version: 2,
    source: {
      type: GigSourceType.User,
      userId: 'user-id',
      origin: { type: GigSourceUserOriginType.Form },
    },
    gigDraft: {},
    posts: [],
    gigId: 'gig-id',
    approvedAt: new Date('2026-10-30T12:00:00.000Z'),
    approvedByUserId: 'admin-user-id',
    createdAt: new Date('2026-10-29T12:00:00.000Z'),
    updatedAt: new Date('2026-10-30T12:00:00.000Z'),
  };
  const approvedGig: GigApprovalResult = {
    id: 'gig-id',
    publicId: 'radiohead-madrid-2026-10-30',
    title: 'Radiohead',
    date: Date.parse('2026-10-30T20:00:00.000Z'),
    city: 'Madrid',
    country: 'ES',
    venue: 'La Riviera',
    ticketsUrl: 'https://example.com/tickets',
    isVisible: true,
    version: 0,
    source: {
      type: GigSourceType.User,
      userId: 'user-id',
      origin: { type: GigSourceUserOriginType.Form },
    },
  };

  let service: GigCandidateApprovalService;

  beforeEach(async () => {
    gigCandidateApprovalRepositoryMock.withTransaction.mockImplementation(
      (
        work: (transaction: typeof approvalTransactionMock) => Promise<unknown>,
      ) => work(approvalTransactionMock),
    );
    revalidateGigFeedOrThrowMock.mockResolvedValue(undefined);
    calendarAddEventMock.mockResolvedValue(undefined);
    gigToCalendarPayloadMock.mockReturnValue(calendarEvent);
    sendAlertBestEffortMock.mockResolvedValue(undefined);
    sendFeedbackBestEffortMock.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GigCandidateApprovalService,
        {
          provide: GIG_CANDIDATE_APPROVAL_REPOSITORY,
          useValue: gigCandidateApprovalRepositoryMock,
        },
        {
          provide: GigService,
          useValue: { gigToCalendarPayload: gigToCalendarPayloadMock },
        },
        {
          provide: GigFeedRevalidationService,
          useValue: {
            revalidateGigFeedOrThrow: revalidateGigFeedOrThrowMock,
          },
        },
        {
          provide: CalendarService,
          useValue: { addEvent: calendarAddEventMock },
        },
        {
          provide: AlertingService,
          useValue: { sendBestEffort: sendAlertBestEffortMock },
        },
        { provide: TelegramGigService, useValue: {} },
        {
          provide: GigCandidateFeedbackService,
          useValue: { sendBestEffort: sendFeedbackBestEffortMock },
        },
      ],
    }).compile();

    service = module.get(GigCandidateApprovalService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  function arrangeCalendarFailureAfterApproval(): void {
    gigCandidateApprovalRepositoryMock.withTransaction.mockResolvedValueOnce({
      gig: approvedGig,
      gigCandidate: approvedGigCandidate,
      isNewApproval: true,
    });
    calendarAddEventMock.mockRejectedValueOnce(
      new Error('Calendar is unavailable'),
    );
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  }

  it('should reject an invalid expected version before opening a transaction', async () => {
    await expect(
      service.approveGigCandidate({
        gigCandidateId: '507f1f77bcf86cd799439099',
        expectedVersion: -1,
        approvedByUserId: '507f1f77bcf86cd799439077',
      }),
    ).rejects.toMatchObject({
      name: GigCandidateConflictError.name,
      command: GigCandidateCommand.Approve,
      reason: 'versionConflict',
    });
    expect(
      gigCandidateApprovalRepositoryMock.withTransaction,
    ).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException when the GigCandidate does not exist', async () => {
    approvalTransactionMock.findGigCandidateById.mockResolvedValue(null);

    await expect(
      service.approveGigCandidate({
        gigCandidateId: '507f1f77bcf86cd799439099',
        expectedVersion: 0,
        approvedByUserId: '507f1f77bcf86cd799439077',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(approvalTransactionMock.createGigId).not.toHaveBeenCalled();
  });

  it('should send an alert when Calendar event creation fails', async () => {
    arrangeCalendarFailureAfterApproval();

    await service.approveGigCandidate({
      gigCandidateId: approvedGigCandidate.id,
      expectedVersion: 1,
      approvedByUserId: 'admin-user-id',
    });

    expect(sendAlertBestEffortMock).toHaveBeenCalledWith({
      code: AlertCode.GigCalendarEventCreationFailed,
      severity: AlertSeverity.Warning,
      summary: 'Calendar event was not created for the gig.',
      attributes: {
        operation: 'gigCandidateApproval',
        gigCandidateId: approvedGigCandidate.id,
        gigId: approvedGig.id,
        gigPublicId: approvedGig.publicId,
      },
    });
  });

  it('should preserve approval when Calendar event creation fails', async () => {
    arrangeCalendarFailureAfterApproval();

    await expect(
      service.approveGigCandidate({
        gigCandidateId: approvedGigCandidate.id,
        expectedVersion: 1,
        approvedByUserId: 'admin-user-id',
      }),
    ).resolves.toBe(approvedGig);
  });
});

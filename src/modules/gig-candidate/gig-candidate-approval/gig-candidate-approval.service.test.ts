import { Logger, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AlertSeverity } from '@modules/alerting/alert-delivery';
import {
  AlertingService,
  AlertLogLevel,
} from '@modules/alerting/alerting.service';
import { CalendarEventCreationError } from '@modules/calendar/calendar.errors';
import { CalendarService } from '@modules/calendar/calendar.service';
import type { CalendarEvent } from '@modules/calendar/calendar.types';
import { VenueService } from '@modules/location/venue/venue.service';
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
import { GIG_CANDIDATE_APPROVAL_REPOSITORY } from './repositories/gig-candidate-approval.repository';
import type { GigApprovalResult } from './repositories/gig-candidate-approval.repository';
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
  const revalidateGigFeedsOrThrowMock =
    vi.fn<GigFeedRevalidationService['revalidateGigFeedsOrThrow']>();
  const calendarAddEventMock = vi.fn<CalendarService['addEvent']>();
  const gigToCalendarPayloadMock = vi.fn<GigService['gigToCalendarPayload']>();
  const resolveVenueSelectionMock =
    vi.fn<VenueService['resolveVenueSelection']>();
  const reportFailureBestEffortMock =
    vi.fn<AlertingService['reportFailureBestEffort']>();
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
  const calendarProviderFailure = new Error('Not Found');
  const calendarFailure = new CalendarEventCreationError({
    message: 'Google Calendar event creation failed: Not Found',
    cause: calendarProviderFailure,
    provider: 'googleCalendar',
    providerOperation: 'events.insert',
    status: 404,
    hint: 'Calendar does not exist or the service account has no access',
  });
  const approvedGigCandidate: GigCandidate = {
    id: 'gig-candidate-id',
    status: GigCandidateStatus.Approved,
    version: 2,
    source: {
      type: GigSourceType.User,
      userId: 'user-id',
      origin: { type: GigSourceUserOriginType.Form },
    },
    gigDraft: { communityIds: ['507f1f77bcf86cd799439011'] },
    posts: [],
    gigId: 'gig-id',
    approvedAt: new Date('2026-10-30T12:00:00.000Z'),
    approvedByUserId: 'admin-user-id',
    createdAt: new Date('2026-10-29T12:00:00.000Z'),
    updatedAt: new Date('2026-10-30T12:00:00.000Z'),
  };
  const approvedGig: GigApprovalResult = {
    id: 'gig-id',
    communityIds: ['507f1f77bcf86cd799439011'],
    venueIds: ['507f1f77bcf86cd799439012'],
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
  const resolvedVenueSelection = {
    locality: {
      id: '507f1f77bcf86cd799439013',
      countryIso: 'ES',
      name: 'Madrid',
      aliases: [],
      timeZone: 'Europe/Madrid',
    },
    venues: [
      {
        id: '507f1f77bcf86cd799439012',
        localityId: '507f1f77bcf86cd799439013',
        name: 'La Riviera',
        aliases: [],
        isActive: true,
      },
    ],
  };

  let service: GigCandidateApprovalService;

  beforeEach(async () => {
    gigCandidateApprovalRepositoryMock.withTransaction.mockImplementation(
      (
        work: (transaction: typeof approvalTransactionMock) => Promise<unknown>,
      ) => work(approvalTransactionMock),
    );
    revalidateGigFeedsOrThrowMock.mockResolvedValue(undefined);
    calendarAddEventMock.mockResolvedValue(undefined);
    gigToCalendarPayloadMock.mockReturnValue(calendarEvent);
    reportFailureBestEffortMock.mockResolvedValue(undefined);
    sendFeedbackBestEffortMock.mockResolvedValue(undefined);
    resolveVenueSelectionMock.mockResolvedValue(resolvedVenueSelection);

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
          provide: VenueService,
          useValue: { resolveVenueSelection: resolveVenueSelectionMock },
        },
        {
          provide: GigFeedRevalidationService,
          useValue: {
            revalidateGigFeedsOrThrow: revalidateGigFeedsOrThrowMock,
          },
        },
        {
          provide: CalendarService,
          useValue: { addEvent: calendarAddEventMock },
        },
        {
          provide: AlertingService,
          useValue: {
            reportFailureBestEffort: reportFailureBestEffortMock,
          },
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

  function arrangeCalendarFailureAfterApproval() {
    gigCandidateApprovalRepositoryMock.withTransaction.mockResolvedValueOnce({
      gig: approvedGig,
      gigCandidate: approvedGigCandidate,
      venueSelection: resolvedVenueSelection,
      isNewApproval: true,
    });
    calendarAddEventMock.mockRejectedValueOnce(calendarFailure);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  }

  it('should build the Calendar event from the resolved Venue selection', async () => {
    gigCandidateApprovalRepositoryMock.withTransaction.mockResolvedValueOnce({
      gig: approvedGig,
      gigCandidate: approvedGigCandidate,
      venueSelection: resolvedVenueSelection,
      isNewApproval: true,
    });

    await service.approveGigCandidate({
      gigCandidateId: approvedGigCandidate.id,
      expectedVersion: 1,
      approvedByUserId: 'admin-user-id',
    });

    expect(gigToCalendarPayloadMock).toHaveBeenCalledWith({
      title: approvedGig.title,
      date: approvedGig.date,
      locality: {
        countryIso: 'ES',
        name: 'Madrid',
        timeZone: 'Europe/Madrid',
      },
      venues: [{ name: 'La Riviera' }],
      ticketsUrl: approvedGig.ticketsUrl,
    });
  });

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

  it('should report an alert when Calendar event creation fails', async () => {
    arrangeCalendarFailureAfterApproval();

    await service.approveGigCandidate({
      gigCandidateId: approvedGigCandidate.id,
      expectedVersion: 1,
      approvedByUserId: 'admin-user-id',
    });

    expect(reportFailureBestEffortMock).toHaveBeenCalledWith({
      alert: {
        code: 'gigCalendarEventCreationFailed',
        severity: AlertSeverity.Warning,
        summary: 'Calendar event was not created for the gig.',
        attributes: {
          operation: 'createCalendarEvent',
          trigger: 'gigCandidateApproval',
          gigCandidateId: approvedGigCandidate.id,
          gigId: approvedGig.id,
          gigPublicId: approvedGig.publicId,
          calendarProvider: 'googleCalendar',
          providerOperation: 'events.insert',
          status: 404,
          hint: 'Calendar does not exist or the service account has no access',
        },
      },
      error: calendarFailure,
      logContext: GigCandidateApprovalService.name,
      logNote: 'Calendar event creation failed after gig candidate approval',
      logLevel: AlertLogLevel.Error,
      isStackTraceIncluded: false,
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

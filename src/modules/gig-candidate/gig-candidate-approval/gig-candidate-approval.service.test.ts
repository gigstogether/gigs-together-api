import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { CalendarService } from '../../calendar/calendar.service';
import { FeedRevalidationService } from '../../feed-revalidation/feed-revalidation.service';
import { GigService } from '../../gig/gig.service';
import { TelegramGigService } from '../../telegram/telegram-gig/telegram-gig.service';
import { GigCandidateFeedbackService } from '../gig-candidate-feedback.service';
import {
  GigCandidateConflictError,
  GigCandidateCommand,
} from '../gig-candidate-state-machine';
import { GIG_CANDIDATE_APPROVAL_REPOSITORY } from '../repositories/gig-candidate-approval/gig-candidate-approval.repository';
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

  let service: GigCandidateApprovalService;

  beforeEach(async () => {
    gigCandidateApprovalRepositoryMock.withTransaction.mockImplementation(
      (
        work: (transaction: typeof approvalTransactionMock) => Promise<unknown>,
      ) => work(approvalTransactionMock),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GigCandidateApprovalService,
        {
          provide: GIG_CANDIDATE_APPROVAL_REPOSITORY,
          useValue: gigCandidateApprovalRepositoryMock,
        },
        { provide: GigService, useValue: {} },
        { provide: FeedRevalidationService, useValue: {} },
        { provide: CalendarService, useValue: {} },
        { provide: TelegramGigService, useValue: {} },
        { provide: GigCandidateFeedbackService, useValue: {} },
      ],
    }).compile();

    service = module.get(GigCandidateApprovalService);
  });

  afterEach(() => {
    vi.clearAllMocks();
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
});

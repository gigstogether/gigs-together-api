import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Messenger } from '../../../shared/types/messenger.enum';
import { PostType } from '../../../shared/types/post-type.enum';
import { formatErrorMessage } from '../../../shared/utils/logging';
import { CalendarService } from '../../calendar/calendar.service';
import { FeedRevalidationService } from '../../feed-revalidation/feed-revalidation.service';
import { GigService } from '../../gig/gig.service';
import { TelegramGigService } from '../../telegram/telegram-gig/telegram-gig.service';
import { formatTelegramErrorMessage } from '../../telegram/utils/telegram-error';
import { GigCandidateFeedbackService } from '../gig-candidate-feedback.service';
import {
  GigCandidateCommand,
  GigCandidateConflictError,
  getGigCandidateTransitionPolicy,
} from '../gig-candidate-state-machine';
import { GIG_CANDIDATE_APPROVAL_REPOSITORY } from '../repositories/gig-candidate-approval/gig-candidate-approval.repository';
import type {
  GigApprovalResult,
  GigCandidateApprovalRepository,
  GigCandidateApprovalTransaction,
} from '../repositories/gig-candidate-approval/gig-candidate-approval.repository';
import type { GigCandidate } from '../types/gig-candidate.types';
import {
  mapGigCandidateSourceToGigSource,
  requireApprovedGigId,
  validateGigCandidateDraftForApproval,
} from './gig-candidate-approval';

export interface ApproveGigCandidateParams {
  gigCandidateId: string;
  expectedVersion: number;
  approvedByUserId: string;
}

interface GigCandidateApprovalTransactionResult {
  gig: GigApprovalResult;
  gigCandidate: GigCandidate;
  moderationPost?: GigCandidate['posts'][number];
  isNewApproval: boolean;
}

@Injectable()
export class GigCandidateApprovalService {
  private readonly logger = new Logger(GigCandidateApprovalService.name);

  constructor(
    @Inject(GIG_CANDIDATE_APPROVAL_REPOSITORY)
    private readonly gigCandidateApprovalRepository: GigCandidateApprovalRepository,
    private readonly gigService: GigService,
    private readonly feedRevalidationService: FeedRevalidationService,
    private readonly calendarService: CalendarService,
    private readonly telegramGigService: TelegramGigService,
    private readonly gigCandidateFeedbackService: GigCandidateFeedbackService,
  ) {}

  async approveGigCandidate(
    params: ApproveGigCandidateParams,
  ): Promise<GigApprovalResult> {
    this.assertExpectedVersionIsValid(
      params.gigCandidateId,
      params.expectedVersion,
    );

    const result = await this.gigCandidateApprovalRepository.withTransaction(
      async (transaction) =>
        this.approveGigCandidateInTransaction(params, transaction),
    );

    if (result.isNewApproval) {
      await this.runPostCommitActions(result);
    }
    return result.gig;
  }

  private async approveGigCandidateInTransaction(
    params: ApproveGigCandidateParams,
    transaction: GigCandidateApprovalTransaction,
  ): Promise<GigCandidateApprovalTransactionResult> {
    const gigCandidate = await transaction.findGigCandidateById(
      params.gigCandidateId,
    );
    if (!gigCandidate) {
      throw new NotFoundException(
        `GigCandidate with ID ${params.gigCandidateId} not found`,
      );
    }

    const policy = getGigCandidateTransitionPolicy({
      gigCandidateId: gigCandidate.id,
      status: gigCandidate.status,
      command: GigCandidateCommand.Approve,
    });
    if (policy.isIdempotent) {
      const gigId = requireApprovedGigId(gigCandidate);
      const existingGig = await transaction.findGigById(gigId);
      if (!existingGig) {
        throw new Error(
          `Approved GigCandidate ${gigCandidate.id} references missing Gig ${gigId}.`,
        );
      }
      return { gig: existingGig, gigCandidate, isNewApproval: false };
    }

    this.assertExpectedVersionMatches(gigCandidate, params.expectedVersion);
    const gigData = validateGigCandidateDraftForApproval(gigCandidate.gigDraft);
    const gigId = transaction.createGigId();
    const publicId = await this.generateUniqueGigPublicId(
      gigData.title,
      gigData.date,
      transaction,
    );
    const source = mapGigCandidateSourceToGigSource(gigCandidate.source);
    const moderationPost = this.getModerationPost(gigCandidate);
    const approvedAt = new Date();
    const approvedGigCandidate = await transaction.approveGigCandidate({
      ...params,
      gigId,
      approvedAt,
      gigDraft: gigData,
      moderationPost,
    });
    if (!approvedGigCandidate) {
      throw new GigCandidateConflictError({
        gigCandidateId: gigCandidate.id,
        command: GigCandidateCommand.Approve,
        reason: 'concurrentModification',
        message: `GigCandidate ${gigCandidate.id} changed concurrently during ${GigCandidateCommand.Approve}.`,
      });
    }

    const gig = await transaction.createGig({
      ...gigData,
      gigId,
      publicId,
      source,
      moderationPost,
    });
    return {
      gig,
      gigCandidate: approvedGigCandidate,
      moderationPost,
      isNewApproval: true,
    };
  }

  private generateUniqueGigPublicId(
    title: string,
    date: number,
    transaction: GigCandidateApprovalTransaction,
  ): Promise<string> {
    return this.gigService.generateUniquePublicId({
      title,
      yyyyMmDd: new Date(date).toISOString().slice(0, 10),
      isPublicIdTaken: (publicId) => transaction.isGigPublicIdTaken(publicId),
    });
  }

  private async runPostCommitActions(
    result: GigCandidateApprovalTransactionResult,
  ): Promise<void> {
    const { gig, gigCandidate, moderationPost } = result;
    try {
      await this.feedRevalidationService.revalidateFeedOrThrow({
        country: gig.country,
        city: gig.city,
      });
    } catch (e) {
      this.logIntegrationFailure('revalidateFeed', gigCandidate.id, gig.id, e);
    }

    try {
      await this.calendarService.addEvent(
        this.gigService.gigToCalendarPayload(gig),
      );
    } catch (e) {
      this.logIntegrationFailure(
        'addCalendarEvent',
        gigCandidate.id,
        gig.id,
        e,
      );
    }

    await this.gigCandidateFeedbackService.sendBestEffort(gigCandidate, {
      kind: 'acceptedWithPublicLink',
      publicId: gig.publicId,
      subject: gig.title,
    });

    if (!moderationPost) {
      this.logger.warn(
        `No moderation post linked after approval for gigCandidateId=${gigCandidate.id} gigId=${gig.id}`,
      );
      return;
    }
    try {
      await this.telegramGigService.updateModerationPost({
        gigId: gig.id,
        expectedVersion: gig.version,
        isVisible: gig.isVisible,
        title: gig.title,
        publicId: gig.publicId,
        moderationPost: {
          chatId: moderationPost.chatId,
          messageId: moderationPost.id,
        },
      });
    } catch (e) {
      this.logger.warn(
        `updateGigModerationPost failed after approval for gigCandidateId=${gigCandidate.id} gigId=${gig.id}: ${formatTelegramErrorMessage(e)}`,
      );
    }
  }

  private getModerationPost(
    gigCandidate: GigCandidate,
  ): GigCandidate['posts'][number] | undefined {
    const moderationPosts = gigCandidate.posts.filter(
      (post) =>
        post.to === Messenger.Telegram && post.type === PostType.Moderation,
    );
    if (moderationPosts.length > 1) {
      throw new Error(
        `GigCandidate ${gigCandidate.id} has multiple Telegram Moderation posts.`,
      );
    }
    return moderationPosts[0];
  }

  private assertExpectedVersionIsValid(
    gigCandidateId: string,
    expectedVersion: number,
  ): void {
    if (Number.isInteger(expectedVersion) && expectedVersion >= 0) {
      return;
    }

    throw new GigCandidateConflictError({
      gigCandidateId,
      command: GigCandidateCommand.Approve,
      reason: 'versionConflict',
      message: `Expected version for GigCandidate ${gigCandidateId} must be a non-negative integer.`,
    });
  }

  private assertExpectedVersionMatches(
    gigCandidate: GigCandidate,
    expectedVersion: number,
  ): void {
    if (gigCandidate.version === expectedVersion) {
      return;
    }

    throw new GigCandidateConflictError({
      gigCandidateId: gigCandidate.id,
      command: GigCandidateCommand.Approve,
      reason: 'versionConflict',
      message: `GigCandidate ${gigCandidate.id} version conflict: expected ${expectedVersion}, current ${gigCandidate.version}.`,
    });
  }

  private logIntegrationFailure(
    operation: string,
    gigCandidateId: string,
    gigId: string,
    e: unknown,
  ): void {
    this.logger.warn(
      `${operation} failed after approval for gigCandidateId=${gigCandidateId} gigId=${gigId}: ${formatErrorMessage(e)}`,
    );
  }
}

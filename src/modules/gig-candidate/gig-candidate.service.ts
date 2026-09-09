import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { isAxiosError } from 'axios';
import type { User } from '../auth/types/user.types';
import { GigPosterService } from '../gig/gig.poster.service';
import { Messenger } from '../../shared/types/messenger.enum';
import { TelegramService } from '../telegram/telegram.service';
import { getBiggestTgPhotoFileId } from '../telegram/utils/photo';
import type { TGMessage } from '../telegram/types/message.types';
import { AiService } from '../ai/ai.service';
import { CalendarService } from '../calendar/calendar.service';
import { FeedRevalidateService } from '../gig/feed-revalidate.service';
import { GigService } from '../gig/gig.service';
import { GIG_TITLE_MAX_LENGTH } from '../gig/gig.constants';
import { UserService } from '../user/user.service';
import { UserRole } from '../user/types/user-role.enum';
import { envBool } from '../../shared/utils/env';
import { isRecord } from '../../shared/utils/is-record';
import type { GigCandidateFeedbackMessageContent } from '../telegram/types/telegram-post-composer.service.types';
import { GIG_CANDIDATE_REPOSITORY } from './repositories/gig-candidate.repository';
import type { GigCandidateRepository } from './repositories/gig-candidate.repository';
import { GIG_CANDIDATE_APPROVAL_REPOSITORY } from './repositories/gig-candidate-approval.repository';
import type {
  GigApprovalResult,
  GigCandidateApprovalRepository,
  GigCandidateApprovalTransaction,
} from './repositories/gig-candidate-approval.repository';
import type { V1CreateGigCandidateRequestBody } from './types/requests/v1-create-gig-candidate-request';
import type { V1CreateGigCandidateResponseBody } from './types/requests/v1-create-gig-candidate-response';
import type {
  GigCandidate,
  ApproveGigCandidateParams,
  CreateAdminGigCandidateParams,
  FindGigCandidatesParams,
  GigCandidateDraftLookupResult,
  LookupGigCandidateDraftParams,
  RejectGigCandidateParams,
  SendGigCandidateToModerationParams,
  UpdateAdminGigCandidateDraftParams,
  UpdateGigCandidateDraftParams,
} from './types/gig-candidate.types';
import type { GigPosterFile } from '../gig/types/gig-poster.types';
import { PostType } from '../../shared/types/post-type.enum';
import { GigCandidateStatus } from './types/gig-candidate-status.enum';
import {
  GigCandidateCommand,
  GigCandidateConflictError,
  getGigCandidateTransitionPolicy,
} from './gig-candidate-state-machine';
import {
  projectGigCandidateSource,
  requireApprovedGigId,
  validateGigCandidateDraftForApproval,
} from './gig-candidate-approval';

const DATE_YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

interface HandleGigCandidateSubmitParams {
  body: V1CreateGigCandidateRequestBody;
  user: User;
  posterFile: GigPosterFile | undefined;
}

interface PrepareGigCandidateDraftPosterParams {
  gigCandidateId: string;
  gigDraft: Partial<GigCandidate['gigDraft']>;
  posterUrl?: string;
  posterFile?: GigPosterFile;
  existingPoster?: GigCandidate['gigDraft']['poster'];
  shouldUseDefaultPoster: boolean;
}

interface ParsedCreateGigCandidateFields {
  title: string;
  date: string;
  endDate?: string;
  city: string;
  country: string;
  venue?: string;
  ticketsUrl?: string;
  posterUrl?: string;
}

interface StoreGigCandidateTelegramPostParams {
  gigCandidate: GigCandidate;
  postType: PostType.Intake | PostType.Moderation;
  telegramMessage: TGMessage | undefined;
}

interface GigCandidateApprovalTransactionResult {
  gig: GigApprovalResult;
  gigCandidate: GigCandidate;
  isNewApproval: boolean;
}

@Injectable()
export class GigCandidateService {
  constructor(
    @Inject(GIG_CANDIDATE_REPOSITORY)
    private readonly gigCandidateRepository: GigCandidateRepository,
    @Inject(GIG_CANDIDATE_APPROVAL_REPOSITORY)
    private readonly gigCandidateApprovalRepository: GigCandidateApprovalRepository,
    private readonly gigPosterService: GigPosterService,
    private readonly telegramService: TelegramService,
    private readonly aiService: AiService,
    private readonly calendarService: CalendarService,
    private readonly feedRevalidateService: FeedRevalidateService,
    private readonly gigService: GigService,
    private readonly userService: UserService,
  ) {}

  private readonly logger = new Logger(GigCandidateService.name);

  async handleSubmit(
    params: HandleGigCandidateSubmitParams,
  ): Promise<V1CreateGigCandidateResponseBody> {
    const saved = await this.createGigCandidate(params);

    let telegramIntakePost: TGMessage | undefined;
    try {
      telegramIntakePost =
        await this.telegramService.sendGigCandidateIntakePost(saved);
    } catch (e) {
      this.logTelegramFailure('sendGigCandidateIntakePost', saved.id, e);
    }

    await this.storeGigCandidateTelegramPostBestEffort({
      gigCandidate: saved,
      postType: PostType.Intake,
      telegramMessage: telegramIntakePost,
    });
    await this.sendGigCandidateSubmittedFeedbackBestEffort(saved);

    return { id: saved.id };
  }

  async getByIdOrThrow(id: string): Promise<GigCandidate> {
    const record = await this.gigCandidateRepository.findById(id);
    if (!record) {
      throw new NotFoundException(`GigCandidate with ID ${id} not found`);
    }
    return record;
  }

  findById(id: string): Promise<GigCandidate | null> {
    return this.gigCandidateRepository.findById(id);
  }

  findMany(params: FindGigCandidatesParams): Promise<GigCandidate[]> {
    return this.gigCandidateRepository.findMany(params);
  }

  async createAdminGigCandidate(
    params: CreateAdminGigCandidateParams,
  ): Promise<GigCandidate> {
    const gigCandidateId = this.gigCandidateRepository.createId();
    const gigDraft = await this.prepareGigCandidateDraftPoster({
      gigCandidateId,
      gigDraft: params.gigDraft,
      posterUrl: params.posterUrl,
      posterFile: params.posterFile,
      shouldUseDefaultPoster: true,
    });

    const saved = await this.gigCandidateRepository.createGigCandidate({
      gigCandidateId,
      status: GigCandidateStatus.Reviewing,
      source: {
        type: 'user',
        userId: params.userId,
        origin: { type: 'admin' },
      },
      gigDraft,
    });

    const withModerationPost =
      await this.ensureGigCandidateModerationPostBestEffort(saved);
    await this.sendGigCandidateAcceptedForModerationFeedbackBestEffort(
      withModerationPost,
    );
    return withModerationPost;
  }

  async updateAdminGigCandidateDraft(
    params: UpdateAdminGigCandidateDraftParams,
  ): Promise<GigCandidate> {
    const command = GigCandidateCommand.UpdateDraft;
    this.assertExpectedVersionIsValid(
      params.gigCandidateId,
      params.expectedVersion,
      command,
    );
    const currentGigCandidate = await this.getByIdOrThrow(
      params.gigCandidateId,
    );
    getGigCandidateTransitionPolicy({
      gigCandidateId: currentGigCandidate.id,
      status: currentGigCandidate.status,
      command,
    });
    this.assertExpectedVersionMatches(
      currentGigCandidate,
      params.expectedVersion,
      command,
    );

    const gigDraft = await this.prepareGigCandidateDraftPoster({
      gigCandidateId: currentGigCandidate.id,
      gigDraft: params.gigDraft,
      posterUrl: params.posterUrl,
      posterFile: params.posterFile,
      existingPoster: currentGigCandidate.gigDraft.poster,
      shouldUseDefaultPoster: false,
    });

    return this.updateGigCandidateDraft({
      gigCandidateId: params.gigCandidateId,
      expectedVersion: params.expectedVersion,
      gigDraft,
    });
  }

  async lookupGigCandidateDraft(
    params: LookupGigCandidateDraftParams,
  ): Promise<GigCandidateDraftLookupResult | null> {
    const gigDraft = await this.aiService.lookupGigV1({
      name: params.title,
      location: params.location,
    });
    return gigDraft ? { ...gigDraft } : null;
  }

  async sendGigCandidateToModeration(
    params: SendGigCandidateToModerationParams,
  ): Promise<GigCandidate> {
    const command = GigCandidateCommand.SendToModeration;
    this.assertExpectedVersionIsValid(
      params.gigCandidateId,
      params.expectedVersion,
      command,
    );

    const currentGigCandidate = await this.getByIdOrThrow(
      params.gigCandidateId,
    );
    const policy = getGigCandidateTransitionPolicy({
      gigCandidateId: currentGigCandidate.id,
      status: currentGigCandidate.status,
      command,
    });
    let reviewingGigCandidate = currentGigCandidate;
    let didTransition = false;

    if (!policy.isIdempotent) {
      this.assertExpectedVersionMatches(
        currentGigCandidate,
        params.expectedVersion,
        command,
      );

      const updated =
        await this.gigCandidateRepository.sendGigCandidateToModeration(params);
      if (updated) {
        reviewingGigCandidate = updated;
        didTransition = true;
      } else {
        const latest = await this.getByIdOrThrow(params.gigCandidateId);
        const latestPolicy = getGigCandidateTransitionPolicy({
          gigCandidateId: latest.id,
          status: latest.status,
          command,
        });
        if (!latestPolicy.isIdempotent) {
          return this.throwConditionalWriteConflict(
            latest,
            params.expectedVersion,
            command,
          );
        }
        reviewingGigCandidate = latest;
      }
    }

    const withModerationPost =
      await this.ensureGigCandidateModerationPostBestEffort(
        reviewingGigCandidate,
      );
    await this.updateGigCandidateIntakePostAfterModerationBestEffort(
      withModerationPost,
    );
    if (didTransition) {
      await this.sendGigCandidateAcceptedForModerationFeedbackBestEffort(
        withModerationPost,
      );
    }

    return withModerationPost;
  }

  async rejectGigCandidate(
    params: RejectGigCandidateParams,
  ): Promise<GigCandidate> {
    const command = GigCandidateCommand.Reject;
    this.assertExpectedVersionIsValid(
      params.gigCandidateId,
      params.expectedVersion,
      command,
    );

    const gigCandidate = await this.getByIdOrThrow(params.gigCandidateId);
    getGigCandidateTransitionPolicy({
      gigCandidateId: gigCandidate.id,
      status: gigCandidate.status,
      command,
    });
    this.assertExpectedVersionMatches(
      gigCandidate,
      params.expectedVersion,
      command,
    );

    const updated = await this.gigCandidateRepository.rejectGigCandidate({
      ...params,
      rejectedAt: new Date(),
    });
    if (updated) {
      await this.updateRejectedGigCandidatePostBestEffort(
        updated,
        gigCandidate.status,
      );
      await this.sendGigCandidateRejectedFeedbackBestEffort(updated);
      return updated;
    }

    const latest = await this.getByIdOrThrow(params.gigCandidateId);
    getGigCandidateTransitionPolicy({
      gigCandidateId: latest.id,
      status: latest.status,
      command,
    });
    return this.throwConditionalWriteConflict(
      latest,
      params.expectedVersion,
      command,
    );
  }

  async approveGigCandidate(
    params: ApproveGigCandidateParams,
  ): Promise<GigApprovalResult> {
    const command = GigCandidateCommand.Approve;
    this.assertExpectedVersionIsValid(
      params.gigCandidateId,
      params.expectedVersion,
      command,
    );

    const result = await this.gigCandidateApprovalRepository.withTransaction(
      async (transaction) =>
        this.approveGigCandidateInTransaction(params, transaction),
    );

    if (result.isNewApproval) {
      await this.runApprovalPostCommitActions(result);
    }
    return result.gig;
  }

  async updateGigCandidateDraft(
    params: UpdateGigCandidateDraftParams,
  ): Promise<GigCandidate> {
    const command = GigCandidateCommand.UpdateDraft;
    this.assertExpectedVersionIsValid(
      params.gigCandidateId,
      params.expectedVersion,
      command,
    );

    const gigCandidate = await this.getByIdOrThrow(params.gigCandidateId);
    getGigCandidateTransitionPolicy({
      gigCandidateId: gigCandidate.id,
      status: gigCandidate.status,
      command,
    });
    this.assertExpectedVersionMatches(
      gigCandidate,
      params.expectedVersion,
      command,
    );

    const updated =
      await this.gigCandidateRepository.updateGigCandidateDraft(params);
    if (updated) {
      return updated;
    }

    const latest = await this.getByIdOrThrow(params.gigCandidateId);
    getGigCandidateTransitionPolicy({
      gigCandidateId: latest.id,
      status: latest.status,
      command,
    });
    return this.throwConditionalWriteConflict(
      latest,
      params.expectedVersion,
      command,
    );
  }

  private async createGigCandidate(
    params: HandleGigCandidateSubmitParams,
  ): Promise<GigCandidate> {
    const { body, user, posterFile } = params;
    const gig = this.parseAndValidateCreateBody(body.gig);

    const dateMs = this.parseRequiredDateMs(gig.date, 'date');
    let endDateMs: number | undefined;
    if (gig.endDate !== undefined) {
      endDateMs = this.parseRequiredDateMs(gig.endDate, 'endDate');
    }

    const id = this.gigCandidateRepository.createId();
    const posterPublicId = `gc-${id}`;

    const explicitPosterUrl = (gig.posterUrl ?? '').trim() || undefined;
    const defaultPosterUrl =
      (process.env.DEFAULT_GIG_POSTER_URL ?? '').trim() || undefined;
    const posterUrl =
      explicitPosterUrl ?? (posterFile ? undefined : defaultPosterUrl);

    const poster = await this.gigPosterService.upload({
      url: posterUrl,
      file: posterFile,
      context: {
        date: gig.date,
        city: gig.city,
        country: gig.country,
        publicId: posterPublicId,
      },
    });

    return this.gigCandidateRepository.createGigCandidate({
      gigCandidateId: id,
      status: GigCandidateStatus.New,
      source: {
        type: 'user',
        userId: user.userId,
        origin: { type: 'form' },
      },
      gigDraft: {
        title: gig.title,
        date: dateMs,
        ...(endDateMs !== undefined ? { endDate: endDateMs } : {}),
        city: gig.city,
        country: gig.country,
        ...(gig.venue !== undefined ? { venue: gig.venue } : {}),
        ...(gig.ticketsUrl !== undefined ? { ticketsUrl: gig.ticketsUrl } : {}),
        ...(poster !== undefined ? { poster } : {}),
      },
    });
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

    this.assertExpectedVersionMatches(
      gigCandidate,
      params.expectedVersion,
      GigCandidateCommand.Approve,
    );
    const gigData = validateGigCandidateDraftForApproval(gigCandidate.gigDraft);
    const gigId = transaction.createGigId();
    const publicId = await this.generateUniqueGigPublicId(
      gigData.title,
      gigData.date,
      transaction,
    );
    const source = projectGigCandidateSource(gigCandidate.source);
    const approvedAt = new Date();
    const approvedGigCandidate = await transaction.approveGigCandidate({
      ...params,
      gigId,
      approvedAt,
      gigDraft: gigData,
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
    });
    return { gig, gigCandidate: approvedGigCandidate, isNewApproval: true };
  }

  private async generateUniqueGigPublicId(
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

  private async runApprovalPostCommitActions(
    result: GigCandidateApprovalTransactionResult,
  ): Promise<void> {
    const { gig, gigCandidate } = result;
    try {
      await this.feedRevalidateService.revalidateFeedOrThrow({
        country: gig.country,
        city: gig.city,
      });
    } catch (e) {
      this.logApprovalIntegrationFailure(
        'revalidateFeed',
        gigCandidate.id,
        gig.id,
        e,
      );
    }

    try {
      await this.calendarService.addEvent(
        this.gigService.gigToCalendarPayload(gig),
      );
    } catch (e) {
      this.logApprovalIntegrationFailure(
        'addCalendarEvent',
        gigCandidate.id,
        gig.id,
        e,
      );
    }

    await this.sendGigCandidateFeedbackBestEffort(gigCandidate, {
      kind: 'acceptedWithPublicLink',
      publicId: gig.publicId,
      title: gig.title,
    });

    const moderationPost = this.findTelegramPost(
      gigCandidate,
      PostType.Moderation,
    );
    if (!moderationPost) {
      this.logger.warn(
        `No moderation post linked after approval for gigCandidateId=${gigCandidate.id} gigId=${gig.id}`,
      );
      return;
    }
    try {
      await this.telegramService.updateGigModerationPost({
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
      this.logApprovalIntegrationFailure(
        'updateGigModerationPost',
        gigCandidate.id,
        gig.id,
        e,
      );
    }
  }

  private logApprovalIntegrationFailure(
    operation: string,
    gigCandidateId: string,
    gigId: string,
    e: unknown,
  ): void {
    this.logger.warn(
      `${operation} failed after approval for gigCandidateId=${gigCandidateId} gigId=${gigId}: ${this.formatErrorMessage(e)}`,
    );
  }

  private parseAndValidateCreateBody(
    raw: V1CreateGigCandidateRequestBody['gig'],
  ): ParsedCreateGigCandidateFields {
    const title = this.requireNonEmptyString(raw.title, 'title');
    if (title.length > GIG_TITLE_MAX_LENGTH) {
      throw new BadRequestException(
        `title must contain at most ${GIG_TITLE_MAX_LENGTH} characters`,
      );
    }
    const city = this.requireNonEmptyString(raw.city, 'city');
    const country = this.requireNonEmptyString(
      raw.country,
      'country',
    ).toUpperCase();
    const date = this.requireNonEmptyString(raw.date, 'date');
    if (!DATE_YMD_RE.test(date)) {
      throw new BadRequestException('date must be in YYYY-MM-DD format');
    }

    const endDate = this.optionalNonEmptyString(raw.endDate);
    if (endDate !== undefined && !DATE_YMD_RE.test(endDate)) {
      throw new BadRequestException('endDate must be in YYYY-MM-DD format');
    }

    if (endDate !== undefined && endDate < date) {
      throw new BadRequestException('endDate must be on or after date');
    }

    const venue = this.optionalNonEmptyString(raw.venue);
    const ticketsUrl = this.optionalNonEmptyString(raw.ticketsUrl);
    if (ticketsUrl !== undefined) {
      try {
        new URL(ticketsUrl);
      } catch {
        throw new BadRequestException('ticketsUrl must be a valid URL');
      }
    }

    const posterUrl = this.optionalNonEmptyString(raw.posterUrl);
    // TODO: Allow posterUrl again after external downloads reject private-network targets,
    //  validate every redirect, and enforce a response-size limit.
    if (posterUrl !== undefined) {
      throw new BadRequestException('posterUrl is temporarily disabled');
    }

    return {
      title,
      date,
      ...(endDate !== undefined ? { endDate } : {}),
      city,
      country,
      ...(venue !== undefined ? { venue } : {}),
      ...(ticketsUrl !== undefined ? { ticketsUrl } : {}),
      ...(posterUrl !== undefined ? { posterUrl } : {}),
    };
  }

  private requireNonEmptyString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new BadRequestException(`${field} is required`);
    }
    return value.trim();
  }

  private optionalNonEmptyString(value: unknown): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException('Expected a string value');
    }
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }

  private parseRequiredDateMs(ymd: string, field: string): number {
    const parsed = new Date(`${ymd}T00:00:00.000Z`);
    const ms = parsed.getTime();
    if (!Number.isFinite(ms) || parsed.toISOString().slice(0, 10) !== ymd) {
      throw new BadRequestException(`${field} must be a valid date`);
    }
    return ms;
  }

  private async prepareGigCandidateDraftPoster(
    params: PrepareGigCandidateDraftPosterParams,
  ): Promise<Partial<GigCandidate['gigDraft']>> {
    const gigDraft = { ...params.gigDraft };
    delete gigDraft.poster;

    const explicitPosterUrl = params.posterUrl?.trim() || undefined;
    const defaultPosterUrl = params.shouldUseDefaultPoster
      ? process.env.DEFAULT_GIG_POSTER_URL?.trim() || undefined
      : undefined;
    const posterUrl =
      explicitPosterUrl ?? (params.posterFile ? undefined : defaultPosterUrl);
    const poster =
      params.posterFile || posterUrl
        ? await this.gigPosterService.upload({
            url: posterUrl,
            file: params.posterFile,
            context: {
              date: gigDraft.date ?? new Date(),
              city: gigDraft.city ?? 'unknown',
              country: gigDraft.country ?? 'unknown',
              publicId: `gc-${params.gigCandidateId}`,
            },
          })
        : params.existingPoster;

    return {
      ...gigDraft,
      ...(poster !== undefined ? { poster } : {}),
    };
  }

  private async ensureGigCandidateModerationPostBestEffort(
    gigCandidate: GigCandidate,
  ): Promise<GigCandidate> {
    if (this.findTelegramPost(gigCandidate, PostType.Moderation)) {
      return gigCandidate;
    }

    let telegramModerationPost: TGMessage | undefined;
    try {
      telegramModerationPost =
        await this.telegramService.sendGigCandidateModerationPost(gigCandidate);
    } catch (e) {
      this.logTelegramFailure(
        'sendGigCandidateModerationPost',
        gigCandidate.id,
        e,
      );
      return gigCandidate;
    }

    const stored = await this.storeGigCandidateTelegramPostBestEffort({
      gigCandidate,
      postType: PostType.Moderation,
      telegramMessage: telegramModerationPost,
    });
    return stored ?? gigCandidate;
  }

  private async storeGigCandidateTelegramPostBestEffort(
    params: StoreGigCandidateTelegramPostParams,
  ): Promise<GigCandidate | null> {
    const { gigCandidate, postType, telegramMessage } = params;
    if (!telegramMessage) {
      this.logger.warn(
        `Telegram ${postType} send returned no message for gigCandidateId=${gigCandidate.id}`,
      );
      return null;
    }

    const chatId = telegramMessage.sender_chat?.id ?? telegramMessage.chat?.id;
    const messageId = telegramMessage.message_id;
    if (chatId === undefined || messageId === undefined) {
      this.logger.error(
        `Telegram ${postType} message reference is incomplete for gigCandidateId=${gigCandidate.id}`,
      );
      return null;
    }
    const biggestTelegramPhotoFileId = getBiggestTgPhotoFileId(
      telegramMessage.photo,
    );

    try {
      const updated =
        await this.gigCandidateRepository.appendGigCandidatePostIfAbsent({
          gigCandidateId: gigCandidate.id,
          expectedVersion: gigCandidate.version,
          post: {
            id: messageId,
            chatId,
            ...(biggestTelegramPhotoFileId !== undefined
              ? {
                  fileId: biggestTelegramPhotoFileId,
                }
              : {}),
            to: Messenger.Telegram,
            type: postType,
            date: telegramMessage.date * 1_000, // Telegram date is Unix seconds; post date is Unix ms
          },
        });
      if (updated) {
        return updated;
      }

      const latest = await this.getByIdOrThrow(gigCandidate.id);
      if (this.findTelegramPost(latest, postType)) {
        return latest;
      }

      this.logger.error(
        `Telegram ${postType} reference was not stored for gigCandidateId=${gigCandidate.id} expectedVersion=${gigCandidate.version}`,
      );
      return latest;
    } catch (e) {
      this.logger.error(
        `Persisting Telegram ${postType} reference failed for gigCandidateId=${gigCandidate.id}: ${this.formatErrorMessage(e)}`,
      );
      return null;
    }
  }

  private async updateGigCandidateIntakePostAfterModerationBestEffort(
    gigCandidate: GigCandidate,
  ): Promise<void> {
    const intakePost = this.findTelegramPost(gigCandidate, PostType.Intake);
    const moderationPost = this.findTelegramPost(
      gigCandidate,
      PostType.Moderation,
    );
    if (!intakePost || !moderationPost) {
      return;
    }

    try {
      await this.telegramService.updateGigCandidateIntakePostAfterModeration({
        gigCandidate,
        intakePost,
        moderationPost,
      });
    } catch (e) {
      this.logTelegramFailure(
        'updateGigCandidateIntakePostAfterModeration',
        gigCandidate.id,
        e,
      );
    }
  }

  private async updateRejectedGigCandidatePostBestEffort(
    gigCandidate: GigCandidate,
    previousStatus: GigCandidateStatus,
  ): Promise<void> {
    let postType: PostType.Intake | PostType.Moderation;
    switch (previousStatus) {
      case GigCandidateStatus.New:
        postType = PostType.Intake;
        break;
      case GigCandidateStatus.Reviewing:
        postType = PostType.Moderation;
        break;
      default:
        return;
    }
    const post = this.findTelegramPost(gigCandidate, postType);
    if (!post) {
      return;
    }

    try {
      await this.telegramService.updateRejectedGigCandidatePost({
        gigCandidate,
        post,
      });
    } catch (e) {
      this.logTelegramFailure(
        'updateRejectedGigCandidatePost',
        gigCandidate.id,
        e,
      );
    }
  }

  private async sendGigCandidateFeedbackBestEffort(
    gigCandidate: GigCandidate,
    content: GigCandidateFeedbackMessageContent,
  ): Promise<void> {
    if (gigCandidate.source.type !== 'user') {
      return;
    }

    const shouldSendFeedbackToAdmins = envBool(
      'SHOULD_SEND_GIG_SUBMISSION_FEEDBACK_TO_ADMINS',
      false,
    );
    if (
      gigCandidate.source.origin.type === 'admin' &&
      !shouldSendFeedbackToAdmins
    ) {
      return;
    }

    try {
      const user = await this.userService.findActiveUserById(
        gigCandidate.source.userId,
      );
      if (!user) {
        this.logger.warn(
          `GigCandidate feedback skipped because no active User was found for gigCandidateId=${gigCandidate.id}`,
        );
        return;
      }
      if (user.roles.includes(UserRole.Admin) && !shouldSendFeedbackToAdmins) {
        return;
      }

      const telegramIdentities = user.identities.filter(
        (identity) =>
          identity.type === 'messenger' &&
          identity.messenger === Messenger.Telegram,
      );
      const telegramIdentity = telegramIdentities[0];
      if (!telegramIdentity) {
        this.logger.warn(
          `GigCandidate feedback skipped because no Telegram identity was found for gigCandidateId=${gigCandidate.id}`,
        );
        return;
      }
      if (telegramIdentities.length > 1) {
        this.logger.warn(
          `GigCandidate feedback skipped because multiple Telegram identities were found for gigCandidateId=${gigCandidate.id}`,
        );
        return;
      }

      await this.telegramService.sendGigCandidateFeedback({
        ...content,
        chatId: telegramIdentity.externalUserId,
      });
    } catch (e) {
      this.logTelegramFailure('sendGigCandidateFeedback', gigCandidate.id, e);
    }
  }

  private async sendGigCandidateSubmittedFeedbackBestEffort(
    gigCandidate: GigCandidate,
  ): Promise<void> {
    const title = gigCandidate.gigDraft.title?.trim();
    if (!title) {
      // TODO: add a title-less feedback template before raw Telegram chat submissions can be acknowledged without a prepared Gig title.
      this.logger.warn(
        `GigCandidate submitted feedback skipped because title is missing for gigCandidateId=${gigCandidate.id}`,
      );
      return;
    }

    await this.sendGigCandidateFeedbackBestEffort(gigCandidate, {
      kind: 'submitted',
      title,
    });
  }

  private async sendGigCandidateAcceptedForModerationFeedbackBestEffort(
    gigCandidate: GigCandidate,
  ): Promise<void> {
    const title = gigCandidate.gigDraft.title?.trim();
    if (!title) {
      // TODO: add a title-less feedback template before raw Telegram chat submissions can enter moderation without a prepared Gig title.
      this.logger.warn(
        `GigCandidate accepted-for-moderation feedback skipped because title is missing for gigCandidateId=${gigCandidate.id}`,
      );
      return;
    }

    await this.sendGigCandidateFeedbackBestEffort(gigCandidate, {
      kind: 'acceptedForModeration',
      title,
    });
  }

  private async sendGigCandidateRejectedFeedbackBestEffort(
    gigCandidate: GigCandidate,
  ): Promise<void> {
    const title = gigCandidate.gigDraft.title?.trim();
    if (!title) {
      this.logger.warn(
        `GigCandidate rejected feedback skipped because title is missing for gigCandidateId=${gigCandidate.id}`,
      );
      return;
    }

    await this.sendGigCandidateFeedbackBestEffort(gigCandidate, {
      kind: 'rejected',
      title,
    });
  }

  private findTelegramPost(
    gigCandidate: GigCandidate,
    postType: PostType.Intake | PostType.Moderation,
  ): GigCandidate['posts'][number] | undefined {
    return gigCandidate.posts.find(
      (post) => post.to === Messenger.Telegram && post.type === postType,
    );
  }

  private logTelegramFailure(
    operation: string,
    gigCandidateId: string,
    e: unknown,
  ): void {
    this.logger.warn(
      `${operation} failed for gigCandidateId=${gigCandidateId}: ${this.formatErrorMessage(e)}`,
    );
  }

  private formatErrorMessage(e: unknown): string {
    if (!isAxiosError(e)) {
      return e instanceof Error ? e.message : 'unknown error';
    }

    const parts = [e.message];
    if (e.response?.status !== undefined) {
      parts.push(`httpStatus=${e.response.status}`);
    }
    const responseData = e.response?.data;
    if (isRecord(responseData)) {
      if (typeof responseData.error_code === 'number') {
        parts.push(`telegramErrorCode=${responseData.error_code}`);
      }
      if (typeof responseData.description === 'string') {
        parts.push(`telegramDescription=${responseData.description}`);
      }
    }
    return parts.join('; ');
  }

  private assertExpectedVersionIsValid(
    gigCandidateId: string,
    expectedVersion: number,
    command: GigCandidateCommand,
  ): void {
    if (Number.isInteger(expectedVersion) && expectedVersion >= 0) {
      return;
    }

    throw new GigCandidateConflictError({
      gigCandidateId,
      command,
      reason: 'versionConflict',
      message: `Expected version for GigCandidate ${gigCandidateId} must be a non-negative integer.`,
    });
  }

  private assertExpectedVersionMatches(
    gigCandidate: GigCandidate,
    expectedVersion: number,
    command: GigCandidateCommand,
  ): void {
    if (gigCandidate.version === expectedVersion) {
      return;
    }

    throw new GigCandidateConflictError({
      gigCandidateId: gigCandidate.id,
      command,
      reason: 'versionConflict',
      message: `GigCandidate ${gigCandidate.id} version conflict: expected ${expectedVersion}, current ${gigCandidate.version}.`,
    });
  }

  private throwConditionalWriteConflict(
    gigCandidate: GigCandidate,
    expectedVersion: number,
    command: GigCandidateCommand,
  ): never {
    if (gigCandidate.version !== expectedVersion) {
      this.assertExpectedVersionMatches(gigCandidate, expectedVersion, command);
    }

    throw new GigCandidateConflictError({
      gigCandidateId: gigCandidate.id,
      command,
      reason: 'concurrentModification',
      message: `GigCandidate ${gigCandidate.id} changed concurrently during ${command}.`,
    });
  }
}

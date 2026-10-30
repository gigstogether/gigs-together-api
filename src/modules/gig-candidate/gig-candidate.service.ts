import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { User } from '../auth/types/user.types';
import { Messenger } from '@shared/types/messenger.enum';
import { TelegramGigCandidateService } from '../telegram/telegram-gig-candidate/telegram-gig-candidate.service';
import type { TelegramGigCandidatePostSendResult } from '../telegram/telegram-gig-candidate/telegram-gig-candidate.service.types';
import { mapPreparedGigPosterToTelegramInputFile } from '../telegram/utils/telegram-input-file.mapper';
import { AiService } from '../ai/ai.service';
import { GIG_TITLE_MAX_LENGTH } from '../gig/gig.constants';
import type { GigData } from '../gig/types/gig.types';
import { GigSourceType } from '../gig/types/gig-source-type.enum';
import { GigSourceUserOriginType } from '../gig/types/gig-source-user-origin-type.enum';
import { formatTelegramErrorMessage } from '../telegram/utils/telegram-error';
import { PostEditKind } from '../telegram/telegram-composer.service.types';
import { GIG_CANDIDATE_REPOSITORY } from './repositories/gig-candidate.repository';
import type {
  GigCandidateRepository,
  SendGigCandidateToModerationWithPosterParams,
} from './repositories/gig-candidate.repository';
import type { V1CreateGigCandidateRequestBody } from './types/requests/v1-create-gig-candidate-request';
import type { V1CreateGigCandidateResponseBody } from './types/requests/v1-create-gig-candidate-response';
import type {
  GigCandidate,
  GigCandidateSourceMessengerUser,
} from './types/gig-candidate.types';
import type {
  GigPosterFile,
  PreparedGigPosterFile,
} from '../gig/types/gig-poster.types';
import { PostType } from '@shared/types/post-type.enum';
import { GigCandidateStatus } from './types/gig-candidate-status.enum';
import type {
  AdminGigCandidateListSortBy,
  AdminGigCandidateListSortOrder,
} from './gig-candidate-list-sort';
import {
  GigCandidateCommand,
  GigCandidateConflictError,
  getGigCandidateTransitionPolicy,
} from './gig-candidate-state-machine';
import { GigCandidateFeedbackService } from './gig-candidate-feedback.service';
import { GigCandidatePosterService } from './gig-candidate-poster/gig-candidate-poster.service';

export interface FindGigCandidatesParams {
  status: GigCandidateStatus;
  limit: number;
  sortBy?: AdminGigCandidateListSortBy;
  sortOrder?: AdminGigCandidateListSortOrder;
}

export interface CreateAdminGigCandidateParams {
  userId: string;
  gigDraft: Partial<GigData>;
  posterUrl?: string;
  posterFile?: GigPosterFile;
}

export interface CreateMessengerGigCandidateParams {
  messenger: Messenger;
  chatId: number;
  messageId: number;
  originalText: string;
  userId?: string;
}

export interface UpdateAdminGigCandidateDraftParams {
  gigCandidateId: string;
  expectedVersion: number;
  gigDraft: Partial<GigData>;
  posterUrl?: string;
  posterFile?: GigPosterFile;
}

export interface LookupGigCandidateDraftParams {
  title: string;
  location: string;
}

export interface GigCandidateDraftLookupResult {
  title: string;
  date: string;
  endDate?: string;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  posterUrl?: string;
}

export interface SendGigCandidateToModerationParams {
  gigCandidateId: string;
  expectedVersion: number;
}

export interface RejectGigCandidateParams {
  gigCandidateId: string;
  expectedVersion: number;
  rejectedByUserId: string;
}

export interface UpdateGigCandidateDraftApplicationParams {
  gigCandidateId: string;
  expectedVersion: number;
  gigDraft: Partial<GigData>;
  posterFile?: PreparedGigPosterFile;
}

const DATE_YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

interface HandleGigCandidateSubmitParams {
  body: V1CreateGigCandidateRequestBody;
  user: User;
  posterFile: GigPosterFile | undefined;
}

interface CreatedGigCandidate {
  gigCandidate: GigCandidate;
  posterFile?: PreparedGigPosterFile;
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
  telegramPost: TelegramGigCandidatePostSendResult | undefined;
}

@Injectable()
export class GigCandidateService {
  constructor(
    @Inject(GIG_CANDIDATE_REPOSITORY)
    private readonly gigCandidateRepository: GigCandidateRepository,
    private readonly gigCandidatePosterService: GigCandidatePosterService,
    private readonly telegramGigCandidateService: TelegramGigCandidateService,
    private readonly aiService: AiService,
    private readonly gigCandidateFeedbackService: GigCandidateFeedbackService,
  ) {}

  private readonly logger = new Logger(GigCandidateService.name);

  async handleSubmit(
    params: HandleGigCandidateSubmitParams,
  ): Promise<V1CreateGigCandidateResponseBody> {
    const created = await this.createGigCandidate(params);
    const saved = created.gigCandidate;
    const telegramPosterFile = mapPreparedGigPosterToTelegramInputFile(
      created.posterFile,
    );

    let telegramIntakePost: TelegramGigCandidatePostSendResult | undefined;
    try {
      telegramIntakePost =
        await this.telegramGigCandidateService.sendIntakePost(
          saved,
          telegramPosterFile,
        );
    } catch (e) {
      this.logTelegramFailure('sendGigCandidateIntakePost', saved.id, e);
    }

    await this.storeGigCandidateTelegramPostBestEffort({
      gigCandidate: saved,
      postType: PostType.Intake,
      telegramPost: telegramIntakePost,
    });
    await this.gigCandidateFeedbackService.sendBestEffort(saved, {
      kind: 'submitted',
      subject: saved.gigDraft.title,
    });

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

  createMessengerGigCandidate(
    params: CreateMessengerGigCandidateParams,
  ): Promise<GigCandidate> {
    if (params.messenger !== Messenger.Telegram) {
      throw new BadRequestException('messenger is invalid');
    }
    if (!Number.isSafeInteger(params.chatId) || params.chatId === 0) {
      throw new BadRequestException('chatId must be a non-zero safe integer');
    }
    if (!Number.isSafeInteger(params.messageId) || params.messageId <= 0) {
      throw new BadRequestException(
        'messageId must be a positive safe integer',
      );
    }
    if (params.originalText.trim() === '') {
      throw new BadRequestException('originalText is required');
    }

    const source: GigCandidateSourceMessengerUser = {
      type: GigSourceType.User,
      origin: {
        type: GigSourceUserOriginType.Messenger,
        messenger: params.messenger,
        message: {
          chatId: params.chatId,
          messageId: params.messageId,
        },
      },
      originalText: params.originalText,
    };
    if (params.userId !== undefined) {
      source.userId = params.userId;
    }

    return this.gigCandidateRepository.createGigCandidate({
      gigCandidateId: this.gigCandidateRepository.createId(),
      status: GigCandidateStatus.New,
      source,
      // TODO: This is temporary while suggestions come from a single city chat.
      //  Derive this location from the source chat when multi-city chats are supported.
      gigDraft: {
        city: 'Barcelona',
        country: 'ES',
      },
    });
  }

  async submitMessengerGigCandidate(
    params: CreateMessengerGigCandidateParams,
  ): Promise<GigCandidate> {
    const saved = await this.createMessengerGigCandidate(params);

    let telegramIntakePost: TelegramGigCandidatePostSendResult | undefined;
    try {
      telegramIntakePost =
        await this.telegramGigCandidateService.sendIntakePost(saved);
    } catch (e) {
      this.logTelegramFailure('sendGigCandidateIntakePost', saved.id, e);
    }

    const withIntakePost = await this.storeGigCandidateTelegramPostBestEffort({
      gigCandidate: saved,
      postType: PostType.Intake,
      telegramPost: telegramIntakePost,
    });
    return withIntakePost ?? saved;
  }

  async createAdminGigCandidate(
    params: CreateAdminGigCandidateParams,
  ): Promise<GigCandidate> {
    const gigCandidateId = this.gigCandidateRepository.createId();
    const preparedPoster =
      await this.gigCandidatePosterService.prepareDraftPoster({
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
        type: GigSourceType.User,
        userId: params.userId,
        origin: { type: GigSourceUserOriginType.Admin },
      },
      gigDraft: preparedPoster.gigDraft,
    });

    const withModerationPost =
      await this.ensureGigCandidateModerationPostBestEffort(
        saved,
        preparedPoster.posterFile,
      );
    await this.gigCandidateFeedbackService.sendBestEffort(withModerationPost, {
      kind: 'acceptedForModeration',
      subject: withModerationPost.gigDraft.title,
    });
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

    const preparedPoster =
      await this.gigCandidatePosterService.prepareDraftPoster({
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
      gigDraft: preparedPoster.gigDraft,
      posterFile: preparedPoster.posterFile,
    });
  }

  async lookupGigCandidateDraft(
    params: LookupGigCandidateDraftParams,
  ): Promise<GigCandidateDraftLookupResult | null> {
    const gigDraft = await this.aiService.lookupGig({
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
    let moderationPosterFile: PreparedGigPosterFile | undefined;

    if (!policy.isIdempotent) {
      this.assertExpectedVersionMatches(
        currentGigCandidate,
        params.expectedVersion,
        command,
      );

      const preparedPoster =
        await this.gigCandidatePosterService.prepareDraftPoster({
          gigCandidateId: currentGigCandidate.id,
          gigDraft: currentGigCandidate.gigDraft,
          existingPoster: currentGigCandidate.gigDraft.poster,
          shouldUseDefaultPoster: true,
        });
      const moderationPoster = preparedPoster.gigDraft.poster;
      if (moderationPoster === undefined) {
        throw new InternalServerErrorException(
          `Cannot send GigCandidate ${currentGigCandidate.id} to moderation without a poster.`,
        );
      }
      const repositoryParams: SendGigCandidateToModerationWithPosterParams = {
        gigCandidateId: params.gigCandidateId,
        expectedVersion: params.expectedVersion,
        poster: moderationPoster,
      };

      const updated =
        await this.gigCandidateRepository.sendGigCandidateToModeration(
          repositoryParams,
        );
      if (updated) {
        reviewingGigCandidate = updated;
        didTransition = true;
        moderationPosterFile = preparedPoster.posterFile;
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
        moderationPosterFile,
      );
    await this.updateGigCandidateIntakePostAfterModerationBestEffort(
      withModerationPost,
    );
    if (didTransition) {
      await this.gigCandidateFeedbackService.sendBestEffort(
        withModerationPost,
        {
          kind: 'acceptedForModeration',
          subject: withModerationPost.gigDraft.title,
        },
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
      await this.gigCandidateFeedbackService.sendBestEffort(updated, {
        kind: 'rejected',
        subject: updated.gigDraft.title,
      });
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

  async updateGigCandidateDraft(
    params: UpdateGigCandidateDraftApplicationParams,
  ): Promise<GigCandidate> {
    const { posterFile, ...repositoryParams } = params;
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
      await this.gigCandidateRepository.updateGigCandidateDraft(
        repositoryParams,
      );
    if (updated) {
      return this.updateGigCandidateModerationPostBestEffort(
        updated,
        posterFile,
      );
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
  ): Promise<CreatedGigCandidate> {
    const { body, user, posterFile } = params;
    const gig = this.parseAndValidateCreateBody(body.gig);

    const dateMs = this.parseRequiredDateMs(gig.date, 'date');
    let endDateMs: number | undefined;
    if (gig.endDate !== undefined) {
      endDateMs = this.parseRequiredDateMs(gig.endDate, 'endDate');
    }

    const id = this.gigCandidateRepository.createId();
    const gigDraft: Partial<GigCandidate['gigDraft']> = {
      title: gig.title,
      date: dateMs,
      city: gig.city,
      country: gig.country,
    };
    if (endDateMs !== undefined) {
      gigDraft.endDate = endDateMs;
    }
    if (gig.venue !== undefined) {
      gigDraft.venue = gig.venue;
    }
    if (gig.ticketsUrl !== undefined) {
      gigDraft.ticketsUrl = gig.ticketsUrl;
    }

    const preparedPoster =
      await this.gigCandidatePosterService.prepareDraftPoster({
        gigCandidateId: id,
        gigDraft,
        posterUrl: gig.posterUrl,
        posterFile,
        shouldUseDefaultPoster: false,
      });

    const gigCandidate = await this.gigCandidateRepository.createGigCandidate({
      gigCandidateId: id,
      status: GigCandidateStatus.New,
      source: {
        type: GigSourceType.User,
        userId: user.userId,
        origin: { type: GigSourceUserOriginType.Form },
      },
      gigDraft: preparedPoster.gigDraft,
    });

    const result: CreatedGigCandidate = { gigCandidate };
    if (preparedPoster.posterFile !== undefined) {
      result.posterFile = preparedPoster.posterFile;
    }
    return result;
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

  private async ensureGigCandidateModerationPostBestEffort(
    gigCandidate: GigCandidate,
    posterFile?: PreparedGigPosterFile,
  ): Promise<GigCandidate> {
    if (this.findTelegramPost(gigCandidate, PostType.Moderation)) {
      return gigCandidate;
    }

    let telegramModerationPost: TelegramGigCandidatePostSendResult | undefined;
    try {
      const telegramPosterFile =
        mapPreparedGigPosterToTelegramInputFile(posterFile);
      telegramModerationPost =
        await this.telegramGigCandidateService.sendModerationPost(
          gigCandidate,
          telegramPosterFile,
        );
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
      telegramPost: telegramModerationPost,
    });
    return stored ?? gigCandidate;
  }

  private async storeGigCandidateTelegramPostBestEffort(
    params: StoreGigCandidateTelegramPostParams,
  ): Promise<GigCandidate | null> {
    const { gigCandidate, postType, telegramPost } = params;
    if (!telegramPost) {
      this.logger.warn(
        `Telegram ${postType} send returned no message for gigCandidateId=${gigCandidate.id}`,
      );
      return null;
    }

    try {
      const postDate = telegramPost.sentAtSeconds * 1_000; // Telegram date is Unix seconds; post date is Unix ms
      let post: GigCandidate['posts'][number];
      if (telegramPost.fileId !== undefined) {
        post = {
          id: telegramPost.messageId,
          chatId: telegramPost.chatId,
          fileId: telegramPost.fileId,
          to: Messenger.Telegram,
          type: postType,
          date: postDate,
        };
      } else {
        if (postType !== PostType.Intake) {
          this.logger.error(
            `Telegram ${postType} post has no fileId for gigCandidateId=${gigCandidate.id}`,
          );
          return null;
        }
        post = {
          id: telegramPost.messageId,
          chatId: telegramPost.chatId,
          to: Messenger.Telegram,
          type: PostType.Intake,
          date: postDate,
        };
      }

      const updated =
        await this.gigCandidateRepository.appendGigCandidatePostIfAbsent({
          gigCandidateId: gigCandidate.id,
          expectedVersion: gigCandidate.version,
          post,
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
        `Persisting Telegram ${postType} reference failed for gigCandidateId=${gigCandidate.id}: ${formatTelegramErrorMessage(e)}`,
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
      await this.telegramGigCandidateService.updateIntakePostAfterModeration({
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
      await this.telegramGigCandidateService.updateRejectedPost({
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

  private async updateGigCandidateModerationPostBestEffort(
    gigCandidate: GigCandidate,
    posterFile?: PreparedGigPosterFile,
  ): Promise<GigCandidate> {
    const moderationPost = this.findTelegramPost(
      gigCandidate,
      PostType.Moderation,
    );
    if (!moderationPost) {
      return gigCandidate;
    }

    try {
      const isMediaUpdateRequired = posterFile !== undefined;
      const telegramPosterFile =
        mapPreparedGigPosterToTelegramInputFile(posterFile);
      const edited = await this.telegramGigCandidateService.editPost({
        gigCandidate,
        post: moderationPost,
        isMediaUpdateRequired,
        posterFile: telegramPosterFile,
      });
      if (!isMediaUpdateRequired) {
        return gigCandidate;
      }
      if (edited.kind !== PostEditKind.Media) {
        this.logger.warn(
          `Telegram moderation media was not updated for gigCandidateId=${gigCandidate.id}`,
        );
        return gigCandidate;
      }
      if (edited.fileId === undefined) {
        this.logger.error(
          `Telegram moderation media update returned no photo fileId for gigCandidateId=${gigCandidate.id}`,
        );
        return gigCandidate;
      }

      const updated =
        await this.gigCandidateRepository.updateGigCandidateModerationPostFileId(
          {
            gigCandidateId: gigCandidate.id,
            expectedVersion: gigCandidate.version,
            messageId: moderationPost.id,
            chatId: moderationPost.chatId,
            fileId: edited.fileId,
          },
        );
      if (updated) {
        return updated;
      }

      this.logger.error(
        `Telegram moderation fileId was not stored for gigCandidateId=${gigCandidate.id} expectedVersion=${gigCandidate.version}`,
      );
    } catch (e) {
      this.logTelegramFailure('editGigCandidatePost', gigCandidate.id, e);
    }
    return gigCandidate;
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
      `${operation} failed for gigCandidateId=${gigCandidateId}: ${formatTelegramErrorMessage(e)}`,
    );
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

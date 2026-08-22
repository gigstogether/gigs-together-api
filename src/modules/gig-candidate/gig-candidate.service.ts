import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { User } from '../auth/types/user.types';
import { GigPosterService } from '../gig/gig.poster.service';
import { Messenger } from '../../shared/types/messenger.enum';
import { TelegramService } from '../telegram/telegram.service';
import { getBiggestTgPhotoFileId } from '../telegram/utils/photo';
import type { TGMessage } from '../telegram/types/message.types';
import { GIG_CANDIDATE_REPOSITORY } from './repositories/gig-candidate.repository';
import type { GigCandidateRepository } from './repositories/gig-candidate.repository';
import type { V1CreateGigCandidateRequestBody } from './types/requests/v1-create-gig-candidate-request';
import type { V1CreateGigCandidateResponseBody } from './types/requests/v1-create-gig-candidate-response';
import type {
  MarkGigCandidateAcceptedParams,
  MarkGigCandidateRejectedParams,
  GigCandidateRecord,
  FindGigCandidatesParams,
} from './types/gig-candidate.types';
import { GigCandidatePostType } from './types/gig-candidate-post-type.enum';
import { GigCandidateSource } from './types/gig-candidate-source.enum';

const DATE_YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

interface HandleGigCandidateSubmitParams {
  body: V1CreateGigCandidateRequestBody;
  user: User;
  posterFile: Express.Multer.File | undefined;
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

@Injectable()
export class GigCandidateService {
  constructor(
    @Inject(GIG_CANDIDATE_REPOSITORY)
    private readonly gigCandidateRepository: GigCandidateRepository,
    private readonly gigPosterService: GigPosterService,
    private readonly telegramService: TelegramService,
  ) {}

  private readonly logger = new Logger(GigCandidateService.name);

  async handleSubmit(
    params: HandleGigCandidateSubmitParams,
  ): Promise<V1CreateGigCandidateResponseBody> {
    const saved = await this.createGigCandidate(params);

    let tgSuggestionPost: TGMessage | undefined;
    try {
      tgSuggestionPost =
        await this.telegramService.sendGigCandidateToSuggestion(saved);
    } catch (e) {
      this.logger.warn(
        `sendGigCandidateToSuggestion failed: ${JSON.stringify(
          e instanceof Error ? e.message : e,
        )}`,
      );
      tgSuggestionPost = undefined;
    }

    const biggestTgPhotoFileId = getBiggestTgPhotoFileId(
      tgSuggestionPost?.photo,
    );
    const suggestionChatId =
      tgSuggestionPost?.sender_chat?.id ?? tgSuggestionPost?.chat?.id;
    const suggestionMessageId = tgSuggestionPost?.message_id;

    if (tgSuggestionPost && suggestionChatId && suggestionMessageId) {
      try {
        await this.gigCandidateRepository.appendSuggestionPost({
          id: saved.id,
          post: {
            id: suggestionMessageId,
            chatId: suggestionChatId,
            ...(biggestTgPhotoFileId !== undefined
              ? { fileId: biggestTgPhotoFileId }
              : {}),
            to: Messenger.Telegram,
            type: GigCandidatePostType.Suggestion,
            date: tgSuggestionPost.date * 1_000, // Telegram date is Unix seconds; post date is Unix ms
          },
        });
      } catch (e) {
        this.logger.error(
          'appendSuggestionPost after suggestion channel post failed',
          e instanceof Error ? e.stack : undefined,
        );
      }
    }

    return { id: saved.id };
  }

  async getByIdOrThrow(id: string): Promise<GigCandidateRecord> {
    const record = await this.gigCandidateRepository.findById(id);
    if (!record) {
      throw new NotFoundException(`GigCandidate with ID ${id} not found`);
    }
    return record;
  }

  findById(id: string): Promise<GigCandidateRecord | null> {
    return this.gigCandidateRepository.findById(id);
  }

  findMany(params: FindGigCandidatesParams): Promise<GigCandidateRecord[]> {
    return this.gigCandidateRepository.findMany(params);
  }

  async markAccepted(
    params: MarkGigCandidateAcceptedParams,
  ): Promise<GigCandidateRecord> {
    const updated = await this.gigCandidateRepository.markAccepted(params);
    if (!updated) {
      throw new NotFoundException(
        `GigCandidate with ID ${params.id} not found`,
      );
    }
    return updated;
  }

  async markRejected(
    params: MarkGigCandidateRejectedParams,
  ): Promise<GigCandidateRecord> {
    const updated = await this.gigCandidateRepository.markRejected(params);
    if (!updated) {
      throw new NotFoundException(
        `GigCandidate with ID ${params.id} not found`,
      );
    }
    return updated;
  }

  private async createGigCandidate(
    params: HandleGigCandidateSubmitParams,
  ): Promise<GigCandidateRecord> {
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

    const suggestedBy = {
      userId: user.tgUser.id,
      username: user.tgUser.username,
      name: [user.tgUser.first_name, user.tgUser.last_name]
        .filter(Boolean)
        .join(' '),
    };

    return this.gigCandidateRepository.create({
      id,
      source: GigCandidateSource.User,
      title: gig.title,
      date: dateMs,
      ...(endDateMs !== undefined ? { endDate: endDateMs } : {}),
      city: gig.city,
      country: gig.country,
      ...(gig.venue !== undefined ? { venue: gig.venue } : {}),
      ...(gig.ticketsUrl !== undefined ? { ticketsUrl: gig.ticketsUrl } : {}),
      ...(poster !== undefined ? { poster } : {}),
      suggestedBy,
    });
  }

  private parseAndValidateCreateBody(
    raw: V1CreateGigCandidateRequestBody['gig'],
  ): ParsedCreateGigCandidateFields {
    const title = this.requireNonEmptyString(raw.title, 'title');
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
}

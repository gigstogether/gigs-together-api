import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  GigCalendarSource,
  GigFormInput,
  GigId,
  GigPost,
  GigPoster,
  PlainGig,
} from './types/gig.types';
import { envBool } from '../../shared/utils/env';
import type { CalendarishEvent } from '../calendar/calendar.service';
import { GigPosterService } from './gig.poster.service';
import { TelegramService } from '../telegram/telegram.service';
import type { EditGigPostsParams } from '../telegram/telegram.service';
import { BucketService } from '../bucket/bucket.service';
import { PostType } from '../../shared/types/post-type.enum';
import { Messenger } from '../../shared/types/messenger.enum';
import {
  AdminGigListSortBy,
  AdminGigListSortOrder,
} from './types/admin-gig-list-sort.types';
import { GIG_REPOSITORY } from './repositories/gig.repository';
import type {
  FindGigsParams as RepositoryFindGigsParams,
  GigRepository,
} from './repositories/gig.repository';
import { FeedRevalidateService } from './feed-revalidate.service';
import type { UpdateGigModerationPostPayload } from '../telegram/types/telegram.service.types';
import { formatTelegramErrorMessage } from '../telegram/telegram-error';

interface ResolvePublicPostUrl {
  postId?: number;
  chatId?: number;
}

export interface UpdateGigByPublicIdParams {
  publicId: string;
  expectedVersion: number;
  gig: GigFormInput;
  posterFile: Express.Multer.File | undefined;
}

export interface UpdateGigVisibilityByPublicIdParams {
  publicId: string;
  expectedVersion: number;
  isVisible: boolean;
}

export interface UpdateGigByPublicIdResult {
  publicId: string;
}

export interface UpdateGigVisibilityByPublicIdResult {
  publicId: string;
  version: number;
  isVisible: boolean;
}

export interface GigTelegramPostRef {
  chatId: number;
  messageId: number;
}

export interface SetGigVisibilityParams {
  gigId: GigId;
  expectedVersion: number;
  isVisible: boolean;
  moderationPost: GigTelegramPostRef;
}

interface ChangeGigVisibilityParams extends UpdateGigVisibilityByPublicIdParams {
  moderationPost?: GigTelegramPostRef;
}

interface UpdateGigModerationPostBestEffortParams {
  gig: PlainGig;
  moderationPost?: GigTelegramPostRef;
}

interface CreateGigMainPostBaseParams {
  moderationPost?: GigTelegramPostRef;
  expectedVersion: number;
}

export interface CreateGigMainPostByIdParams extends CreateGigMainPostBaseParams {
  gigId: GigId;
  publicId?: never;
}

export interface CreateGigMainPostByPublicIdParams extends CreateGigMainPostBaseParams {
  publicId: string;
  gigId?: never;
}

export type CreateGigMainPostParams =
  CreateGigMainPostByIdParams | CreateGigMainPostByPublicIdParams;

interface GigTelegramPostInput {
  id: number;
  chatId: number;
  date: number;
  fileId?: string;
}

interface AppendGigMainPostParams {
  gigId: GigId;
  expectedVersion: number;
  post: GigTelegramPostInput;
}

interface UpdateGigTelegramPostFileIdParams {
  gig: PlainGig;
  post: GigPost;
  fileId: string;
}

export interface GenerateUniquePublicIdPayload {
  title: string;
  yyyyMmDd: string;
  excludeGigId?: string;
  isPublicIdTaken?: (publicId: string) => Promise<boolean>;
}

export interface GetGigsParams {
  readonly limit: number;
  readonly sortBy?: AdminGigListSortBy;
  readonly sortOrder?: AdminGigListSortOrder;
}

@Injectable()
export class GigService {
  private static readonly MAX_PUBLIC_ID_LEN = 64;
  private static readonly MAX_LIMIT = 100;

  constructor(
    @Inject(GIG_REPOSITORY)
    private readonly gigRepository: GigRepository,
    private readonly gigPosterService: GigPosterService,
    private readonly bucketService: BucketService,
    private readonly telegramService: TelegramService,
    private readonly feedRevalidateService: FeedRevalidateService,
  ) {}

  private readonly logger = new Logger(GigService.name);

  normalizeAndValidatePublicId(publicId: string): string {
    const id = (publicId ?? '').trim();
    if (!id) {
      throw new BadRequestException('publicId is required');
    }
    if (id.length > GigService.MAX_PUBLIC_ID_LEN) {
      throw new BadRequestException(
        `publicId is too long (max ${GigService.MAX_PUBLIC_ID_LEN})`,
      );
    }
    // Keep it strict and URL/anchor safe (also matches our generator).
    if (!/^[a-z0-9-]+$/.test(id)) {
      throw new BadRequestException('publicId has invalid characters');
    }
    return id;
  }

  private validateExpectedVersion(expectedVersion: number): void {
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      throw new BadRequestException(
        'expectedVersion must be a non-negative integer',
      );
    }
  }

  private validateGigId(gigId: string): void {
    if (!/^[a-f\d]{24}$/i.test(gigId)) {
      throw new BadRequestException(`Invalid MongoDB ID: ${gigId}`);
    }
  }

  private async throwGigVersionConflictOrNotFound(
    publicId: string,
  ): Promise<never> {
    const hasExistingGig = await this.gigRepository.existsByPublicId(publicId);
    if (!hasExistingGig) {
      throw new NotFoundException(`Gig with publicId "${publicId}" not found`);
    }

    throw new ConflictException(
      `Gig with publicId "${publicId}" has a newer version`,
    );
  }

  async generateUniquePublicId(
    input: GenerateUniquePublicIdPayload,
  ): Promise<string> {
    const slugifyTitle = (rawTitle: string): string => {
      const str0 = (rawTitle ?? '').trim().toLowerCase();
      const str1 = str0
        .normalize('NFKD')
        // Remove diacritics (ASCII-friendly)
        .replace(/[\u0300-\u036f]/g, '');

      // Replace common separators with spaces to avoid accidental concatenations.
      const str2 = str1.replace(/[&+]/g, ' ');

      // Keep only a-z0-9 and convert any other run to a hyphen.
      const str3 = str2
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      return str3 || 'gig';
    };
    const yyyyMmDd = String(input.yyyyMmDd ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) {
      throw new BadRequestException(
        'Invalid yyyyMmDd format (expected YYYY-MM-DD)',
      );
    }

    const buildCandidate = (n: number): string => {
      const suffix = n === 0 ? '' : `-${n + 1}`;
      const reserved = 1 + yyyyMmDd.length + suffix.length; // "-" + date + suffix
      const maxSlugLen = Math.max(1, GigService.MAX_PUBLIC_ID_LEN - reserved);

      let slug = slugifyTitle(input.title);
      if (slug.length > maxSlugLen) {
        slug = slug.slice(0, maxSlugLen).replace(/-+$/g, '');
      }
      if (!slug) slug = 'gig';

      const candidate = `${slug}-${yyyyMmDd}${suffix}`;
      // Safety guard (shouldn't happen, but keeps contract tight)
      return candidate.length > GigService.MAX_PUBLIC_ID_LEN
        ? candidate.slice(0, GigService.MAX_PUBLIC_ID_LEN).replace(/-+$/g, '')
        : candidate;
    };

    for (let n = 0; n < 50; n++) {
      const candidate = buildCandidate(n);
      const isTaken = input.isPublicIdTaken
        ? await input.isPublicIdTaken(candidate)
        : await this.gigRepository.isPublicIdTaken({
            publicId: candidate,
            ...(input.excludeGigId !== undefined
              ? { excludeGigId: input.excludeGigId }
              : {}),
          });
      if (!isTaken) return candidate;
    }

    // Extremely unlikely fallback: add a short random suffix.
    const rnd = Math.random().toString(36).slice(2, 8);
    // Ensure fallback respects MAX_PUBLIC_ID_LEN
    const prefixMax = Math.max(
      1,
      GigService.MAX_PUBLIC_ID_LEN - (1 + rnd.length),
    );
    const prefix = buildCandidate(0).slice(0, prefixMax).replace(/-+$/g, '');
    return `${prefix}-${rnd}`;
  }

  getGigCount(): Promise<number> {
    return this.gigRepository.countAll();
  }

  getVisibleGigCount(): Promise<number> {
    return this.gigRepository.countVisible();
  }

  // TODO: limit|infinite scroll
  getGigs(params: GetGigsParams): Promise<PlainGig[]> {
    const limit = Math.min(Math.max(1, params.limit), GigService.MAX_LIMIT);
    if (params.sortBy !== undefined) {
      const isSupportedSortBy =
        params.sortBy === AdminGigListSortBy.CreatedAt ||
        params.sortBy === AdminGigListSortBy.EventDate;
      if (!isSupportedSortBy) {
        throw new BadRequestException(
          `Unsupported admin gig list sortBy: ${params.sortBy}`,
        );
      }
    }

    const findGigsParams: RepositoryFindGigsParams = { limit };
    if (params.sortBy !== undefined) {
      findGigsParams.sortBy = params.sortBy;
    }
    if (params.sortOrder !== undefined) {
      findGigsParams.sortOrder = params.sortOrder;
    }

    return this.gigRepository.findMany(findGigsParams);
  }

  resolveGigPosterPublicUrl(poster: GigPoster | undefined): string | undefined {
    const externalFallbackEnabled = envBool(
      'EXTERNAL_POSTER_URL_FALLBACK_ENABLED',
      true,
    );

    return (
      (poster?.bucketPath
        ? this.bucketService.getPublicFileUrl(poster.bucketPath)
        : undefined) ??
      (externalFallbackEnabled ? poster?.externalUrl : undefined)
    );
  }

  async updateGigByPublicId(
    params: UpdateGigByPublicIdParams,
  ): Promise<UpdateGigByPublicIdResult> {
    let updatedGig = await this.updateGigStateByPublicId(params);
    const isMediaUpdateRequired = params.posterFile !== undefined;
    const telegramEditParams: EditGigPostsParams = {
      gig: updatedGig,
      isMediaUpdateRequired,
    };
    if (params.posterFile !== undefined) {
      telegramEditParams.posterFile = {
        buffer: params.posterFile.buffer,
        filename: params.posterFile.originalname,
        contentType: params.posterFile.mimetype,
      };
    }
    const telegramEditResult =
      await this.telegramService.editGigPostsBestEffort(telegramEditParams);

    if (isMediaUpdateRequired) {
      const moderationFileId = telegramEditResult.moderation?.result.fileId;
      if (
        telegramEditResult.moderation !== undefined &&
        moderationFileId !== undefined
      ) {
        updatedGig = await this.updateGigTelegramPostFileId({
          gig: updatedGig,
          post: telegramEditResult.moderation.post,
          fileId: moderationFileId,
        });
      }

      const mainFileId = telegramEditResult.main?.result.fileId;
      if (telegramEditResult.main !== undefined && mainFileId !== undefined) {
        updatedGig = await this.updateGigTelegramPostFileId({
          gig: updatedGig,
          post: telegramEditResult.main.post,
          fileId: mainFileId,
        });
      }
    }
    await this.revalidateGigFeed(updatedGig);

    return { publicId: updatedGig.publicId };
  }

  private async updateGigStateByPublicId(
    params: UpdateGigByPublicIdParams,
  ): Promise<PlainGig> {
    const { publicId, expectedVersion, gig, posterFile } = params;

    const id = this.normalizeAndValidatePublicId(publicId);
    this.validateExpectedVersion(expectedVersion);

    const dateMs = new Date(gig.date).getTime();

    const endDateMs =
      gig.endDate && gig.endDate !== gig.date
        ? new Date(gig.endDate).getTime()
        : undefined;

    const poster: GigPoster | undefined = await this.uploadPoster({
      url: gig.posterUrl,
      file: posterFile,
      context: {
        date: gig.date,
        city: gig.city,
        country: gig.country,
        publicId,
      },
    });

    const updated = await this.gigRepository.updateByPublicId({
      publicId: id,
      expectedVersion,
      title: gig.title,
      date: dateMs,
      ...(endDateMs !== undefined ? { endDate: endDateMs } : {}),
      city: gig.city,
      country: gig.country,
      venue: gig.venue,
      ticketsUrl: gig.ticketsUrl,
      ...(poster !== undefined ? { poster } : {}),
    });
    if (!updated) {
      return this.throwGigVersionConflictOrNotFound(id);
    }
    return updated;
  }

  async updateGigVisibilityByPublicId(
    params: UpdateGigVisibilityByPublicIdParams,
  ): Promise<UpdateGigVisibilityByPublicIdResult> {
    const updatedGig = await this.changeGigVisibility(params);

    return {
      publicId: updatedGig.publicId,
      version: updatedGig.version,
      isVisible: updatedGig.isVisible,
    };
  }

  private async changeGigVisibility(
    params: ChangeGigVisibilityParams,
  ): Promise<PlainGig> {
    const publicId = this.normalizeAndValidatePublicId(params.publicId);
    this.validateExpectedVersion(params.expectedVersion);

    const updated = await this.gigRepository.updateVisibility({
      publicId,
      expectedVersion: params.expectedVersion,
      isVisible: params.isVisible,
    });
    if (!updated) {
      return this.throwGigVersionConflictOrNotFound(publicId);
    }

    await this.updateGigModerationPostBestEffort({
      gig: updated,
      moderationPost: params.moderationPost,
    });
    await this.revalidateGigFeed(updated);

    return updated;
  }

  /** Full Gig form fields by public ID, including hidden Gigs. */
  async getGigByPublicId(publicId: string): Promise<PlainGig> {
    const id = this.normalizeAndValidatePublicId(publicId);
    const gig = await this.gigRepository.findByPublicId(id);
    if (!gig) {
      throw new NotFoundException(`Gig with publicId "${id}" not found`);
    }
    return gig;
  }

  async getGigById(gigId: GigId): Promise<PlainGig> {
    this.validateGigId(gigId);
    const gig = await this.gigRepository.findById(gigId);
    if (!gig) {
      throw new NotFoundException(`Gig with ID ${gigId} not found`);
    }
    return gig;
  }

  async getGigsByIds(gigIds: readonly GigId[]): Promise<PlainGig[]> {
    const uniqueGigIds = new Set<string>();
    for (const gigId of gigIds) {
      this.validateGigId(gigId);
      uniqueGigIds.add(gigId);
    }

    if (uniqueGigIds.size === 0) {
      return [];
    }

    const gigs = await this.gigRepository.findByIds([...uniqueGigIds]);
    const gigsById = new Map(gigs.map((gig) => [gig.id, gig]));
    const orderedGigs: PlainGig[] = [];
    const missingGigIds: string[] = [];
    for (const gigId of uniqueGigIds) {
      const gig = gigsById.get(gigId);
      if (gig) {
        orderedGigs.push(gig);
      } else {
        missingGigIds.push(gigId);
      }
    }
    if (missingGigIds.length > 0) {
      throw new NotFoundException(
        `Gigs with IDs ${missingGigIds.join(', ')} not found`,
      );
    }

    return orderedGigs;
  }

  async createGigMainPost(params: CreateGigMainPostParams): Promise<void> {
    const gig = await this.getGigForMainPost(params);
    const gigId = gig.id;
    if (gig.version !== params.expectedVersion) {
      throw new ConflictException(`Gig with ID "${gigId}" has a newer version`);
    }
    if (this.findTelegramPost(gig.posts, PostType.Main)) {
      throw new ConflictException('Gig main post already exists');
    }

    const moderationPost =
      params.moderationPost ??
      this.resolveTelegramPostRef(gig.posts, PostType.Moderation);
    // Telegram accepts the message before MongoDB stores its reference. A crash or
    // concurrent request can leave an external duplicate; reconciliation is out of scope.
    const telegramMainPost = await this.telegramService.sendMainPost(gig);
    if (!telegramMainPost) {
      throw new BadRequestException(
        `sendMainPost returned no Telegram message for gig ${gigId}`,
      );
    }

    const updatedGig = await this.appendGigMainPost({
      gigId,
      expectedVersion: params.expectedVersion,
      post: {
        id: telegramMainPost.messageId,
        chatId: telegramMainPost.chatId,
        fileId: telegramMainPost.fileId,
        // Telegram returns Unix seconds; Gig post dates use Unix milliseconds.
        date: telegramMainPost.sentAtSeconds * 1_000,
      },
    });

    if (!moderationPost) {
      this.logger.warn(
        `No moderation post linked for gig ${gigId}; skipping updateGigModerationPost`,
      );
      return;
    }

    try {
      await this.telegramService.updateGigModerationPost({
        gigId,
        expectedVersion: updatedGig.version,
        isVisible: updatedGig.isVisible,
        title: updatedGig.title,
        publicId: updatedGig.publicId,
        moderationPost,
        mainPost: {
          chatId: telegramMainPost.chatId,
          messageId: telegramMainPost.messageId,
        },
      });
    } catch (e: unknown) {
      this.logger.warn(
        `updateGigModerationPost failed for gig ${gigId}: ${formatTelegramErrorMessage(e)}`,
      );
    }
  }

  async setGigVisibility(params: SetGigVisibilityParams): Promise<void> {
    const gig = await this.getGigById(params.gigId);
    const gigId = gig.id;
    if (gig.version !== params.expectedVersion) {
      throw new ConflictException(`Gig with ID "${gigId}" has a newer version`);
    }
    if (gig.isVisible === params.isVisible) {
      const visibility = params.isVisible ? 'visible' : 'hidden';
      throw new ConflictException(
        `Gig with ID "${gigId}" is already ${visibility}`,
      );
    }

    await this.changeGigVisibility({
      publicId: gig.publicId,
      expectedVersion: params.expectedVersion,
      isVisible: params.isVisible,
      moderationPost: params.moderationPost,
    });
  }

  private async appendGigMainPost(
    params: AppendGigMainPostParams,
  ): Promise<PlainGig> {
    this.validateGigId(params.gigId);
    this.validateExpectedVersion(params.expectedVersion);

    const updated = await this.gigRepository.appendMainPost({
      gigId: params.gigId,
      expectedVersion: params.expectedVersion,
      post: {
        ...params.post,
        to: Messenger.Telegram,
        type: PostType.Main,
      },
    });
    if (updated) {
      return updated;
    }

    const gig = await this.getGigById(params.gigId);
    if (gig.version !== params.expectedVersion) {
      throw new ConflictException(
        `Gig with ID "${params.gigId}" has a newer version`,
      );
    }
    if (this.findTelegramPost(gig.posts, PostType.Main)) {
      throw new ConflictException('Gig main post already exists');
    }
    throw new ConflictException(
      `Gig with ID "${params.gigId}" changed while storing the main post`,
    );
  }

  private async updateGigTelegramPostFileId(
    params: UpdateGigTelegramPostFileIdParams,
  ): Promise<PlainGig> {
    this.validateGigId(params.gig.id);
    this.validateExpectedVersion(params.gig.version);
    if (!Number.isInteger(params.post.id)) {
      throw new BadRequestException('Telegram message ID must be an integer');
    }
    if (!Number.isInteger(params.post.chatId)) {
      throw new BadRequestException('Telegram chat ID must be an integer');
    }
    if (params.fileId.trim() === '') {
      throw new BadRequestException('Telegram file ID must not be empty');
    }

    const gigWithUpdatedFileId =
      await this.gigRepository.updateTelegramPostFileId({
        gigId: params.gig.id,
        expectedVersion: params.gig.version,
        type: params.post.type,
        messageId: params.post.id,
        chatId: params.post.chatId,
        fileId: params.fileId,
      });
    if (gigWithUpdatedFileId) {
      return gigWithUpdatedFileId;
    }

    this.logger.error(
      `Telegram ${params.post.type} fileId was not stored for publicId=${params.gig.publicId} expectedVersion=${params.gig.version}`,
    );
    return params.gig;
  }

  private async getGigForMainPost(
    params: CreateGigMainPostParams,
  ): Promise<PlainGig> {
    if (params.gigId !== undefined) {
      return this.getGigById(params.gigId);
    }
    if (params.publicId !== undefined) {
      return this.getGigByPublicId(params.publicId);
    }
    throw new BadRequestException('Either gigId or publicId must be provided');
  }

  private findTelegramPost(
    posts: GigPost[] | undefined,
    type: PostType,
  ): GigPost | undefined {
    return posts?.find(
      (post) => post.to === Messenger.Telegram && post.type === type,
    );
  }

  private resolveTelegramPostRef(
    posts: GigPost[] | undefined,
    type: PostType,
  ): GigTelegramPostRef | undefined {
    const post = this.findTelegramPost(posts, type);
    if (!post?.chatId || post.id == null) {
      return undefined;
    }
    return {
      chatId: post.chatId,
      messageId: post.id,
    };
  }

  private async updateGigModerationPostBestEffort(
    params: UpdateGigModerationPostBestEffortParams,
  ): Promise<void> {
    const { gig } = params;
    const moderationPost =
      params.moderationPost ??
      this.resolveTelegramPostRef(gig.posts, PostType.Moderation);
    if (moderationPost === undefined) {
      return;
    }

    const mainPost = this.resolveTelegramPostRef(gig.posts, PostType.Main);
    const payload: UpdateGigModerationPostPayload = {
      gigId: gig.id,
      expectedVersion: gig.version,
      isVisible: gig.isVisible,
      title: gig.title,
      publicId: gig.publicId,
      moderationPost,
    };
    if (mainPost !== undefined) {
      payload.mainPost = mainPost;
    }

    try {
      await this.telegramService.updateGigModerationPost(payload);
    } catch (e: unknown) {
      this.logger.warn(
        `Telegram moderation post update failed for publicId=${gig.publicId}: ${formatTelegramErrorMessage(e)}`,
      );
    }
  }

  private revalidateGigFeed(gig: PlainGig): Promise<void> {
    return this.feedRevalidateService.revalidateFeed({
      country: gig.country,
      city: gig.city,
    });
  }

  async resolvePublicPostUrl(
    payload: ResolvePublicPostUrl,
  ): Promise<string | undefined> {
    const { postId, chatId } = payload;

    if (!chatId) {
      return;
    }

    const chatUsername = chatId
      ? await this.telegramService.getChatUsername(chatId)
      : undefined;

    return chatUsername && postId
      ? this.telegramService.getPostUrl({
          chatUsername,
          messageId: postId,
        })
      : undefined;
  }

  gigToCalendarPayload(gig: GigCalendarSource): CalendarishEvent {
    const timeZone = 'Europe/Madrid';

    // Set start time to 8:00 PM
    const startDateTime = new Date(gig.date);
    startDateTime.setHours(20, 0, 0, 0); // 20:00

    // Calculate end time (2 hours later)
    const getDefaultEndDateTime = () =>
      new Date(startDateTime.getTime() + 2 * 60 * 60 * 1000);

    // If `endDate` exists (multi-day event), end on the last day.
    // We still default to an evening time window.
    const endDateTime = (() => {
      if (!gig.endDate) return getDefaultEndDateTime();

      const end = new Date(gig.endDate);
      end.setHours(22, 0, 0, 0); // 22:00 (20:00 + 2h)

      // Safety: never return an end before the start.
      return end.getTime() > startDateTime.getTime()
        ? end
        : getDefaultEndDateTime();
    })();

    return {
      title: gig.title,
      description: `Tickets: ${gig.ticketsUrl}`,
      location: [gig.venue, gig.city, gig.country] // TODO: add country name?
        .filter((str) => !!str)
        .join(', '),
      start: startDateTime,
      end: endDateTime,
      timeZone,
    };
  }

  private uploadPoster: GigPosterService['upload'] =
    this.gigPosterService.upload.bind(this.gigPosterService);
}

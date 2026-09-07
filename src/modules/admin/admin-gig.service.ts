import { Injectable, Logger } from '@nestjs/common';
import { GigService } from '../gig/gig.service';
import { mapGigToFormData } from './admin-gig.mapper';
import { ADMIN_GIG_LIST_DEFAULT_LIMIT } from '../gig/types/admin-gig-list-sort.types';
import type { V1AdminGigsGetQueryDto } from './types/requests/v1-admin-gigs-get-query';
import type {
  V1AdminGigListItem,
  V1AdminGigsListResponseBody,
} from './types/requests/v1-admin-gigs-list-response';
import type { GigFormData, PlainGig } from '../gig/types/gig.types';
import { PostType } from '../../shared/types/post-type.enum';
import { TelegramService } from '../telegram/telegram.service';
import { FeedRevalidateService } from '../gig/feed-revalidate.service';
import { getBiggestTgPhotoFileId } from '../telegram/utils/photo';
import type { GigFormInput } from '../gig/types/gig.types';

interface UpdateGigByPublicIdParams {
  publicId: string;
  expectedVersion: number;
  gig: GigFormInput;
  posterFile: Express.Multer.File | undefined;
}

interface UpdateGigVisibilityByPublicIdParams {
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

@Injectable()
export class AdminGigService {
  constructor(
    private readonly gigService: GigService,
    private readonly telegramService: TelegramService,
    private readonly feedRevalidateService: FeedRevalidateService,
  ) {}

  private readonly logger = new Logger(AdminGigService.name);

  async getGigsList(
    query: V1AdminGigsGetQueryDto,
  ): Promise<V1AdminGigsListResponseBody> {
    const plainGigs = await this.gigService.getGigs({
      limit: query.limit ?? ADMIN_GIG_LIST_DEFAULT_LIMIT,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    const gigs: V1AdminGigListItem[] = [];
    for (const plainGig of plainGigs) {
      const gig = await this.resolveGig(plainGig);
      gigs.push(this.mapFormDataToListItem(gig));
    }

    return { gigs };
  }

  async getGigByPublicId(publicId: string): Promise<GigFormData> {
    const plainGig = await this.gigService.getGigByPublicId(publicId);
    return this.resolveGig(plainGig);
  }

  private async resolveGig(gig: PlainGig): Promise<GigFormData> {
    const posterUrl = this.gigService.resolveGigPosterPublicUrl(gig.poster);

    const mainPost = this.telegramService.pickTgPost(gig.posts, PostType.Main);
    const mainPostUrl = await this.gigService.resolvePublicPostUrl({
      chatId: mainPost?.chatId,
      postId: mainPost?.id,
    });

    const moderationPost = this.telegramService.pickTgPost(
      gig.posts,
      PostType.Moderation,
    );
    const moderationPostUrl = moderationPost?.id
      ? this.telegramService.getPostUrl({
          messageId: moderationPost.id,
          chatId: moderationPost?.chatId,
        })
      : undefined;

    return mapGigToFormData({
      gig,
      posterUrl,
      mainPostUrl,
      mainPostDate: mainPost?.date,
      moderationPostUrl,
      moderationPostDate: moderationPost?.date,
    });
  }

  async updateGigByPublicId(
    params: UpdateGigByPublicIdParams,
  ): Promise<UpdateGigByPublicIdResult> {
    const updatedGig = await this.gigService.updateGigByPublicId(params);
    const mainPost = this.telegramService.pickTgPost(
      updatedGig.posts,
      PostType.Main,
    );
    const editedPostType = mainPost ? PostType.Main : PostType.Moderation;

    try {
      const edited = mainPost
        ? await this.telegramService.editMainPost(updatedGig, {
            updateMedia: params.posterFile !== undefined,
          })
        : await this.telegramService.editModerationPost(updatedGig, {
            updateMedia: params.posterFile !== undefined,
          });
      const fileId = getBiggestTgPhotoFileId(edited?.photo);
      if (fileId !== undefined) {
        await this.gigService.updateGigTelegramPostFileId({
          gigId: updatedGig._id,
          expectedVersion: updatedGig.version,
          type: editedPostType,
          fileId,
        });
      }
    } catch (e: unknown) {
      this.logger.warn(
        `Telegram post update failed for publicId=${params.publicId}: ${this.formatError(e)}`,
      );
    }

    await this.feedRevalidateService.revalidateFeed({
      country: updatedGig.country,
      city: updatedGig.city,
    });
    return { publicId: updatedGig.publicId };
  }

  async updateGigVisibilityByPublicId(
    params: UpdateGigVisibilityByPublicIdParams,
  ): Promise<UpdateGigVisibilityByPublicIdResult> {
    const updatedGig =
      await this.gigService.updateGigVisibilityByPublicId(params);
    await this.feedRevalidateService.revalidateFeed({
      country: updatedGig.country,
      city: updatedGig.city,
    });
    return {
      publicId: updatedGig.publicId,
      version: updatedGig.version,
      isVisible: updatedGig.isVisible,
    };
  }

  private formatError(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  private mapFormDataToListItem(formData: GigFormData): V1AdminGigListItem {
    const ticketsUrl = formData.ticketsUrl.trim();

    return {
      publicId: formData.publicId,
      title: formData.title,
      isVisible: formData.isVisible,
      version: formData.version,
      source: formData.source,
      date: formData.date,
      endDate: formData.endDate,
      city: formData.city,
      country: formData.country,
      venue: formData.venue,
      posterUrl: formData.posterUrl,
      ticketsUrl: ticketsUrl.length > 0 ? ticketsUrl : undefined,
      mainPostUrl: formData.mainPostUrl,
      mainPostDate: formData.mainPostDate,
      moderationPostUrl: formData.moderationPostUrl,
      moderationPostDate: formData.moderationPostDate,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { GigService } from '../gig/gig.service';
import { mapGigToFormData } from './admin-gig.mapper';
import { ADMIN_GIG_LIST_DEFAULT_LIMIT } from '../gig/types/admin-gig-list-sort.types';
import type { V1AdminGigsGetQueryDto } from './types/requests/v1-admin-gigs-get-query';
import { mapAdminGigListStatusQueryToGigStatuses } from './types/requests/v1-admin-gigs-get-query';
import type {
  V1AdminGigListItem,
  V1AdminGigsListResponseBody,
} from './types/requests/v1-admin-gigs-list-response';
import type { GigFormData, PlainGig } from '../gig/types/gig.types';
import { PostType } from '../../shared/types/post-type.enum';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class AdminGigService {
  constructor(
    private readonly gigService: GigService,
    private readonly telegramService: TelegramService,
  ) {}

  async getGigsList(
    query: V1AdminGigsGetQueryDto,
  ): Promise<V1AdminGigsListResponseBody> {
    const statuses = mapAdminGigListStatusQueryToGigStatuses(query.status);
    const plainGigs = await this.gigService.getGigsByStatus({
      statuses,
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

    const publishPost = this.telegramService.pickTgPost(
      gig.posts,
      PostType.Publish,
    );
    const publishPostUrl = await this.gigService.resolvePublicPostUrl({
      chatId: publishPost?.chatId,
      postId: publishPost?.id,
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
      publishPostUrl,
      publishPostDate: publishPost?.date,
      moderationPostUrl,
      moderationPostDate: moderationPost?.date,
    });
  }

  private mapFormDataToListItem(formData: GigFormData): V1AdminGigListItem {
    const ticketsUrl = formData.ticketsUrl.trim();

    return {
      publicId: formData.publicId,
      title: formData.title,
      status: formData.status,
      isVisible: formData.isVisible,
      version: formData.version,
      date: formData.date,
      endDate: formData.endDate,
      city: formData.city,
      country: formData.country,
      venue: formData.venue,
      posterUrl: formData.posterUrl,
      suggestedBy: formData.suggestedBy,
      ticketsUrl: ticketsUrl.length > 0 ? ticketsUrl : undefined,
      publishPostUrl: formData.publishPostUrl,
      publishPostDate: formData.publishPostDate,
      moderationPostUrl: formData.moderationPostUrl,
      moderationPostDate: formData.moderationPostDate,
    };
  }
}

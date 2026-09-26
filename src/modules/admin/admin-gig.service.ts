import { Injectable } from '@nestjs/common';
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
import { UserService } from '../user/user.service';
import type { User } from '../user/types/user.types';
import { getUserSourceProfile } from './admin-user-source-profile';

@Injectable()
export class AdminGigService {
  constructor(
    private readonly gigService: GigService,
    private readonly telegramService: TelegramService,
    private readonly userService: UserService,
  ) {}

  async getGigsList(
    query: V1AdminGigsGetQueryDto,
  ): Promise<V1AdminGigsListResponseBody> {
    const plainGigs = await this.gigService.getGigs({
      limit: query.limit ?? ADMIN_GIG_LIST_DEFAULT_LIMIT,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    const activeSourceUsersById =
      await this.getActiveSourceUsersById(plainGigs);

    const gigs: V1AdminGigListItem[] = [];
    for (const plainGig of plainGigs) {
      const gig = await this.resolveGig(plainGig, activeSourceUsersById);
      gigs.push(this.mapFormDataToListItem(gig));
    }

    return { gigs };
  }

  async getGigByPublicId(publicId: string): Promise<GigFormData> {
    const plainGig = await this.gigService.getGigByPublicId(publicId);
    const activeSourceUsersById = await this.getActiveSourceUsersById([
      plainGig,
    ]);
    return this.resolveGig(plainGig, activeSourceUsersById);
  }

  private async resolveGig(
    gig: PlainGig,
    activeSourceUsersById: ReadonlyMap<string, User>,
  ): Promise<GigFormData> {
    const posterUrl = this.gigService.resolveGigPosterPublicUrl(gig.poster);
    const user =
      gig.source.type === 'user'
        ? activeSourceUsersById.get(gig.source.userId.toString())
        : undefined;
    const userSourceProfile = getUserSourceProfile(user);

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
      userSourceProfile,
      posterUrl,
      mainPostUrl,
      mainPostDate: mainPost?.date,
      moderationPostUrl,
      moderationPostDate: moderationPost?.date,
    });
  }

  private async getActiveSourceUsersById(
    gigs: readonly PlainGig[],
  ): Promise<ReadonlyMap<string, User>> {
    const userIds = gigs.flatMap((gig) =>
      gig.source.type === 'user' ? [gig.source.userId.toString()] : [],
    );
    const users = await this.userService.findActiveUsersByIds(userIds);
    return new Map(users.map((user) => [user.id, user]));
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

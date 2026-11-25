import { Injectable } from '@nestjs/common';
import { GigService } from '@modules/gig/gig.service';
import { mapGigToFormData } from './admin-gig.mapper';
import { ADMIN_GIG_LIST_DEFAULT_LIMIT } from '@modules/gig/types/admin-gig-list-sort.types';
import type { V1AdminGigsGetQueryDto } from './types/requests/v1-admin-gigs-get-query';
import type {
  V1AdminGigListItem,
  V1AdminGigResponseBody,
  V1AdminGigsListResponseBody,
} from './types/requests/v1-admin-gigs-list-response';
import type { PlainGig } from '@modules/gig/types/gig.types';
import { GigSourceType } from '@modules/gig/types/gig-source-type.enum';
import { PostType } from '@shared/types/post-type.enum';
import { TelegramComposerService } from '@modules/telegram/telegram-composer.service';
import { TelegramGigService } from '@modules/telegram/telegram-gig/telegram-gig.service';
import { UserService } from '@modules/user/user.service';
import type { User } from '@modules/user/types/user.types';
import { getUserSourceProfile } from '../admin-shared/admin-user-source-profile';
import { VenueService } from '@modules/location/venue/venue.service';
import type { VenueSelection } from '@modules/location/venue/venue.service';

@Injectable()
export class AdminGigService {
  constructor(
    private readonly gigService: GigService,
    private readonly telegramComposer: TelegramComposerService,
    private readonly telegramGigService: TelegramGigService,
    private readonly userService: UserService,
    private readonly venueService: VenueService,
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
    const venueSelections = await this.venueService.getVenueSelections(
      plainGigs.map((gig) => gig.venueIds),
    );

    const gigs: V1AdminGigListItem[] = [];
    for (const [index, plainGig] of plainGigs.entries()) {
      const venueSelection = venueSelections[index];
      if (venueSelection === undefined) {
        throw new Error('Loaded Venue selection must exist');
      }
      const gig = await this.getGigFormData(
        plainGig,
        venueSelection,
        activeSourceUsersById,
      );
      gigs.push(this.mapFormDataToListItem(gig));
    }

    return { gigs };
  }

  async getGigByPublicId(publicId: string): Promise<V1AdminGigResponseBody> {
    const plainGig = await this.gigService.getGigByPublicId(publicId);
    const activeSourceUsersById = await this.getActiveSourceUsersById([
      plainGig,
    ]);
    const [venueSelection] = await this.venueService.getVenueSelections([
      plainGig.venueIds,
    ]);
    if (venueSelection === undefined) {
      throw new Error('Loaded Venue selection must exist');
    }
    return this.getGigFormData(plainGig, venueSelection, activeSourceUsersById);
  }

  private async getGigFormData(
    gig: PlainGig,
    venueSelection: VenueSelection,
    activeSourceUsersById: ReadonlyMap<string, User>,
  ): Promise<V1AdminGigResponseBody> {
    const posterUrl = this.gigService.resolveGigPosterPublicUrl(gig.poster);
    const user =
      gig.source.type === GigSourceType.User && gig.source.userId !== undefined
        ? activeSourceUsersById.get(gig.source.userId)
        : undefined;

    const userSourceProfile = getUserSourceProfile(user);

    const mainPost = this.telegramGigService.pickPost(gig.posts, PostType.Main);
    const mainPostUrl =
      await this.telegramGigService.resolveMainPostUrl(mainPost);

    const moderationPost = this.telegramGigService.pickPost(
      gig.posts,
      PostType.Moderation,
    );
    const moderationPostUrl = moderationPost?.id
      ? this.telegramComposer.buildPostUrl({
          messageId: moderationPost.id,
          chatId: moderationPost?.chatId,
        })
      : undefined;

    return mapGigToFormData({
      gig,
      venueSelection,
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
      gig.source.type === GigSourceType.User && gig.source.userId !== undefined
        ? [gig.source.userId]
        : [],
    );

    const users = await this.userService.findActiveUsersByIds(userIds);
    return new Map(users.map((user) => [user.id, user]));
  }

  private mapFormDataToListItem(
    formData: V1AdminGigResponseBody,
  ): V1AdminGigListItem {
    const ticketsUrl = formData.ticketsUrl.trim();

    return {
      publicId: formData.publicId,
      communityIds: formData.communityIds,
      venueIds: formData.venueIds,
      locality: formData.locality,
      venues: formData.venues,
      title: formData.title,
      isVisible: formData.isVisible,
      version: formData.version,
      source: formData.source,
      date: formData.date,
      endDate: formData.endDate,
      posterUrl: formData.posterUrl,
      ticketsUrl: ticketsUrl.length > 0 ? ticketsUrl : undefined,
      mainPostUrl: formData.mainPostUrl,
      mainPostDate: formData.mainPostDate,
      moderationPostUrl: formData.moderationPostUrl,
      moderationPostDate: formData.moderationPostDate,
    };
  }
}

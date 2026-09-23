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
import type { GigFormInput } from '../gig/types/gig.types';
import { UserService } from '../user/user.service';
import type { User } from '../user/types/user.types';
import { getUserSourceProfile } from './admin-user-source-profile';
import type { UpdateGigModerationPostPayload } from '../telegram/types/telegram.service.types';

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
    private readonly userService: UserService,
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

  async updateGigByPublicId(
    params: UpdateGigByPublicIdParams,
  ): Promise<UpdateGigByPublicIdResult> {
    let updatedGig = await this.gigService.updateGigByPublicId(params);
    const mainPost = this.telegramService.pickTgPost(
      updatedGig.posts,
      PostType.Main,
    );
    const gigModerationPost = this.telegramService.pickTgPost(
      updatedGig.posts,
      PostType.Moderation,
    );
    const editedPost = mainPost ?? gigModerationPost;

    try {
      const edited =
        editedPost !== undefined
          ? await this.telegramService.editGigPost({
              gig: updatedGig,
              post: editedPost,
              isMediaUpdateRequired: params.posterFile !== undefined,
            })
          : undefined;
      const fileId = edited?.fileId;
      if (
        params.posterFile !== undefined &&
        fileId !== undefined &&
        editedPost !== undefined
      ) {
        const gigWithUpdatedFileId =
          await this.gigService.updateGigTelegramPostFileId({
            gigId: updatedGig.id,
            expectedVersion: updatedGig.version,
            type: editedPost.type,
            messageId: editedPost.id,
            chatId: editedPost.chatId,
            fileId,
          });
        if (gigWithUpdatedFileId) {
          updatedGig = gigWithUpdatedFileId;
        } else {
          this.logger.error(
            `Telegram ${editedPost.type} fileId was not stored for publicId=${updatedGig.publicId} expectedVersion=${updatedGig.version}`,
          );
        }
      }
    } catch (e: unknown) {
      this.logger.warn(
        `Telegram post update failed for publicId=${params.publicId}: ${this.formatError(e)}`,
      );
    }

    await this.updateGigModerationPostAfterAdminGigMutation(updatedGig);

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
    await this.updateGigModerationPostAfterAdminGigMutation(updatedGig);
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

  private async updateGigModerationPostAfterAdminGigMutation(
    gig: PlainGig,
  ): Promise<void> {
    const moderationPost = this.telegramService.pickTgPost(
      gig.posts,
      PostType.Moderation,
    );
    if (moderationPost === undefined) {
      return;
    }

    const mainPost = this.telegramService.pickTgPost(gig.posts, PostType.Main);
    const payload: UpdateGigModerationPostPayload = {
      gigId: gig.id,
      expectedVersion: gig.version,
      isVisible: gig.isVisible,
      title: gig.title,
      publicId: gig.publicId,
      moderationPost: {
        chatId: moderationPost.chatId,
        messageId: moderationPost.id,
      },
    };
    if (mainPost !== undefined) {
      payload.mainPost = {
        chatId: mainPost.chatId,
        messageId: mainPost.id,
      };
    }

    try {
      await this.telegramService.updateGigModerationPost(payload);
    } catch (e: unknown) {
      this.logger.warn(
        `Telegram moderation post update failed for publicId=${gig.publicId}: ${this.formatError(e)}`,
      );
    }
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

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { UpdateQuery } from 'mongoose';
import { CalendarService } from '../calendar/calendar.service';
import { TelegramService } from '../telegram/telegram.service';
import { getBiggestTgPhotoFileId } from '../telegram/utils/photo';
import { FeedRevalidateService } from './feed-revalidate.service';
import type { Gig, GigPost } from './gig.schema';
import { GigService } from './gig.service';
import { Messenger } from './types/messenger.enum';
import type {
  GigModerationPostRef,
  ModerateGigParams,
} from './types/gig-moderation.types';
import { PostType } from './types/postType.enum';
import { Status } from './types/status.enum';
import type { GigId, PlainGig } from './types/gig.types';

interface GigModerationData {
  gigStatus: Status;
  gigId: GigId;
  moderationPost: GigModerationPostRef | undefined;
}

// TODO: add allowing only specific status transitions
@Injectable()
export class GigModerationService {
  constructor(
    private readonly gigService: GigService,
    private readonly telegramService: TelegramService,
    private readonly calendarService: CalendarService,
    private readonly feedRevalidateService: FeedRevalidateService,
  ) {}

  private readonly logger = new Logger(GigModerationService.name);

  private async buildGigModerationData(
    params: ModerateGigParams,
  ): Promise<GigModerationData> {
    const gig = await this.getGig(params);
    const gigId = gig._id.toString();
    const moderationPost =
      params.moderationPost ?? this.resolveModerationPostRef(gig.posts);
    return { gigStatus: gig.status, gigId, moderationPost };
  }

  async approveGig(params: ModerateGigParams): Promise<void> {
    const { gigId, gigStatus, moderationPost } =
      await this.buildGigModerationData(params);

    this.assertCanApprove(gigStatus);

    const updatedGig = await this.gigService.updateGigStatus(
      gigId,
      Status.Approved,
    );
    const tgPublishPost = await this.telegramService.publishMain(updatedGig);

    const publishedChatId =
      tgPublishPost?.sender_chat?.id ?? tgPublishPost?.chat?.id;
    const publishedMessageId = tgPublishPost?.message_id;
    const publishedFileId = getBiggestTgPhotoFileId(tgPublishPost?.photo); // but should be the same as in moderation one

    const updateGigPayload: UpdateQuery<Gig> = {
      status: Status.Published,
    };

    if (tgPublishPost && publishedChatId && publishedMessageId) {
      updateGigPayload.$push = {
        posts: {
          id: publishedMessageId,
          chatId: publishedChatId,
          fileId: publishedFileId,
          to: Messenger.Telegram,
          type: PostType.Publish,
          date: tgPublishPost.date * 1_000, // Telegram date is Unix seconds; gig post date is Unix ms
        },
      };
    }

    await this.gigService.updateGig(gigId, updateGigPayload);
    this.logger.log(`Gig #${gigId} approved`);

    // Optional: update the feed cache on the frontend (ISR on-demand).
    await this.feedRevalidateService.revalidateFeed({
      country: updatedGig.country,
      city: updatedGig.city,
    });

    if (tgPublishPost && moderationPost) {
      await this.telegramService.handleAfterPublish({
        title: updatedGig.title,
        publicId: updatedGig.publicId,
        suggestedBy: updatedGig.suggestedBy,
        moderationPost,
        publishPost: {
          username: tgPublishPost.chat.username,
          chatId: tgPublishPost.chat.id,
          messageId: tgPublishPost.message_id,
        },
      });
    } else if (tgPublishPost && !moderationPost) {
      this.logger.warn(
        `No moderation post linked for gig ${gigId}; skipping handleAfterPublish`,
      );
    } else {
      this.logger.warn(
        `publishMain returned no Telegram message for gig ${gigId}; skipping handleAfterPublish`,
      );
    }

    const calendarGig = this.gigService.gigToCalendarPayload(updatedGig);
    await this.calendarService.addEvent(calendarGig);
  }

  async rejectGig(params: ModerateGigParams): Promise<void> {
    const { gigId, gigStatus, moderationPost } =
      await this.buildGigModerationData(params);

    this.assertCanReject(gigStatus);

    const updatedGig = await this.gigService.updateGigStatus(
      gigId,
      Status.Rejected,
    );
    this.logger.log(`Gig #${gigId} rejected`);

    if (moderationPost) {
      await this.telegramService.handlePostReject({
        suggestedBy: updatedGig.suggestedBy,
        moderationMessage: moderationPost,
        gigId,
        title: updatedGig.title,
      });
    } else {
      this.logger.warn(
        `No moderation post linked for gig ${gigId}; skipping handlePostReject`,
      );
    }
  }

  private async getGig(params: ModerateGigParams): Promise<PlainGig> {
    if (params.gigId !== undefined) {
      return this.gigService.getGigById(params.gigId);
    }
    if (params.publicId !== undefined) {
      return this.gigService.getGigByPublicId(params.publicId);
    }
    throw new BadRequestException('Either gigId or publicId must be provided');
  }

  private resolveModerationPostRef(
    posts: GigPost[] | undefined,
  ): GigModerationPostRef | undefined {
    const moderationPost = this.telegramService.pickTgPost(
      posts,
      PostType.Moderation,
    );
    if (!moderationPost?.chatId || moderationPost.id == null) {
      return undefined;
    }
    return {
      chatId: moderationPost.chatId,
      messageId: moderationPost.id,
    };
  }

  private assertCanApprove(status: Status): void {
    if (status === Status.Published) {
      throw new BadRequestException('Gig is already published');
    }
  }

  private assertCanReject(status: Status): void {
    if (status === Status.Published) {
      throw new BadRequestException('Cannot reject a published gig');
    }
  }
}

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
  gigId: GigId;
  gigPublicId: string;
  gigStatus: Status;
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
    return {
      gigId,
      gigPublicId: gig.publicId,
      gigStatus: gig.status,
      moderationPost,
    };
  }

  async approveGig(params: ModerateGigParams): Promise<void> {
    const { gigId, gigPublicId, gigStatus, moderationPost } =
      await this.buildGigModerationData(params);

    this.assertCanApprove(gigStatus);

    const updatedGig = await this.gigService.updateGigStatus(
      gigId,
      Status.Published,
    );
    this.logger.log(`Gig ${gigPublicId} (${gigId}) approved and published`);

    await this.feedRevalidateService.revalidateFeed({
      country: updatedGig.country,
      city: updatedGig.city,
    });

    if (moderationPost) {
      await this.telegramService.updateModerationPostAfterGigPublished({
        gigId,
        title: updatedGig.title,
        publicId: updatedGig.publicId,
        moderationPost,
      });
    } else {
      this.logger.warn(
        `No moderation post linked for gig ${gigId}; skipping updateModerationPostAfterGigPublished`,
      );
    }

    await this.telegramService.updatePublishedSubmissionFeedback({
      gig: updatedGig,
    });

    const calendarGig = this.gigService.gigToCalendarPayload(updatedGig);
    await this.calendarService.addEvent(calendarGig);
  }

  async publishGigPost(params: ModerateGigParams): Promise<void> {
    const gig = await this.getGig(params);
    const gigId = gig._id.toString();
    const moderationPost =
      params.moderationPost ?? this.resolveModerationPostRef(gig.posts);

    this.assertCanPublishPost(gig.status, gig.posts);

    const tgPublishPost = await this.telegramService.publishMain(gig);
    const publishedChatId =
      tgPublishPost?.sender_chat?.id ?? tgPublishPost?.chat?.id;
    const publishedMessageId = tgPublishPost?.message_id;

    if (!tgPublishPost || !publishedChatId || !publishedMessageId) {
      throw new BadRequestException(
        `publishMain returned no Telegram message for gig ${gigId}`,
      );
    }

    const publishedFileId = getBiggestTgPhotoFileId(tgPublishPost.photo); // but should be the same as in moderation one

    const updateGigPayload: UpdateQuery<Gig> = {
      $push: {
        posts: {
          id: publishedMessageId,
          chatId: publishedChatId,
          fileId: publishedFileId,
          to: Messenger.Telegram,
          type: PostType.Publish,
          date: tgPublishPost.date * 1_000, // Telegram date is Unix seconds; gig post date is Unix ms
        },
      },
    };

    await this.gigService.updateGig(gigId, updateGigPayload);

    if (moderationPost) {
      await this.telegramService.updateModerationPostAfterGigPublished({
        gigId,
        title: gig.title,
        publicId: gig.publicId,
        moderationPost,
        publishPost: {
          chatId: tgPublishPost.chat.id,
          messageId: tgPublishPost.message_id,
        },
      });
    } else {
      this.logger.warn(
        `No moderation post linked for gig ${gigId}; skipping updateModerationPostAfterGigPublished`,
      );
    }
  }

  async rejectGig(params: ModerateGigParams): Promise<void> {
    const { gigId, gigPublicId, gigStatus, moderationPost } =
      await this.buildGigModerationData(params);

    this.assertCanReject(gigStatus);

    const updatedGig = await this.gigService.updateGigStatus(
      gigId,
      Status.Rejected,
    );
    this.logger.log(`Gig ${gigPublicId} (${gigId}) rejected`);

    if (moderationPost) {
      await this.telegramService.handlePostReject({
        gig: updatedGig,
        moderationMessage: moderationPost,
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

  private assertCanPublishPost(
    status: Status,
    posts: GigPost[] | undefined,
  ): void {
    // TODO: naming is confusing, consider changing either Published status or "publish" post
    if (status !== Status.Published) {
      throw new BadRequestException(
        'Gig must be published before publishing main post',
      );
    }

    if (this.telegramService.pickTgPost(posts, PostType.Publish)) {
      throw new BadRequestException('Gig main post is already published');
    }
  }

  private assertCanReject(status: Status): void {
    if (status === Status.Published) {
      throw new BadRequestException('Cannot reject a published gig');
    }
  }
}

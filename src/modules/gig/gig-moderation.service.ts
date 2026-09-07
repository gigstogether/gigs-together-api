import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PostType } from '../../shared/types/post-type.enum';
import { TelegramService } from '../telegram/telegram.service';
import { getBiggestTgPhotoFileId } from '../telegram/utils/photo';
import type { GigPost } from './gig.schema';
import { GigService } from './gig.service';
import type {
  CreateGigMainPostParams,
  GigModerationPostRef,
} from './types/gig-moderation.types';
import type { PlainGig } from './types/gig.types';

@Injectable()
export class GigModerationService {
  constructor(
    private readonly gigService: GigService,
    private readonly telegramService: TelegramService,
  ) {}

  private readonly logger = new Logger(GigModerationService.name);

  async createGigMainPost(params: CreateGigMainPostParams): Promise<void> {
    const gig = await this.getGig(params);
    const gigId = gig._id.toString();
    if (gig.version !== params.expectedVersion) {
      throw new ConflictException(`Gig with ID "${gigId}" has a newer version`);
    }
    if (this.telegramService.pickTgPost(gig.posts, PostType.Main)) {
      throw new ConflictException('Gig main post already exists');
    }

    const moderationPost =
      params.moderationPost ?? this.resolveModerationPostRef(gig.posts);
    // Telegram can accept this message before its metadata is stored. Gig versioning
    // cannot provide external-message idempotency or reconcile that crash window.
    const telegramMainPost = await this.telegramService.sendMainPost(gig);
    const chatId =
      telegramMainPost?.sender_chat?.id ?? telegramMainPost?.chat?.id;
    const messageId = telegramMainPost?.message_id;
    if (!telegramMainPost || chatId === undefined || messageId === undefined) {
      throw new BadRequestException(
        `sendMainPost returned no Telegram message for gig ${gigId}`,
      );
    }

    const updatedGig = await this.gigService.appendGigMainPost({
      gigId,
      expectedVersion: params.expectedVersion,
      post: {
        id: messageId,
        chatId,
        fileId: getBiggestTgPhotoFileId(telegramMainPost.photo),
        // Telegram returns Unix seconds; Gig post dates use Unix milliseconds.
        date: telegramMainPost.date * 1_000,
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
        title: updatedGig.title,
        publicId: updatedGig.publicId,
        moderationPost,
        mainPost: { chatId, messageId },
      });
    } catch (e: unknown) {
      this.logger.warn(
        `updateGigModerationPost failed for gig ${gigId}: ${this.formatError(e)}`,
      );
    }
  }

  private async getGig(params: CreateGigMainPostParams): Promise<PlainGig> {
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

  private formatError(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }
}

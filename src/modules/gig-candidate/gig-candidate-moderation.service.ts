import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GigService } from '../gig/gig.service';
import { Messenger } from '../gig/types/messenger.enum';
import { TelegramService } from '../telegram/telegram.service';
import { getBiggestTgPhotoFileId } from '../telegram/utils/photo';
import type { TGMessage } from '../telegram/types/message.types';
import { GigCandidatePostType } from './types/gig-candidate-post-type.enum';
import { GigCandidateStatus } from './types/gig-candidate-status.enum';
import type {
  GigCandidatePost,
  GigCandidateRecord,
} from './types/gig-candidate.types';
import { GigCandidateService } from './gig-candidate.service';

interface GigCandidateSuggestionPostRef {
  messageId: number;
  chatId: number;
}

interface ModerateGigCandidateParams {
  gigCandidateId: string;
  suggestionPost?: GigCandidateSuggestionPostRef;
}

interface UpdateSuggestionMessageParams {
  gigCandidate: GigCandidateRecord;
  suggestionPost?: GigCandidateSuggestionPostRef;
}

@Injectable()
export class GigCandidateModerationService {
  constructor(
    private readonly gigCandidateService: GigCandidateService,
    private readonly gigService: GigService,
    private readonly telegramService: TelegramService,
  ) {}

  private readonly logger = new Logger(GigCandidateModerationService.name);

  async accept(params: ModerateGigCandidateParams): Promise<void> {
    const gigCandidate = await this.gigCandidateService.getByIdOrThrow(
      params.gigCandidateId,
    );

    if (gigCandidate.status === GigCandidateStatus.Accepted) {
      throw new BadRequestException('GigCandidate is already accepted');
    }
    if (gigCandidate.status === GigCandidateStatus.Rejected) {
      throw new BadRequestException('Cannot accept a rejected GigCandidate');
    }
    if (gigCandidate.status !== GigCandidateStatus.Pending) {
      throw new BadRequestException(
        `Cannot accept GigCandidate in status ${gigCandidate.status}`,
      );
    }

    const createdGig = await this.gigService.createFromGigCandidate({
      title: gigCandidate.title,
      date: gigCandidate.date,
      endDate: gigCandidate.endDate,
      city: gigCandidate.city,
      country: gigCandidate.country,
      venue: gigCandidate.venue,
      ticketsUrl: gigCandidate.ticketsUrl,
      poster: gigCandidate.poster,
      suggestedBy: gigCandidate.suggestedBy,
      gigCandidateId: gigCandidate.id,
    });
    const gigId = createdGig._id.toString();

    let tgModerationPost: TGMessage | undefined;
    try {
      tgModerationPost =
        await this.telegramService.sendToModeration(createdGig);
    } catch (e) {
      this.logger.warn(
        `sendToModeration failed for GigCandidate ${gigCandidate.id}: ${JSON.stringify(
          e instanceof Error ? e.message : e,
        )}`,
      );
      tgModerationPost = undefined;
    }

    const biggestTgPhotoFileId = getBiggestTgPhotoFileId(
      tgModerationPost?.photo,
    );
    const moderationChatId =
      tgModerationPost?.sender_chat?.id ?? tgModerationPost?.chat?.id;
    const moderationMessageId = tgModerationPost?.message_id;

    if (
      tgModerationPost !== undefined &&
      moderationChatId !== undefined &&
      moderationMessageId !== undefined
    ) {
      await this.gigService.setPendingWithOptionalModerationPost({
        gigId,
        moderationPost: {
          id: moderationMessageId,
          chatId: moderationChatId,
          date: tgModerationPost.date * 1_000, // Telegram date is Unix seconds; gig post date is Unix ms
          ...(biggestTgPhotoFileId !== undefined
            ? { fileId: biggestTgPhotoFileId }
            : {}),
        },
      });
    } else {
      await this.gigService.setPendingWithOptionalModerationPost({ gigId });
    }

    const accepted = await this.gigCandidateService.markAccepted({
      id: gigCandidate.id,
      gigId,
    });

    await this.updateSuggestionMessage({
      gigCandidate: accepted,
      suggestionPost: params.suggestionPost,
    });

    this.logger.log(
      `GigCandidate ${gigCandidate.id} accepted -> Gig ${createdGig.publicId} (${gigId})`,
    );
  }

  async reject(params: ModerateGigCandidateParams): Promise<void> {
    const gigCandidate = await this.gigCandidateService.getByIdOrThrow(
      params.gigCandidateId,
    );

    if (gigCandidate.status === GigCandidateStatus.Rejected) {
      throw new BadRequestException('GigCandidate is already rejected');
    }
    if (gigCandidate.status === GigCandidateStatus.Accepted) {
      throw new BadRequestException('Cannot reject an accepted GigCandidate');
    }
    if (gigCandidate.status !== GigCandidateStatus.Pending) {
      throw new BadRequestException(
        `Cannot reject GigCandidate in status ${gigCandidate.status}`,
      );
    }

    const rejected = await this.gigCandidateService.markRejected({
      id: gigCandidate.id,
    });

    await this.updateSuggestionMessage({
      gigCandidate: rejected,
      suggestionPost: params.suggestionPost,
    });

    this.logger.log(`GigCandidate ${gigCandidate.id} rejected`);
  }

  private async updateSuggestionMessage(
    params: UpdateSuggestionMessageParams,
  ): Promise<void> {
    const { gigCandidate, suggestionPost } = params;
    const post =
      suggestionPost ?? this.resolveSuggestionPostRef(gigCandidate.posts);

    if (!post) {
      this.logger.warn(
        `No suggestion post linked for GigCandidate ${gigCandidate.id}; skipping suggestion message update`,
      );
      return;
    }

    const suggestionPostDoc = gigCandidate.posts.find(
      (p) =>
        p.to === Messenger.Telegram &&
        p.type === GigCandidatePostType.Suggestion &&
        p.chatId === post.chatId &&
        p.id === post.messageId,
    );

    try {
      await this.telegramService.updateGigCandidateSuggestionPost({
        gigCandidate,
        chatId: post.chatId,
        messageId: post.messageId,
        fileId: suggestionPostDoc?.fileId,
      });
    } catch (e) {
      this.logger.warn(
        `updateGigCandidateSuggestionPost failed for GigCandidate ${gigCandidate.id}: ${JSON.stringify(
          e instanceof Error ? e.message : e,
        )}`,
      );
    }
  }

  private resolveSuggestionPostRef(
    posts: GigCandidatePost[],
  ): GigCandidateSuggestionPostRef | undefined {
    const suggestionPost = posts.find(
      (post) =>
        post.to === Messenger.Telegram &&
        post.type === GigCandidatePostType.Suggestion &&
        post.chatId &&
        post.id != null,
    );
    if (!suggestionPost) {
      return undefined;
    }
    return {
      chatId: suggestionPost.chatId,
      messageId: suggestionPost.id,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { Messenger } from '../../../shared/types/messenger.enum';
import { PostType } from '../../../shared/types/post-type.enum';
import type { GigCandidate } from '../../gig-candidate/types/gig-candidate.types';
import { TelegramGigCandidateComposerService } from '../composers/telegram-gig-candidate-composer.service';
import type {
  ComposeGigCandidateFeedbackMessageParams,
  ComposeGigCandidateIntakePostAfterModerationEditParams,
} from '../composers/telegram-gig-candidate-composer.service.types';
import { TelegramBotClient } from '../telegram-bot.client';
import type { InputFileData, TGMessage } from '../types/message.types';
import { PostEditKind } from '../telegram-post-composer.service.types';
import type { TelegramPostEditComposition } from '../telegram-post-composer.service.types';
import type {
  EditGigCandidatePostParams,
  SendGigCandidatePhotoParams,
  TelegramGigCandidatePhotoPostSendResult,
  TelegramGigCandidatePostEditResult,
  TelegramGigCandidatePostSendResult,
  UpdateRejectedGigCandidatePostPayload,
} from './telegram-gig-candidate.service.types';
import { getBiggestTgPhotoFileId } from '../utils/photo';

@Injectable()
export class TelegramGigCandidateService {
  constructor(
    private readonly telegramBotClient: TelegramBotClient,
    private readonly telegramGigCandidateComposer: TelegramGigCandidateComposerService,
  ) {}

  async sendIntakePost(
    gigCandidate: GigCandidate,
    posterFile?: InputFileData,
  ): Promise<TelegramGigCandidatePostSendResult | undefined> {
    const composed =
      this.telegramGigCandidateComposer.composeIntakePost(gigCandidate);
    if (!('photo' in composed)) {
      const message = await this.telegramBotClient.sendMessage(composed);
      return this.mapPostSendResult(message);
    }
    return this.sendPhoto({
      composed,
      gigCandidateId: gigCandidate.id,
      posterFile,
    });
  }

  async sendModerationPost(
    gigCandidate: GigCandidate,
    posterFile?: InputFileData,
  ): Promise<TelegramGigCandidatePostSendResult | undefined> {
    const composed =
      this.telegramGigCandidateComposer.composeModerationPost(gigCandidate);
    if (posterFile === undefined) {
      const intakePost = gigCandidate.posts.find(
        (post) =>
          post.to === Messenger.Telegram && post.type === PostType.Intake,
      );
      const intakeFileId = intakePost?.fileId?.trim();
      if (intakeFileId) {
        composed.photo = intakeFileId;
      }
    }
    return this.sendPhoto({
      composed,
      gigCandidateId: gigCandidate.id,
      posterFile,
    });
  }

  sendFeedback(
    payload: ComposeGigCandidateFeedbackMessageParams,
  ): Promise<TGMessage> {
    const composed =
      this.telegramGigCandidateComposer.composeFeedbackMessage(payload);
    return this.telegramBotClient.sendMessage(composed);
  }

  async updateRejectedPost(
    payload: UpdateRejectedGigCandidatePostPayload,
  ): Promise<TGMessage> {
    const composed =
      this.telegramGigCandidateComposer.composeRejectedPostEdit(payload);
    const result = await this.executePostEdit(composed);
    return result.message;
  }

  async updateIntakePostAfterModeration(
    payload: ComposeGigCandidateIntakePostAfterModerationEditParams,
  ): Promise<TGMessage> {
    const composed =
      this.telegramGigCandidateComposer.composeIntakePostAfterModerationEdit(
        payload,
      );
    const result = await this.executePostEdit(composed);
    return result.message;
  }

  editPost(
    params: EditGigCandidatePostParams,
  ): Promise<TelegramGigCandidatePostEditResult> {
    const composed = this.telegramGigCandidateComposer.composePostEdit(params);
    return this.executePostEdit(composed, params.posterFile);
  }

  private async sendPhoto(
    params: SendGigCandidatePhotoParams,
  ): Promise<TelegramGigCandidatePhotoPostSendResult | undefined> {
    const { composed, gigCandidateId, posterFile } = params;
    if (posterFile !== undefined) {
      composed.photo = posterFile;
    }
    const message = await this.telegramBotClient.sendPhoto(
      composed,
      gigCandidateId,
    );
    return this.mapPhotoPostSendResult(message);
  }

  private mapPostSendResult(
    message: TGMessage,
  ): TelegramGigCandidatePostSendResult {
    const chatId = message.sender_chat?.id ?? message.chat?.id;
    if (
      !Number.isInteger(message.message_id) ||
      !Number.isInteger(chatId) ||
      !Number.isInteger(message.date)
    ) {
      throw new Error('Telegram sent post reference is incomplete');
    }

    return {
      messageId: message.message_id,
      chatId,
      sentAtSeconds: message.date,
    };
  }

  private mapPhotoPostSendResult(
    message: TGMessage | undefined,
  ): TelegramGigCandidatePhotoPostSendResult | undefined {
    if (message === undefined) {
      return;
    }
    const result = this.mapPostSendResult(message);

    const fileId = getBiggestTgPhotoFileId(message.photo);
    if (fileId === undefined) {
      throw new Error('Telegram photo response has no fileId');
    }
    return { ...result, fileId };
  }

  private async executePostEdit(
    composed: TelegramPostEditComposition,
    posterFile?: InputFileData,
  ): Promise<TelegramGigCandidatePostEditResult> {
    switch (composed.kind) {
      case PostEditKind.Media: {
        let message: TGMessage;
        if (posterFile !== undefined) {
          message = await this.telegramBotClient.editMessageMedia(
            composed.payload,
            posterFile,
          );
        } else {
          message = await this.telegramBotClient.editMessageMedia(
            composed.payload,
          );
        }
        const result: TelegramGigCandidatePostEditResult = {
          kind: PostEditKind.Media,
          message,
        };
        const fileId = getBiggestTgPhotoFileId(message.photo);
        if (fileId !== undefined) {
          result.fileId = fileId;
        }
        return result;
      }
      case PostEditKind.Caption: {
        const message = await this.telegramBotClient.editMessageCaption(
          composed.payload,
        );
        return { kind: PostEditKind.Caption, message };
      }
      case PostEditKind.Text: {
        const message = await this.telegramBotClient.editMessageText(
          composed.payload,
        );
        return { kind: PostEditKind.Text, message };
      }
    }
  }
}

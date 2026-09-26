import { BadRequestException, Injectable } from '@nestjs/common';
import { PostType } from '../../../shared/types/post-type.enum';
import { Messenger } from '../../../shared/types/messenger.enum';
import { GigCandidateStatus } from '../../gig-candidate/types/gig-candidate-status.enum';
import type { GigCandidate } from '../../gig-candidate/types/gig-candidate.types';
import {
  CallbackScope,
  encodeCallbackData,
  GigCandidateCallbackAction,
} from '../callback-action';
import {
  AdminMiniAppStartAction,
  TelegramPostComposerService,
} from '../telegram-post-composer.service';
import { TELEGRAM_TEMPLATE_KEYS } from '../telegram-template-keys';
import { TelegramTemplateService } from '../telegram-template.service';
import type {
  TGInlineKeyboardMarkup,
  TGSendMessage,
  TGSendPhoto,
} from '../types/message.types';
import { TGInputMediaType, TGParseMode } from '../types/message.types';
import type { TelegramPostEditComposition } from '../telegram-post-composer.service.types';
import { PostEditKind } from '../telegram-post-composer.service.types';
import type {
  BuildGigCandidateCaptionParams,
  BuildGigCandidateModerationReplyMarkupParams,
  ComposeGigCandidateChannelPostParams,
  ComposeGigCandidateExistingPostEditParams,
  ComposeGigCandidateFeedbackMessageParams,
  ComposeGigCandidateIntakePostAfterModerationEditParams,
  ComposeGigCandidatePostEditParams,
  ComposeRejectedGigCandidatePostEditParams,
} from './telegram-gig-candidate-composer.service.types';

@Injectable()
export class TelegramGigCandidateComposerService {
  constructor(
    private readonly telegramPostComposer: TelegramPostComposerService,
    private readonly telegramTemplates: TelegramTemplateService,
  ) {}

  composeIntakePost(gigCandidate: GigCandidate): TGSendMessage | TGSendPhoto {
    const chatId = this.requireChannelId(
      process.env.INTAKE_CHANNEL_ID,
      'INTAKE_CHANNEL_ID',
      'intake',
    );

    const replyMarkup = this.buildIntakeReplyMarkup(gigCandidate);
    const poster = this.telegramPostComposer.getTelegramPosterUrl(
      gigCandidate.gigDraft.poster,
    );
    if (poster === undefined || poster === '') {
      return {
        chat_id: chatId,
        text: this.buildCaption({
          gigCandidate,
          channelPurpose: 'intake',
        }),
        parse_mode: TGParseMode.HTML,
        disable_web_page_preview: true,
        reply_markup: replyMarkup,
      };
    }

    return this.composeChannelPost({
      gigCandidate,
      chatId,
      channelPurpose: 'intake',
      replyMarkup,
    });
  }

  composeModerationPost(gigCandidate: GigCandidate): TGSendPhoto {
    const chatId = this.requireChannelId(
      process.env.MODERATION_CHANNEL_ID,
      'MODERATION_CHANNEL_ID',
      'moderation',
    );

    return this.composeChannelPost({
      gigCandidate,
      chatId,
      channelPurpose: 'moderation',
      replyMarkup: this.buildModerationReplyMarkup({
        gigCandidate,
        expectedVersion: gigCandidate.version + 1,
      }),
    });
  }

  composeFeedbackMessage(
    params: ComposeGigCandidateFeedbackMessageParams,
  ): TGSendMessage {
    let text: string;
    switch (params.kind) {
      case 'submitted':
        text = this.telegramTemplates.render(
          TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackSubmitted,
          { title: this.escapeTelegramHtmlText(params.title) },
        );
        break;
      case 'acceptedForModeration':
        text = this.telegramTemplates.render(
          TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackAcceptedForModeration,
          { title: this.escapeTelegramHtmlText(params.title) },
        );
        break;
      case 'rejected':
        text = this.telegramTemplates.render(
          TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackRejected,
          { title: this.escapeTelegramHtmlText(params.title) },
        );
        break;
      case 'acceptedWithPublicLink': {
        const gigUrl = this.telegramPostComposer.buildGigPermalink({
          baseUrl: this.getAppBaseUrl(),
          publicId: params.publicId,
        });
        if (gigUrl === undefined) {
          throw new BadRequestException(
            'Cannot compose accepted GigCandidate feedback: APP_BASE_URL is not configured.',
          );
        }
        text = this.telegramTemplates.render(
          TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackAcceptedWithPublicLink,
          {
            gigUrl,
            title: this.escapeTelegramHtmlText(params.title),
          },
        );
        break;
      }
    }

    return {
      chat_id: params.chatId,
      text,
      parse_mode: TGParseMode.HTML,
      disable_web_page_preview: params.kind === 'acceptedWithPublicLink',
    };
  }

  composeRejectedPostEdit(
    params: ComposeRejectedGigCandidatePostEditParams,
  ): TelegramPostEditComposition {
    const channelPurpose =
      params.post.type === PostType.Intake ? 'intake' : 'moderation';

    return this.composeExistingPostEdit({
      post: params.post,
      text: this.buildCaption({
        gigCandidate: params.gigCandidate,
        channelPurpose,
      }),
      replyMarkup: { inline_keyboard: [] },
    });
  }

  composeIntakePostAfterModerationEdit(
    params: ComposeGigCandidateIntakePostAfterModerationEditParams,
  ): TelegramPostEditComposition {
    return this.composeExistingPostEdit({
      post: params.intakePost,
      text: this.buildCaption({
        gigCandidate: params.gigCandidate,
        channelPurpose: 'intake',
        moderationPost: params.moderationPost,
      }),
      replyMarkup: { inline_keyboard: [] },
    });
  }

  composePostEdit(
    params: ComposeGigCandidatePostEditParams,
  ): TelegramPostEditComposition {
    if (params.post.to !== Messenger.Telegram) {
      throw new BadRequestException(
        'Cannot edit a non-Telegram GigCandidate post',
      );
    }
    if (params.post.type !== PostType.Moderation) {
      throw new BadRequestException(
        `Cannot edit a ${params.post.type} post for a GigCandidate`,
      );
    }
    return this.composeModerationPostEdit(params);
  }

  private composeModerationPostEdit(
    params: ComposeGigCandidatePostEditParams,
  ): TelegramPostEditComposition {
    const caption = this.buildCaption({
      gigCandidate: params.gigCandidate,
      channelPurpose: 'moderation',
    });
    const replyMarkup = this.buildModerationReplyMarkup({
      gigCandidate: params.gigCandidate,
      expectedVersion: params.gigCandidate.version,
    });

    if (params.isMediaUpdateRequired) {
      const posterUrl = this.telegramPostComposer.getTelegramPosterUrl(
        params.gigCandidate.gigDraft.poster,
      );
      if (posterUrl === undefined || posterUrl === '') {
        throw new BadRequestException(
          'Cannot update GigCandidate moderation post media: gigCandidate has no poster URL.',
        );
      }
      return {
        kind: PostEditKind.Media,
        payload: {
          chatId: params.post.chatId,
          messageId: params.post.id,
          media: {
            type: TGInputMediaType.Photo,
            media: posterUrl,
            caption,
            parse_mode: TGParseMode.HTML,
          },
          replyMarkup,
        },
      };
    }

    return {
      kind: PostEditKind.Caption,
      payload: {
        chatId: params.post.chatId,
        messageId: params.post.id,
        caption,
        parseMode: TGParseMode.HTML,
        replyMarkup,
      },
    };
  }

  private composeChannelPost(
    params: ComposeGigCandidateChannelPostParams,
  ): TGSendPhoto {
    const poster = this.telegramPostComposer.getTelegramPosterUrl(
      params.gigCandidate.gigDraft.poster,
    );
    if (poster === undefined || poster === '') {
      throw new BadRequestException(
        `Cannot compose GigCandidate ${params.channelPurpose} post: gigCandidate has no poster URL.`,
      );
    }

    return {
      chat_id: params.chatId,
      photo: poster,
      caption: this.buildCaption({
        gigCandidate: params.gigCandidate,
        channelPurpose: params.channelPurpose,
      }),
      parse_mode: TGParseMode.HTML,
      reply_markup: params.replyMarkup,
    };
  }

  private composeExistingPostEdit(
    params: ComposeGigCandidateExistingPostEditParams,
  ): TelegramPostEditComposition {
    if (params.post.fileId === undefined) {
      return {
        kind: PostEditKind.Text,
        payload: {
          chatId: params.post.chatId,
          messageId: params.post.id,
          text: params.text,
          parseMode: TGParseMode.HTML,
          disableWebPagePreview: true,
          replyMarkup: params.replyMarkup,
        },
      };
    }

    return {
      kind: PostEditKind.Caption,
      payload: {
        chatId: params.post.chatId,
        messageId: params.post.id,
        caption: params.text,
        parseMode: TGParseMode.HTML,
        replyMarkup: params.replyMarkup,
      },
    };
  }

  private buildCaption(params: BuildGigCandidateCaptionParams): string {
    const body = this.buildBodyCaption(params);
    const adminGigCandidateUrl = this.buildAdminGigCandidateUrl(
      params.gigCandidate.id,
    );
    if (adminGigCandidateUrl === undefined) {
      throw new BadRequestException(
        'Cannot compose GigCandidate channel post: EDIT_GIG_URL is not configured.',
      );
    }

    const links = [
      this.telegramTemplates.render(
        TELEGRAM_TEMPLATE_KEYS.gigCandidateLinkOpenAdmin,
        { url: adminGigCandidateUrl },
      ),
    ];
    if (
      params.channelPurpose === 'intake' &&
      params.moderationPost !== undefined
    ) {
      const moderationPostUrl = this.telegramPostComposer.getPostUrl({
        chatId: params.moderationPost.chatId,
        messageId: params.moderationPost.id,
      });
      if (moderationPostUrl === undefined) {
        throw new BadRequestException(
          'Cannot compose GigCandidate intake post: moderation post URL is unavailable.',
        );
      }
      links.push(
        this.telegramTemplates.render(
          TELEGRAM_TEMPLATE_KEYS.gigCandidateLinkSeeModerationPost,
          { url: moderationPostUrl },
        ),
      );
    }

    return `${body}\n${links.join(' | ')}`;
  }

  private buildBodyCaption(params: BuildGigCandidateCaptionParams): string {
    const { gigCandidate } = params;
    const { gigDraft, source } = gigCandidate;
    if (gigDraft.title === undefined || gigDraft.date === undefined) {
      throw new BadRequestException(
        'Cannot compose GigCandidate post: gigDraft title and date are required.',
      );
    }
    const body = this.telegramPostComposer.buildCaption({
      title: this.buildTitleLine(
        gigCandidate.status,
        gigDraft.title,
        params.channelPurpose,
      ),
      ticketsUrl: gigDraft.ticketsUrl ?? '',
      venue: gigDraft.venue ?? '',
      date: gigDraft.date,
      endDate: gigDraft.endDate,
    });
    return `${body}\n\n──────────\nSource: ${source.type}`;
  }

  private buildTitleLine(
    status: GigCandidateStatus,
    title: string,
    channelPurpose: 'intake' | 'moderation',
  ): string {
    const escapedTitle = this.escapeTelegramHtmlText(title);
    if (channelPurpose === 'intake') {
      return status === GigCandidateStatus.Rejected
        ? `🔴 ${escapedTitle}`
        : escapedTitle;
    }

    switch (status) {
      case GigCandidateStatus.New:
        return `⚪ ${escapedTitle}`;
      case GigCandidateStatus.Reviewing:
        return `🟡 ${escapedTitle}`;
      case GigCandidateStatus.Approved:
        return escapedTitle;
      case GigCandidateStatus.Rejected:
        return `🔴 ${escapedTitle}`;
    }
  }

  private escapeTelegramHtmlText(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  private buildIntakeReplyMarkup(
    gigCandidate: GigCandidate,
  ): TGInlineKeyboardMarkup {
    const expectedVersionAfterPostStored = gigCandidate.version + 1;

    return {
      inline_keyboard: [
        [
          {
            text: this.telegramTemplates.getText(
              TELEGRAM_TEMPLATE_KEYS.buttonSendToModeration,
            ),
            callback_data: encodeCallbackData({
              scope: CallbackScope.GigCandidate,
              action: GigCandidateCallbackAction.SendToModeration,
              id: gigCandidate.id,
              expectedVersion: expectedVersionAfterPostStored,
            }),
          },
          {
            text: this.telegramTemplates.getText(
              TELEGRAM_TEMPLATE_KEYS.buttonReject,
            ),
            callback_data: encodeCallbackData({
              scope: CallbackScope.GigCandidate,
              action: GigCandidateCallbackAction.Reject,
              id: gigCandidate.id,
              expectedVersion: expectedVersionAfterPostStored,
            }),
          },
        ],
      ],
    };
  }

  private buildModerationReplyMarkup(
    params: BuildGigCandidateModerationReplyMarkupParams,
  ): TGInlineKeyboardMarkup {
    const { gigCandidate, expectedVersion } = params;
    const editGigCandidateUrl = this.buildEditGigCandidateUrl(gigCandidate.id);

    return {
      inline_keyboard: [
        [
          {
            text: this.telegramTemplates.getText(
              TELEGRAM_TEMPLATE_KEYS.buttonApprove,
            ),
            callback_data: encodeCallbackData({
              scope: CallbackScope.GigCandidate,
              action: GigCandidateCallbackAction.Approve,
              id: gigCandidate.id,
              expectedVersion,
            }),
          },
          ...(editGigCandidateUrl
            ? [
                {
                  text: this.telegramTemplates.getText(
                    TELEGRAM_TEMPLATE_KEYS.buttonEdit,
                  ),
                  url: editGigCandidateUrl,
                },
              ]
            : []),
          {
            text: this.telegramTemplates.getText(
              TELEGRAM_TEMPLATE_KEYS.buttonReject,
            ),
            callback_data: encodeCallbackData({
              scope: CallbackScope.GigCandidate,
              action: GigCandidateCallbackAction.Reject,
              id: gigCandidate.id,
              expectedVersion,
            }),
          },
        ],
      ],
    };
  }

  private buildEditGigCandidateUrl(gigCandidateId: string): string | undefined {
    return this.telegramPostComposer.buildAdminMiniAppUrl(
      AdminMiniAppStartAction.EditGigCandidate,
      gigCandidateId,
    );
  }

  private buildAdminGigCandidateUrl(
    gigCandidateId: string,
  ): string | undefined {
    return this.telegramPostComposer.buildAdminMiniAppUrl(
      AdminMiniAppStartAction.OpenGigCandidate,
      gigCandidateId,
    );
  }

  private requireChannelId(
    chatIdRaw: string | undefined,
    envName: string,
    channelPurpose: 'intake' | 'moderation',
  ): string {
    const chatId = chatIdRaw?.trim() ?? '';
    if (chatId === '') {
      throw new BadRequestException(
        `Cannot compose GigCandidate ${channelPurpose} post: ${envName} is not configured.`,
      );
    }

    return chatId;
  }

  private getAppBaseUrl(): string {
    return (process.env.APP_BASE_URL ?? '').trim();
  }
}

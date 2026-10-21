import { BadRequestException, Injectable } from '@nestjs/common';
import { PostType } from '../../../shared/types/post-type.enum';
import { Messenger } from '../../../shared/types/messenger.enum';
import { GigCandidateStatus } from '../../gig-candidate/types/gig-candidate-status.enum';
import type {
  GigCandidate,
  GigCandidatePost,
} from '../../gig-candidate/types/gig-candidate.types';
import { isGigCandidateSourceMessengerUser } from '../../gig-candidate/gig-candidate-source.guards';
import {
  CallbackScope,
  encodeCallbackData,
  GigCandidateCallbackAction,
} from '../utils/telegram-callback-action';
import {
  AdminMiniAppStartAction,
  TelegramComposerService,
} from '../telegram-composer.service';
import { TELEGRAM_TEMPLATE_KEYS } from '../telegram-template-keys';
import { TelegramTemplateService } from '../telegram-template.service';
import { TelegramService } from '../telegram.service';
import type {
  TGInlineKeyboardMarkup,
  TGSendMessage,
  TGSendPhoto,
} from '../types/message.types';
import { TGInputMediaType, TGParseMode } from '../types/message.types';
import type { TelegramPostEditComposition } from '../telegram-composer.service.types';
import { PostEditKind } from '../telegram-composer.service.types';
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
import { GigSourceType } from '../../gig/types/gig-source-type.enum';
import { formatTelegramGigDates } from '../utils/telegram-date';

const DIVIDER = '\n\n................................\n';
const MISSING_CAPTION_FIELD_PLACEHOLDER = '-';

function getCaptionFieldValue(value: string | undefined): string {
  return value?.trim() || MISSING_CAPTION_FIELD_PLACEHOLDER;
}

@Injectable()
export class TelegramGigCandidateComposerService {
  constructor(
    private readonly telegramComposer: TelegramComposerService,
    private readonly telegramTemplates: TelegramTemplateService,
    private readonly telegramService: TelegramService,
  ) {}

  composeIntakePost(gigCandidate: GigCandidate): TGSendMessage | TGSendPhoto {
    const chatId = this.requireChannelId(
      this.telegramService.getIntakeChannelId(),
      'INTAKE_CHANNEL_ID',
      PostType.Intake,
    );

    const replyMarkup = this.buildIntakeReplyMarkup(gigCandidate);
    const poster = this.telegramService.resolvePosterUrl(
      gigCandidate.gigDraft.poster,
    );
    if (poster === undefined || poster === '') {
      return {
        chat_id: chatId,
        text: this.buildCaption({
          gigCandidate,
          postType: PostType.Intake,
        }),
        parse_mode: TGParseMode.HTML,
        disable_web_page_preview: true,
        reply_markup: replyMarkup,
      };
    }

    return this.composeChannelPost({
      gigCandidate,
      chatId,
      postType: PostType.Intake,
      replyMarkup,
    });
  }

  composeModerationPost(gigCandidate: GigCandidate): TGSendPhoto {
    const chatId = this.requireChannelId(
      this.telegramService.getModerationChannelId(),
      'MODERATION_CHANNEL_ID',
      PostType.Moderation,
    );

    return this.composeChannelPost({
      gigCandidate,
      chatId,
      postType: PostType.Moderation,
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
          { title: this.escapeTelegramHtmlText(params.subject) },
        );
        break;
      case 'acceptedForModeration':
        text = this.telegramTemplates.render(
          TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackAcceptedForModeration,
          { title: this.escapeTelegramHtmlText(params.subject) },
        );
        break;
      case 'rejected':
        text = this.telegramTemplates.render(
          TELEGRAM_TEMPLATE_KEYS.gigCandidateFeedbackRejected,
          { title: this.escapeTelegramHtmlText(params.subject) },
        );
        break;
      case 'acceptedWithPublicLink': {
        const gigUrl = this.telegramComposer.buildGigPermalink({
          baseUrl: this.telegramService.getAppBaseUrl(),
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
            title: this.escapeTelegramHtmlText(params.subject),
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
    const captionParams: BuildGigCandidateCaptionParams =
      params.post.type === PostType.Intake
        ? {
            gigCandidate: params.gigCandidate,
            postType: PostType.Intake,
          }
        : {
            gigCandidate: params.gigCandidate,
            postType: PostType.Moderation,
          };

    return this.composeExistingPostEdit({
      post: params.post,
      text: this.buildCaption(captionParams),
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
        postType: PostType.Intake,
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
      postType: PostType.Moderation,
    });
    const replyMarkup = this.buildModerationReplyMarkup({
      gigCandidate: params.gigCandidate,
      expectedVersion: params.gigCandidate.version,
    });

    if (params.isMediaUpdateRequired) {
      const posterUrl = this.telegramService.resolvePosterUrl(
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
    const poster = this.telegramService.resolvePosterUrl(
      params.gigCandidate.gigDraft.poster,
    );
    if (poster === undefined || poster === '') {
      throw new BadRequestException(
        `Cannot compose GigCandidate ${params.postType.toLowerCase()} post: gigCandidate has no poster URL.`,
      );
    }

    return {
      chat_id: params.chatId,
      photo: poster,
      caption: this.buildCaption(params),
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
    const { gigCandidate, postType } = params;
    const { source, status } = gigCandidate;

    const isIntake = postType === PostType.Intake;

    const isMessengerSource = isGigCandidateSourceMessengerUser(source);
    const sourceOriginTypeLabel =
      source.type === GigSourceType.User
        ? ` (${isMessengerSource ? source.origin.messenger : source.origin.type})`
        : '';
    const sourceLabel = `${DIVIDER}Source: ${source.type}${sourceOriginTypeLabel}`;
    const originalMessage = isMessengerSource
      ? `Original message:\n${this.escapeTelegramHtmlText(source.originalText)}`
      : undefined;
    const originalMessageSection =
      originalMessage === undefined ? '' : `${DIVIDER}${originalMessage}`;
    const content =
      isIntake && originalMessage !== undefined
        ? `${originalMessage}${sourceLabel}`
        : `${this.renderGigDraftCaption(gigCandidate, postType)}${originalMessageSection}${sourceLabel}`;
    const actionLinks = this.buildActionLinks(params);

    const isNew = status === GigCandidateStatus.New;
    const shouldPreserveTrailingSpace = !isIntake || isNew;
    return `${content}\n${actionLinks.join(' | ')}${shouldPreserveTrailingSpace ? '\n.' : ''}`;
  }

  private buildActionLinks(params: BuildGigCandidateCaptionParams): string[] {
    const adminGigCandidateUrl = this.buildAdminGigCandidateUrl(
      params.gigCandidate.id,
    );
    const openAdminLink = this.telegramTemplates.render(
      TELEGRAM_TEMPLATE_KEYS.gigCandidateLinkOpenAdmin,
      { url: adminGigCandidateUrl },
    );

    if (
      params.postType !== PostType.Intake ||
      params.moderationPost === undefined
    ) {
      return [openAdminLink];
    }

    return [openAdminLink, this.buildModerationPostLink(params.moderationPost)];
  }

  private buildModerationPostLink(moderationPost: GigCandidatePost): string {
    const moderationPostUrl = this.telegramComposer.buildPostUrl({
      chatId: moderationPost.chatId,
      messageId: moderationPost.id,
    });
    if (moderationPostUrl === undefined) {
      throw new BadRequestException(
        'Cannot compose GigCandidate intake post: moderation post URL is unavailable.',
      );
    }

    return this.telegramTemplates.render(
      TELEGRAM_TEMPLATE_KEYS.gigCandidateLinkSeeModerationPost,
      { url: moderationPostUrl },
    );
  }

  private renderGigDraftCaption(
    gigCandidate: GigCandidate,
    postType: GigCandidatePost['type'],
  ): string {
    const { gigDraft, status } = gigCandidate;

    const title = gigDraft.title?.trim();
    const titleLine = title
      ? this.buildTitleLine(status, title, postType)
      : undefined;
    const dates =
      gigDraft.date === undefined
        ? MISSING_CAPTION_FIELD_PLACEHOLDER
        : formatTelegramGigDates(gigDraft.date, gigDraft.endDate);

    return this.telegramTemplates.render(
      TELEGRAM_TEMPLATE_KEYS.mainGigWithoutLink,
      {
        title: getCaptionFieldValue(titleLine),
        dates,
        venue: getCaptionFieldValue(gigDraft.venue),
        ticketsUrl: getCaptionFieldValue(gigDraft.ticketsUrl),
      },
    );
  }

  private buildTitleLine(
    status: GigCandidateStatus,
    title: string,
    postType: GigCandidatePost['type'],
  ): string {
    const escapedTitle = this.escapeTelegramHtmlText(title);
    if (postType === PostType.Intake) {
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

  private buildEditGigCandidateUrl(gigCandidateId: string): string {
    return this.telegramComposer.buildAdminMiniAppUrl(
      AdminMiniAppStartAction.EditGigCandidate,
      gigCandidateId,
    );
  }

  private buildAdminGigCandidateUrl(gigCandidateId: string): string {
    return this.telegramComposer.buildAdminMiniAppUrl(
      AdminMiniAppStartAction.OpenGigCandidate,
      gigCandidateId,
    );
  }

  private requireChannelId(
    chatId: string | undefined,
    envName: string,
    postType: GigCandidatePost['type'],
  ): string {
    if (chatId === undefined) {
      throw new BadRequestException(
        `Cannot compose GigCandidate ${postType.toLowerCase()} post: ${envName} is not configured.`,
      );
    }

    return chatId;
  }
}

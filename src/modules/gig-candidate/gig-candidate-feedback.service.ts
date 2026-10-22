import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Messenger } from '../../shared/types/messenger.enum';
import { getConfigBoolean } from '../../shared/utils/env';
import { GigSourceType } from '../gig/types/gig-source-type.enum';
import { GigSourceUserOriginType } from '../gig/types/gig-source-user-origin-type.enum';
import { TelegramGigCandidateService } from '../telegram/telegram-gig-candidate/telegram-gig-candidate.service';
import type {
  GigCandidateFeedbackChatMessageSubject,
  GigCandidateFeedbackGigTitleSubject,
  GigCandidateFeedbackMessageContent,
} from '../telegram/telegram-gig-candidate/telegram-gig-candidate-composer.service.types';
import { formatTelegramErrorMessage } from '../telegram/utils/telegram-error';
import { UserService } from '../user/user.service';
import { UserRole } from '../user/types/user-role.enum';
import { isGigCandidateSourceMessengerUser } from './gig-candidate-source.guards';
import type { GigCandidate } from './types/gig-candidate.types';

interface GigCandidateLifecycleFeedbackRequest {
  kind: 'submitted' | 'acceptedForModeration' | 'rejected';
  subject?: string;
}

interface GigCandidateFeedbackWithPublicLinkRequest {
  kind: 'acceptedWithPublicLink';
  publicId: string;
  subject: string;
}

export type GigCandidateFeedbackRequest =
  | GigCandidateLifecycleFeedbackRequest
  | GigCandidateFeedbackWithPublicLinkRequest;

@Injectable()
export class GigCandidateFeedbackService {
  private readonly isAdminSubmissionFeedbackEnabled: boolean;
  private readonly logger = new Logger(GigCandidateFeedbackService.name);

  constructor(
    private readonly userService: UserService,
    private readonly telegramGigCandidateService: TelegramGigCandidateService,
    configService: ConfigService,
  ) {
    this.isAdminSubmissionFeedbackEnabled =
      getConfigBoolean(
        configService,
        'SHOULD_SEND_GIG_SUBMISSION_FEEDBACK_TO_ADMINS',
      ) ?? false;
  }

  async sendBestEffort(
    gigCandidate: GigCandidate,
    request: GigCandidateFeedbackRequest,
  ): Promise<void> {
    if (gigCandidate.source.type === GigSourceType.Provider) {
      return;
    }
    if (gigCandidate.source.userId === undefined) {
      return;
    }

    if (
      gigCandidate.source.origin.type === GigSourceUserOriginType.Admin &&
      !this.isAdminSubmissionFeedbackEnabled
    ) {
      return;
    }

    try {
      const user = await this.userService.findActiveUserById(
        gigCandidate.source.userId,
      );
      if (!user) {
        this.logger.warn(
          `GigCandidate feedback skipped because no active User was found for gigCandidateId=${gigCandidate.id}`,
        );
        return;
      }
      if (
        user.roles.includes(UserRole.Admin) &&
        !this.isAdminSubmissionFeedbackEnabled
      ) {
        return;
      }

      const telegramIdentities = user.identities.filter(
        (identity) =>
          identity.type === 'messenger' &&
          identity.messenger === Messenger.Telegram,
      );
      const telegramIdentity = telegramIdentities[0];
      if (!telegramIdentity) {
        this.logger.warn(
          `GigCandidate feedback skipped because no Telegram identity was found for gigCandidateId=${gigCandidate.id}`,
        );
        return;
      }
      if (telegramIdentities.length > 1) {
        this.logger.warn(
          `GigCandidate feedback skipped because multiple Telegram identities were found for gigCandidateId=${gigCandidate.id}`,
        );
        return;
      }

      const content = this.buildFeedbackContent(gigCandidate, request);
      if (content === undefined) {
        this.logger.warn(
          `GigCandidate feedback skipped because title and source message are missing for gigCandidateId=${gigCandidate.id} feedbackKind=${request.kind}`,
        );
        return;
      }

      await this.telegramGigCandidateService.sendFeedback({
        ...content,
        chatId: telegramIdentity.externalUserId,
      });
    } catch (e) {
      this.logger.warn(
        `sendGigCandidateFeedback failed for gigCandidateId=${gigCandidate.id}: ${formatTelegramErrorMessage(e)}`,
      );
    }
  }

  private buildFeedbackContent(
    gigCandidate: GigCandidate,
    request: GigCandidateFeedbackRequest,
  ): GigCandidateFeedbackMessageContent | undefined {
    switch (request.kind) {
      case 'submitted': {
        const subject = this.getGigTitleSubject(request.subject);
        if (subject === undefined) {
          return;
        }
        return { kind: request.kind, subject };
      }
      case 'acceptedForModeration':
      case 'rejected': {
        const chatMessageSubject = this.getChatMessageSubject(gigCandidate);
        if (chatMessageSubject !== undefined) {
          return { kind: request.kind, subject: chatMessageSubject };
        }

        const subject = this.getGigTitleSubject(request.subject);
        if (subject === undefined) {
          return;
        }
        return { kind: request.kind, subject };
      }
      case 'acceptedWithPublicLink': {
        const subject = this.getGigTitleSubject(request.subject);
        if (subject === undefined) {
          return;
        }
        return {
          kind: request.kind,
          publicId: request.publicId,
          subject,
        };
      }
    }
  }

  private getGigTitleSubject(
    title: string | undefined,
  ): GigCandidateFeedbackGigTitleSubject | undefined {
    const normalizedTitle = title?.trim();
    if (!normalizedTitle) {
      return;
    }
    return { type: 'gigTitle', title: normalizedTitle };
  }

  private getChatMessageSubject(
    gigCandidate: GigCandidate,
  ): GigCandidateFeedbackChatMessageSubject | undefined {
    return isGigCandidateSourceMessengerUser(gigCandidate.source)
      ? {
          type: 'chatMessage',
          chatId: gigCandidate.source.origin.message.chatId,
          messageId: gigCandidate.source.origin.message.messageId,
        }
      : undefined;
  }
}

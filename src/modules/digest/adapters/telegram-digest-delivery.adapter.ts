import { Injectable } from '@nestjs/common';
import { TelegramDigestSendError } from '@modules/telegram/telegram-digest/telegram-digest.error';
import { TelegramDigestService } from '@modules/telegram/telegram-digest/telegram-digest.service';
import type { PlainGig } from '@modules/gig/types/gig.types';
import { DigestDeliveryError } from '../digest-delivery';
import type {
  DigestDelivery,
  DigestDeliveryErrorParams,
  DigestDeliveryResult,
} from '../digest-delivery';

@Injectable()
export class TelegramDigestDeliveryAdapter implements DigestDelivery {
  constructor(private readonly telegramDigestService: TelegramDigestService) {}

  async sendWeeklyDigest(
    gigs: PlainGig[],
  ): Promise<DigestDeliveryResult | undefined> {
    try {
      return await this.telegramDigestService.sendWeeklyDigestPost(gigs);
    } catch (e) {
      if (!(e instanceof TelegramDigestSendError)) {
        throw e;
      }

      const errorParams: DigestDeliveryErrorParams = {
        message: e.message,
        cause: e,
        provider: 'telegram',
        providerOperation: e.providerOperation,
      };
      if (e.status !== undefined) {
        errorParams.status = e.status;
      }
      if (e.code !== undefined) {
        errorParams.code = e.code;
      }
      if (e.telegramErrorCode !== undefined) {
        errorParams.providerErrorCode = e.telegramErrorCode;
      }
      if (e.telegramDescription !== undefined) {
        errorParams.providerDescription = e.telegramDescription;
      }
      if (e.telegramError !== undefined) {
        errorParams.providerFailureCode = e.telegramError;
      }
      if (e.mediaPosition !== undefined) {
        errorParams.failedItemPosition = e.mediaPosition;
      }
      if (e.gigPublicId !== undefined) {
        errorParams.gigPublicId = e.gigPublicId;
      }
      if (e.posterUrl !== undefined) {
        errorParams.mediaUrl = e.posterUrl;
      }

      throw new DigestDeliveryError(errorParams);
    }
  }
}

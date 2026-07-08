import { Injectable } from '@nestjs/common';
import { TranslationCacheService } from '../translation/translation-cache.service';
import { TranslationTemplateService } from '../translation/translation-template.service';
import type { PlainTemplateParams } from '../translation/types/translation-template.types';
import type { TranslationBundleEntry } from '../translation/types/translation.types';
import type { TelegramTemplateKey } from './telegram-template-keys';

export type { PlainTemplateParams } from '../translation/types/translation-template.types';

export const TELEGRAM_TEMPLATE_DEFAULT_LOCALE = 'en';

export const TELEGRAM_TEMPLATE_NAMESPACE = 'telegram';

@Injectable()
export class TelegramTemplateService {
  constructor(
    private readonly translationCacheService: TranslationCacheService,
    private readonly translationTemplateService: TranslationTemplateService,
  ) {}

  getText(
    key: TelegramTemplateKey,
    locale: string = TELEGRAM_TEMPLATE_DEFAULT_LOCALE,
  ): string {
    const entry = this.getEntry(key, locale);
    return entry.value;
  }

  render(
    key: TelegramTemplateKey,
    params: PlainTemplateParams,
    locale: string = TELEGRAM_TEMPLATE_DEFAULT_LOCALE,
  ): string {
    const entry = this.getEntry(key, locale);
    return this.translationTemplateService.render({ entry, params });
  }

  private getEntry(
    key: TelegramTemplateKey,
    locale: string,
  ): TranslationBundleEntry {
    return this.translationCacheService.getEntry({
      namespace: TELEGRAM_TEMPLATE_NAMESPACE,
      key,
      locale,
    });
  }
}

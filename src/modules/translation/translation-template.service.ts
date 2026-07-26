import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { renderPlainTemplateString } from './plain-template.renderer';
import type { RenderTranslationTemplateParams } from './types/translation-template.types';

@Injectable()
export class TranslationTemplateService {
  render(params: RenderTranslationTemplateParams): string {
    const entry = params.entry;

    if (entry.kind !== 'template') {
      throw new InternalServerErrorException(
        `Translation "${entry.key}" is not a template.`,
      );
    }

    if (entry.format === 'icu') {
      throw new InternalServerErrorException(
        `Translation template "${entry.key}" uses unsupported ICU format.`,
      );
    }

    if (entry.format !== 'plain') {
      throw new InternalServerErrorException(
        `Translation template "${entry.key}" uses unsupported format "${entry.format}".`,
      );
    }

    return renderPlainTemplateString(entry.value, params.params);
  }
}

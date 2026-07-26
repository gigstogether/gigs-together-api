import { Controller, Get, Headers, Query, Version } from '@nestjs/common';
import { TranslationService } from './translation.service';
import type { V1TranslationGetTranslationsResponseBody } from './types/requests/v1-translation-get-translations-request';

@Controller('locale')
export class TranslationController {
  constructor(private readonly translationService: TranslationService) {}

  @Version('1')
  @Get('translations')
  getTranslationsV1(
    @Query('namespaces')
    namespacesQuery: string | readonly string[] | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
  ): V1TranslationGetTranslationsResponseBody {
    return this.translationService.getTranslationsV1({
      acceptLanguage,
      namespacesQuery,
    });
  }
}

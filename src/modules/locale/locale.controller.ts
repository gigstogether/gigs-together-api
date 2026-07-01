import { Controller, Get, Headers, Query, Version } from '@nestjs/common';
import { LocaleService } from './locale.service';
import type { SupportedLocale } from './types/locale.types';
import { V1LocaleGetTranslationsResponseBody } from './types/requests/v1-locale-get-translations-request';

@Controller('locale')
export class LocaleController {
  constructor(private readonly localeService: LocaleService) {}

  @Version('1')
  @Get()
  getLocalesV1(): Promise<readonly SupportedLocale[]> {
    return this.localeService.getLocalesV1();
  }

  @Version('1')
  @Get('translations')
  getTranslationsV1(
    @Query('namespaces')
    namespacesQuery: string | readonly string[] | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
  ): Promise<V1LocaleGetTranslationsResponseBody> {
    return this.localeService.getTranslationsV1({
      acceptLanguage,
      namespacesQuery,
    });
  }
}

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  Version,
} from '@nestjs/common';
import { AuthorizationService } from '../auth/authorization.service';
import { TranslationCacheService } from '../translation/translation-cache.service';
import { InternalApiKeyGuard } from './guards/internal-api-key.guard';
import { V1InternalRevalidateTranslationsBodyDto } from './types/requests/v1-internal-revalidate-translations-body';

/**
 * Internal platform hooks for scripts, deploy pipelines, and on-call tooling.
 * Requires `x-internal-api-key` matching configured INTERNAL_API_KEY.
 */
@Controller('internal')
export class InternalController {
  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly translationCacheService: TranslationCacheService,
  ) {}

  @Version('1')
  @Post('admins/revalidate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(InternalApiKeyGuard)
  revalidateAdminsCache(): Promise<void> {
    return this.authorizationService.refreshAdminsCache();
  }

  @Version('1')
  @Post('translations/revalidate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(InternalApiKeyGuard)
  revalidateTranslationsCache(
    @Body() body: V1InternalRevalidateTranslationsBodyDto,
  ): Promise<void> {
    return this.translationCacheService.revalidateNamespace({
      namespace: body.namespace,
    });
  }
}

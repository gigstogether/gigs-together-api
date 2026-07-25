import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  Version,
} from '@nestjs/common';
import { AccessJwtAuthGuard } from '../auth/guards/access-jwt-auth.guard';
import { AuthenticatedUserGuard } from '../auth/guards/authenticated-user.guard';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminGigService } from './admin-gig.service';
import { AdminGuard } from '../auth/guards/admin.guard';
import type { V1AdminDashboardResponseBody } from './types/requests/v1-admin-dashboard-response';
import { V1AdminGigsGetQueryDto } from './types/requests/v1-admin-gigs-get-query';
import type { V1AdminGigsListResponseBody } from './types/requests/v1-admin-gigs-list-response';
import {
  V1AdminLocalePatchBodyDto,
  V1AdminLocalesOrderPatchBodyDto,
} from './types/requests/v1-admin-locale-patch-body';
import { LocaleService } from '../locale/locale.service';
import type { SupportedLocale } from '../locale/types/locale.types';
import { TranslationService } from '../translation/translation.service';
import type { StoredTranslationRecord } from '../translation/types/translation-record.types';
import { V1AdminTranslationSetActiveBodyDto } from './types/requests/v1-admin-translation-set-active-body';
import { V1AdminTranslationUpsertBodyDto } from './types/requests/v1-admin-translation-upsert-body';
import { V1AdminTranslationsGetQueryDto } from './types/requests/v1-admin-translations-get-query';
import type { V1AdminTranslationNamespacesListResponseBody } from './types/requests/v1-admin-translation-namespaces-list-response';
import type { V1AdminTranslationsListResponseBody } from './types/requests/v1-admin-translations-list-response';
import { V1GigByPublicIdGetRequestParams } from '../gig/types/requests/v1-gig-by-public-id-get-request';
import type { GigFormData } from '../gig/types/gig.types';
import { GigModerationService } from '../gig/gig-moderation.service';
import { DigestService } from '../digest/digest.service';
import { TranslationRevalidateService } from '../translation/translation-revalidate.service';

/** Admin UI API: dashboard, moderation, locales, translations, and manual digest publish. */
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminDashboardService: AdminDashboardService,
    private readonly adminGigService: AdminGigService,
    private readonly localeService: LocaleService,
    private readonly translationService: TranslationService,
    private readonly translationRevalidateService: TranslationRevalidateService,
    private readonly gigModerationService: GigModerationService,
    private readonly digestService: DigestService,
  ) {}

  @Version('1')
  @Get('dashboard')
  @UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
  getDashboard(): Promise<V1AdminDashboardResponseBody> {
    return this.adminDashboardService.getDashboard();
  }

  @Version('1')
  @Get('gigs')
  @UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
  getGigs(
    @Query() query: V1AdminGigsGetQueryDto,
  ): Promise<V1AdminGigsListResponseBody> {
    return this.adminGigService.getGigsList(query);
  }

  @Version('1')
  @Get('gig/:publicId')
  @UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
  getGigByPublicId(
    @Param() params: V1GigByPublicIdGetRequestParams,
  ): Promise<GigFormData> {
    return this.adminGigService.getGigByPublicId(params.publicId);
  }

  @Version('1')
  @Post('gig/:publicId/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
  approveGigByPublicId(
    @Param() params: V1GigByPublicIdGetRequestParams,
  ): Promise<void> {
    return this.gigModerationService.approveGig({ publicId: params.publicId });
  }

  @Version('1')
  @Post('gig/:publicId/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
  rejectGigByPublicId(
    @Param() params: V1GigByPublicIdGetRequestParams,
  ): Promise<void> {
    return this.gigModerationService.rejectGig({ publicId: params.publicId });
  }

  @Version('1')
  @Post('gig/:publicId/post')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
  publishGigPostByPublicId(
    @Param() params: V1GigByPublicIdGetRequestParams,
  ): Promise<void> {
    return this.gigModerationService.publishGigPost({
      publicId: params.publicId,
    });
  }

  @Version('1')
  @Post('digest/publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
  publishDigest(): Promise<void> {
    return this.digestService.publish();
  }

  @Version('1')
  @Post('translations/revalidate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
  revalidateTranslations(): Promise<void> {
    return this.translationRevalidateService.revalidateAll();
  }

  @Version('1')
  @Get('locales')
  @UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
  getLocales(): Promise<readonly SupportedLocale[]> {
    return this.localeService.getAllLocalesOrdered();
  }

  @Version('1')
  @Patch('locales/order')
  @UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
  patchLocalesOrder(
    @Body() body: V1AdminLocalesOrderPatchBodyDto,
  ): Promise<readonly SupportedLocale[]> {
    return this.localeService.updateLocalesOrder({
      locales: body.locales,
    });
  }

  @Version('1')
  @Patch('locales/:iso')
  @UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
  patchLocale(
    @Param('iso') iso: string,
    @Body() body: V1AdminLocalePatchBodyDto,
  ): Promise<SupportedLocale> {
    return this.localeService.updateLocaleByIso({ iso, ...body });
  }

  @Version('1')
  @Get('translations/namespaces')
  @UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
  async getTranslationNamespaces(): Promise<V1AdminTranslationNamespacesListResponseBody> {
    const namespaces = await this.translationService.listDistinctNamespaces();

    return { namespaces };
  }

  @Version('1')
  @Get('translations')
  @UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
  async getTranslations(
    @Query() query: V1AdminTranslationsGetQueryDto,
  ): Promise<V1AdminTranslationsListResponseBody> {
    const records = await this.translationService.listRecords({
      namespace: query.namespace,
      locale: query.locale,
    });

    return { records };
  }

  @Version('1')
  @Put('translations')
  @UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
  upsertTranslation(
    @Body() body: V1AdminTranslationUpsertBodyDto,
  ): Promise<StoredTranslationRecord> {
    return this.translationService.upsertRecord(body);
  }

  @Version('1')
  @Patch('translations/:id/active')
  @UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
  patchTranslationActive(
    @Param('id') id: string,
    @Body() body: V1AdminTranslationSetActiveBodyDto,
  ): Promise<StoredTranslationRecord> {
    return this.translationService.setActiveById({
      id,
      isActive: body.isActive,
    });
  }
}

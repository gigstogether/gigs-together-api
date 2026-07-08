import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import { V1GigByPublicIdGetRequestParams } from '../gig/types/requests/v1-gig-by-public-id-get-request';
import type { GigFormData } from '../gig/types/gig.types';
import { GigModerationService } from '../gig/gig-moderation.service';
import { DigestService } from '../digest/digest.service';

/** Admin UI API: dashboard, moderation, locales, and manual digest publish. */
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminDashboardService: AdminDashboardService,
    private readonly adminGigService: AdminGigService,
    private readonly localeService: LocaleService,
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
}

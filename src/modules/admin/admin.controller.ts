import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
  Version,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessJwtAuthGuard } from '../auth/guards/access-jwt-auth.guard';
import { AuthenticatedUserGuard } from '../auth/guards/authenticated-user.guard';
import { AuthorizationService } from '../auth/authorization.service';
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

/**
 * Manual admin-list cache refresh (e.g. after DB migration).
 * Requires ADMIN_REVALIDATE_SECRET; if unset, POST returns 503 (TTL refresh still works without it).
 */
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminDashboardService: AdminDashboardService,
    private readonly adminGigService: AdminGigService,
    private readonly authorizationService: AuthorizationService,
    private readonly configService: ConfigService,
    private readonly localeService: LocaleService,
    private readonly gigModerationService: GigModerationService,
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

  @Post('revalidate')
  async revalidateAdmins(
    @Headers('x-admin-revalidate-secret') secretHeader: string | undefined,
  ): Promise<{ readonly ok: true }> {
    const secret = (
      this.configService.get<string>('ADMIN_REVALIDATE_SECRET') ?? ''
    ).trim();
    if (!secret) {
      throw new ServiceUnavailableException(
        'ADMIN_REVALIDATE_SECRET is not configured',
      );
    }
    const provided = (secretHeader ?? '').trim();
    if (!provided || provided !== secret) {
      throw new UnauthorizedException();
    }
    await this.authorizationService.refreshAdminsCache();
    return { ok: true };
  }
}

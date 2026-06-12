import {
  Body,
  Controller,
  Get,
  Headers,
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
  V1AdminLanguagePatchBodyDto,
  V1AdminLanguagesOrderPatchBodyDto,
} from './types/requests/v1-admin-language-patch-body';
import { LanguageService } from '../language/language.service';
import type { SupportedLanguage } from '../language/types/language.types';
import { V1GigByPublicIdGetRequestParams } from '../gig/types/requests/v1-gig-by-public-id-get-request';
import type { GigFormDataByPublicId } from '../gig/types/gig.types';

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
    private readonly languageService: LanguageService,
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
  ): Promise<GigFormDataByPublicId> {
    return this.adminGigService.getGigByPublicId(params.publicId);
  }

  @Version('1')
  @Get('languages')
  @UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
  getLanguages(): Promise<readonly SupportedLanguage[]> {
    return this.languageService.getAllLanguagesOrdered();
  }

  @Version('1')
  @Patch('languages/order')
  @UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
  patchLanguagesOrder(
    @Body() body: V1AdminLanguagesOrderPatchBodyDto,
  ): Promise<readonly SupportedLanguage[]> {
    return this.languageService.updateLanguagesOrder({
      languages: body.languages,
    });
  }

  @Version('1')
  @Patch('languages/:iso')
  @UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
  patchLanguage(
    @Param('iso') iso: string,
    @Body() body: V1AdminLanguagePatchBodyDto,
  ): Promise<SupportedLanguage> {
    return this.languageService.updateLanguageByIso({ iso, ...body });
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

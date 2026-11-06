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
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { AccessJwtAuthGuard } from '@modules/auth/guards/access-jwt-auth.guard';
import { AdminGuard } from '@modules/auth/guards/admin.guard';
import { AuthenticatedUserGuard } from '@modules/auth/guards/authenticated-user.guard';
import { GigService } from '@modules/gig/gig.service';
import type { GigFormData } from '@modules/gig/types/gig.types';
import { V1GigByPublicIdGetRequestParams } from '@modules/gig/types/requests/v1-gig-by-public-id-get-request';
import { AdminGigService } from './admin-gig.service';
import { AdminGigUpdateBodyPipe } from './pipes/admin-gig-update-body.pipe';
import type { AdminGigUpdateBody } from './pipes/admin-gig-update-body.pipe';
import {
  V1AdminGigVersionedActionBodyDto,
  V1AdminGigVisibilityPatchBodyDto,
} from './types/requests/v1-admin-gig-actions-request';
import type {
  V1AdminGigUpdateResponseBody,
  V1AdminGigVisibilityPatchResponseBody,
} from './types/requests/v1-admin-gig-actions-response';
import { V1AdminGigsGetQueryDto } from './types/requests/v1-admin-gigs-get-query';
import type { V1AdminGigsListResponseBody } from './types/requests/v1-admin-gigs-list-response';

const PosterFileInterceptor = FileInterceptor('posterFile', {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

@Controller('admin/gigs')
@UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
export class AdminGigController {
  constructor(
    private readonly adminGigService: AdminGigService,
    private readonly gigService: GigService,
  ) {}

  @Version('1')
  @Get()
  getGigs(
    @Query() query: V1AdminGigsGetQueryDto,
  ): Promise<V1AdminGigsListResponseBody> {
    return this.adminGigService.getGigsList(query);
  }

  @Version('1')
  @Get(':publicId')
  getGigByPublicId(
    @Param() params: V1GigByPublicIdGetRequestParams,
  ): Promise<GigFormData> {
    return this.adminGigService.getGigByPublicId(params.publicId);
  }

  @Version('1')
  @Post(':publicId/main-post')
  @HttpCode(HttpStatus.NO_CONTENT)
  createGigMainPostByPublicId(
    @Param() params: V1GigByPublicIdGetRequestParams,
    @Body() body: V1AdminGigVersionedActionBodyDto,
  ): Promise<void> {
    return this.gigService.createGigMainPost({
      publicId: params.publicId,
      expectedVersion: body.expectedVersion,
    });
  }

  @Version('1')
  @Patch(':publicId')
  @UseInterceptors(PosterFileInterceptor)
  updateGigByPublicId(
    @Param() params: V1GigByPublicIdGetRequestParams,
    @UploadedFile() posterFile: Express.Multer.File | undefined,
    @Body(AdminGigUpdateBodyPipe) body: AdminGigUpdateBody,
  ): Promise<V1AdminGigUpdateResponseBody> {
    return this.gigService.updateGigByPublicId({
      publicId: params.publicId,
      expectedVersion: body.expectedVersion,
      gig: body.gig,
      posterFile,
    });
  }

  @Version('1')
  @Patch(':publicId/visibility')
  updateGigVisibilityByPublicId(
    @Param() params: V1GigByPublicIdGetRequestParams,
    @Body() body: V1AdminGigVisibilityPatchBodyDto,
  ): Promise<V1AdminGigVisibilityPatchResponseBody> {
    return this.gigService.updateGigVisibilityByPublicId({
      publicId: params.publicId,
      expectedVersion: body.expectedVersion,
      isVisible: body.isVisible,
    });
  }
}

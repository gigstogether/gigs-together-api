import {
  BadRequestException,
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
  UseFilters,
  UseGuards,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { AuthenticatedUser } from '../auth/decorators/authenticated-user.decorator';
import { AccessJwtAuthGuard } from '../auth/guards/access-jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AuthenticatedUserGuard } from '../auth/guards/authenticated-user.guard';
import type { User } from '../auth/types/user.types';
import { GigCandidateService } from '../gig-candidate/gig-candidate.service';
import { AdminGigCandidateService } from './admin-gig-candidate.service';
import {
  mapV1AdminCreateGigCandidateRequest,
  mapV1AdminGigCandidateLookupResponse,
  mapV1AdminGigCandidateResponse,
  mapV1AdminGigCandidatesListResponse,
  mapV1AdminGigCandidatesQuery,
  mapV1AdminUpdateGigCandidateDraftRequest,
} from './admin-gig-candidate.mapper';
import { GigCandidateConflictFilter } from './filters/gig-candidate-conflict.filter';
import { GigCandidateApprovalValidationFilter } from './filters/gig-candidate-approval-validation.filter';
import {
  AdminGigCandidateApproveBodyPipe,
  AdminGigCandidateCreateBodyPipe,
  AdminGigCandidateDraftUpdateBodyPipe,
  AdminGigCandidateLookupBodyPipe,
  AdminGigCandidateRejectBodyPipe,
  AdminGigCandidateSendToModerationBodyPipe,
} from './pipes/admin-gig-candidate-body.pipe';
import type {
  V1AdminCreateGigCandidateRequestBody,
  V1AdminApproveGigCandidateRequestBody,
  V1AdminGigCandidateLookupRequestBody,
  V1AdminGigCandidateLookupResponseBody,
  V1AdminRejectGigCandidateRequestBody,
  V1AdminSendGigCandidateToModerationRequestBody,
  V1AdminUpdateGigCandidateDraftRequestBody,
} from './types/requests/v1-admin-gig-candidate-requests';
import { V1AdminGigCandidatesGetQueryDto } from './types/requests/v1-admin-gig-candidates-get-query';
import type {
  V1AdminGigCandidateResponseBody,
  V1AdminGigCandidatesListResponseBody,
} from './types/requests/v1-admin-gig-candidates-response';

const GigCandidatePosterFileInterceptor = FileInterceptor('posterFile', {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype?.startsWith('image/')) {
      return cb(new BadRequestException('posterFile must be an image'), false);
    }
    cb(null, true);
  },
});

@Controller('admin/gig-candidates')
@UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
export class AdminGigCandidateController {
  constructor(
    private readonly gigCandidateService: GigCandidateService,
    private readonly adminGigCandidateService: AdminGigCandidateService,
  ) {}

  @Version('1')
  @Get()
  async getGigCandidates(
    @Query() query: V1AdminGigCandidatesGetQueryDto,
  ): Promise<V1AdminGigCandidatesListResponseBody> {
    const gigCandidates = await this.adminGigCandidateService.getList(
      mapV1AdminGigCandidatesQuery(query),
    );
    return mapV1AdminGigCandidatesListResponse(gigCandidates);
  }

  @Version('1')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(GigCandidatePosterFileInterceptor)
  async createGigCandidate(
    @UploadedFile() posterFile: Express.Multer.File | undefined,
    @AuthenticatedUser() user: User,
    @Body(AdminGigCandidateCreateBodyPipe)
    body: V1AdminCreateGigCandidateRequestBody,
  ): Promise<V1AdminGigCandidateResponseBody> {
    const gigCandidate = await this.gigCandidateService.createAdminGigCandidate(
      mapV1AdminCreateGigCandidateRequest({
        body,
        userId: user.userId,
        posterFile,
      }),
    );
    const details =
      await this.adminGigCandidateService.resolveGigCandidate(gigCandidate);
    return mapV1AdminGigCandidateResponse(details);
  }

  @Version('1')
  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  async lookupGigCandidateDraft(
    @Body(AdminGigCandidateLookupBodyPipe)
    body: V1AdminGigCandidateLookupRequestBody,
  ): Promise<V1AdminGigCandidateLookupResponseBody> {
    const gigDraft =
      await this.gigCandidateService.lookupGigCandidateDraft(body);
    return mapV1AdminGigCandidateLookupResponse(gigDraft);
  }

  @Version('1')
  @Get(':id')
  async getGigCandidateById(
    @Param('id') id: string,
  ): Promise<V1AdminGigCandidateResponseBody> {
    const gigCandidate = await this.adminGigCandidateService.getById(id);
    return mapV1AdminGigCandidateResponse(gigCandidate);
  }

  @Version('1')
  @Patch(':id/gig-draft')
  @UseInterceptors(GigCandidatePosterFileInterceptor)
  @UseFilters(GigCandidateConflictFilter)
  async updateGigCandidateDraft(
    @Param('id') id: string,
    @UploadedFile() posterFile: Express.Multer.File | undefined,
    @Body(AdminGigCandidateDraftUpdateBodyPipe)
    body: V1AdminUpdateGigCandidateDraftRequestBody,
  ): Promise<V1AdminGigCandidateResponseBody> {
    const gigCandidate =
      await this.gigCandidateService.updateAdminGigCandidateDraft(
        mapV1AdminUpdateGigCandidateDraftRequest({
          body,
          gigCandidateId: id,
          posterFile,
        }),
      );
    const details =
      await this.adminGigCandidateService.resolveGigCandidate(gigCandidate);
    return mapV1AdminGigCandidateResponse(details);
  }

  @Version('1')
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @UseFilters(GigCandidateConflictFilter, GigCandidateApprovalValidationFilter)
  async approveGigCandidate(
    @Param('id') id: string,
    @AuthenticatedUser() user: User,
    @Body(AdminGigCandidateApproveBodyPipe)
    body: V1AdminApproveGigCandidateRequestBody,
  ): Promise<V1AdminGigCandidateResponseBody> {
    await this.gigCandidateService.approveGigCandidate({
      gigCandidateId: id,
      expectedVersion: body.expectedVersion,
      approvedByUserId: user.userId,
    });
    const gigCandidate = await this.adminGigCandidateService.getById(id);
    return mapV1AdminGigCandidateResponse(gigCandidate);
  }

  @Version('1')
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @UseFilters(GigCandidateConflictFilter)
  async rejectGigCandidate(
    @Param('id') id: string,
    @AuthenticatedUser() user: User,
    @Body(AdminGigCandidateRejectBodyPipe)
    body: V1AdminRejectGigCandidateRequestBody,
  ): Promise<V1AdminGigCandidateResponseBody> {
    const gigCandidate = await this.gigCandidateService.rejectGigCandidate({
      gigCandidateId: id,
      expectedVersion: body.expectedVersion,
      rejectedByUserId: user.userId,
    });
    const details =
      await this.adminGigCandidateService.resolveGigCandidate(gigCandidate);
    return mapV1AdminGigCandidateResponse(details);
  }

  @Version('1')
  @Post(':id/send-to-moderation')
  @HttpCode(HttpStatus.OK)
  @UseFilters(GigCandidateConflictFilter)
  async sendGigCandidateToModeration(
    @Param('id') id: string,
    @Body(AdminGigCandidateSendToModerationBodyPipe)
    body: V1AdminSendGigCandidateToModerationRequestBody,
  ): Promise<V1AdminGigCandidateResponseBody> {
    const gigCandidate =
      await this.gigCandidateService.sendGigCandidateToModeration({
        gigCandidateId: id,
        expectedVersion: body.expectedVersion,
      });
    const details =
      await this.adminGigCandidateService.resolveGigCandidate(gigCandidate);
    return mapV1AdminGigCandidateResponse(details);
  }
}

import {
  Body,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AccessJwtAuthGuard } from '../auth/guards/access-jwt-auth.guard';
import { AuthenticatedUserGuard } from '../auth/guards/authenticated-user.guard';
import { AuthenticatedUser } from '../auth/decorators/authenticated-user.decorator';
import type { User } from '../auth/types/user.types';
import { GigCandidateBodyPipe } from './pipes/gig-candidate-body.pipe';
import type { V1CreateGigCandidateRequestBody } from './types/requests/v1-create-gig-candidate-request';
import type { V1CreateGigCandidateResponseBody } from './types/requests/v1-create-gig-candidate-response';
import { GigCandidateService } from './gig-candidate.service';
import type {
  CreatePublicGigCandidateParams,
  PublicGigCandidateInput,
} from './gig-candidate.service';

const PosterFileInterceptor = FileInterceptor('posterFile', {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

@Controller('gig-candidates')
export class GigCandidateController {
  constructor(private readonly gigCandidateService: GigCandidateService) {}

  @Version('1')
  @Post()
  @HttpCode(201)
  @UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard)
  @UseInterceptors(PosterFileInterceptor)
  createGigCandidate(
    @UploadedFile() posterFile: Express.Multer.File | undefined,
    @AuthenticatedUser() user: User,
    @Body(GigCandidateBodyPipe) body: V1CreateGigCandidateRequestBody,
  ): Promise<V1CreateGigCandidateResponseBody> {
    const params = mapV1CreateGigCandidateRequest(body, user, posterFile);

    return this.gigCandidateService.createPublicGigCandidate(params);
  }
}

function mapV1CreateGigCandidateRequest(
  body: V1CreateGigCandidateRequestBody,
  user: User,
  posterFile: Express.Multer.File | undefined,
): CreatePublicGigCandidateParams {
  const gig: PublicGigCandidateInput = {
    communityId: body.gig.communityId,
    localityId: body.gig.localityId,
    title: body.gig.title,
    date: body.gig.date,
  };
  if (body.gig.venueIds !== undefined) {
    gig.venueIds = body.gig.venueIds;
  }
  if (body.gig.endDate !== undefined) {
    gig.endDate = body.gig.endDate;
  }
  if (body.gig.ticketsUrl !== undefined) {
    gig.ticketsUrl = body.gig.ticketsUrl;
  }
  if (body.gig.posterUrl !== undefined) {
    gig.posterUrl = body.gig.posterUrl;
  }

  const params: CreatePublicGigCandidateParams = {
    gig,
    user,
  };
  if (posterFile !== undefined) {
    params.posterFile = {
      buffer: posterFile.buffer,
      mimetype: posterFile.mimetype,
    };
  }

  return params;
}

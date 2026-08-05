import {
  BadRequestException,
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

const PosterFileInterceptor = FileInterceptor('posterFile', {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype?.startsWith('image/')) {
      return cb(new BadRequestException('posterFile must be an image'), false);
    }
    cb(null, true);
  },
});

@Controller('gig-candidate')
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
    return this.gigCandidateService.handleSubmit({
      body,
      user,
      posterFile,
    });
  }
}

import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  Version,
} from '@nestjs/common';

import { AccessJwtAuthGuard } from '@modules/auth/guards/access-jwt-auth.guard';
import { AdminGuard } from '@modules/auth/guards/admin.guard';
import { AuthenticatedUserGuard } from '@modules/auth/guards/authenticated-user.guard';
import { DigestService } from '@modules/digest/digest.service';

@Controller('admin/digest')
@UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
export class AdminDigestController {
  constructor(private readonly digestService: DigestService) {}

  @Version('1')
  @Post('post')
  @HttpCode(HttpStatus.NO_CONTENT)
  createDigestPost(): Promise<void> {
    return this.digestService.createPost();
  }
}

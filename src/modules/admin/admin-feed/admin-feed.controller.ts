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
import { GigFeedRevalidationService } from '@modules/gig/gig-feed/gig-feed-revalidation.service';

@Controller('admin/feed')
@UseGuards(AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard)
export class AdminFeedController {
  constructor(
    private readonly gigFeedRevalidationService: GigFeedRevalidationService,
  ) {}

  @Version('1')
  @Post('revalidate')
  @HttpCode(HttpStatus.NO_CONTENT)
  revalidateGigFeeds(): Promise<void> {
    return this.gigFeedRevalidationService.revalidateGigFeedsOrThrow({});
  }
}

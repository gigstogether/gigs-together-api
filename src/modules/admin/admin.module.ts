import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { BucketModule } from '@modules/bucket/bucket.module';
import { DigestModule } from '@modules/digest/digest.module';
import { GigCandidateModule } from '@modules/gig-candidate/gig-candidate.module';
import { GigModule } from '@modules/gig/gig.module';
import { LocaleModule } from '@modules/locale/locale.module';
import { LocationModule } from '@modules/location/location.module';
import { TelegramModule } from '@modules/telegram/telegram.module';
import { TranslationModule } from '@modules/translation/translation.module';
import { UserModule } from '@modules/user/user.module';
import { AdminDashboardController } from './admin-dashboard/admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard/admin-dashboard.service';
import { AdminDigestController } from './admin-digest/admin-digest.controller';
import { AdminFeedController } from './admin-feed/admin-feed.controller';
import { AdminGigCandidateController } from './admin-gig-candidate/admin-gig-candidate.controller';
import { AdminGigCandidateService } from './admin-gig-candidate/admin-gig-candidate.service';
import { AdminGigCandidateApprovalValidationFilter } from './admin-gig-candidate/filters/admin-gig-candidate-approval-validation.filter';
import { AdminGigCandidateConflictFilter } from './admin-gig-candidate/filters/admin-gig-candidate-conflict.filter';
import {
  AdminGigCandidateApproveBodyPipe,
  AdminGigCandidateCreateBodyPipe,
  AdminGigCandidateDraftUpdateBodyPipe,
  AdminGigCandidateLookupBodyPipe,
  AdminGigCandidateRejectBodyPipe,
  AdminGigCandidateSendToModerationBodyPipe,
} from './admin-gig-candidate/pipes/admin-gig-candidate-body.pipe';
import { AdminGigController } from './admin-gig/admin-gig.controller';
import { AdminGigService } from './admin-gig/admin-gig.service';
import { AdminGigUpdateBodyPipe } from './admin-gig/pipes/admin-gig-update-body.pipe';
import { AdminLocaleController } from './admin-locale/admin-locale.controller';
import { AdminLocalityController } from './admin-locality/admin-locality.controller';
import { AdminPlaceController } from './admin-place/admin-place.controller';
import { AdminRegionController } from './admin-region/admin-region.controller';
import { AdminTranslationController } from './admin-translation/admin-translation.controller';

/** Admin UI API composition root for domain-oriented administration features. */
@Module({
  imports: [
    AuthModule,
    DigestModule,
    GigModule,
    LocaleModule,
    TranslationModule,
    TelegramModule,
    GigCandidateModule,
    LocationModule,
    UserModule,
    BucketModule,
  ],
  controllers: [
    AdminDashboardController,
    AdminDigestController,
    AdminFeedController,
    AdminGigController,
    AdminGigCandidateController,
    AdminLocaleController,
    AdminLocalityController,
    AdminPlaceController,
    AdminRegionController,
    AdminTranslationController,
  ],
  providers: [
    AdminDashboardService,
    AdminGigService,
    AdminGigCandidateService,
    AdminGigCandidateCreateBodyPipe,
    AdminGigCandidateApproveBodyPipe,
    AdminGigCandidateDraftUpdateBodyPipe,
    AdminGigCandidateLookupBodyPipe,
    AdminGigCandidateRejectBodyPipe,
    AdminGigCandidateSendToModerationBodyPipe,
    AdminGigCandidateConflictFilter,
    AdminGigCandidateApprovalValidationFilter,
    AdminGigUpdateBodyPipe,
  ],
  exports: [AdminDashboardService, AdminGigService],
})
export class AdminModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DigestModule } from '../digest/digest.module';
import { GigModule } from '../gig/gig.module';
import { LocaleModule } from '../locale/locale.module';
import { TranslationModule } from '../translation/translation.module';
import { AdminController } from './admin.controller';
import { AdminGigCandidateController } from './admin-gig-candidate.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminGigService } from './admin-gig.service';
import { TelegramModule } from '../telegram/telegram.module';
import { GigCandidateModule } from '../gig-candidate/gig-candidate.module';
import { AdminGigCandidateService } from './admin-gig-candidate.service';
import {
  AdminGigCandidateCreateBodyPipe,
  AdminGigCandidateApproveBodyPipe,
  AdminGigCandidateDraftUpdateBodyPipe,
  AdminGigCandidateLookupBodyPipe,
  AdminGigCandidateRejectBodyPipe,
  AdminGigCandidateSendToModerationBodyPipe,
} from './pipes/admin-gig-candidate-body.pipe';
import { GigCandidateConflictFilter } from './filters/gig-candidate-conflict.filter';
import { GigCandidateApprovalValidationFilter } from './filters/gig-candidate-approval-validation.filter';

@Module({
  imports: [
    AuthModule,
    DigestModule,
    GigModule,
    LocaleModule,
    TranslationModule,
    TelegramModule,
    GigCandidateModule,
  ],
  controllers: [AdminController, AdminGigCandidateController],
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
    GigCandidateConflictFilter,
    GigCandidateApprovalValidationFilter,
  ],
  exports: [AdminDashboardService, AdminGigService],
})
export class AdminModule {}

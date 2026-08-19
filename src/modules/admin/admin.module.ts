import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DigestModule } from '../digest/digest.module';
import { GigModule } from '../gig/gig.module';
import { LocaleModule } from '../locale/locale.module';
import { TranslationModule } from '../translation/translation.module';
import { AdminController } from './admin.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminGigService } from './admin-gig.service';
import { TelegramModule } from '../telegram/telegram.module';
import { GigCandidateModule } from '../gig-candidate/gig-candidate.module';
import { AdminGigCandidateService } from './admin-gig-candidate.service';

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
  controllers: [AdminController],
  providers: [AdminDashboardService, AdminGigService, AdminGigCandidateService],
  exports: [AdminDashboardService, AdminGigService, AdminGigCandidateService],
})
export class AdminModule {}

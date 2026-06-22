import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GigModule } from '../gig/gig.module';
import { LanguageModule } from '../language/language.module';
import { AdminController } from './admin.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminGigService } from './admin-gig.service';

@Module({
  imports: [AuthModule, GigModule, LanguageModule],
  controllers: [AdminController],
  providers: [AdminDashboardService, AdminGigService],
  exports: [AdminDashboardService, AdminGigService],
})
export class AdminModule {}

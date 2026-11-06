import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { AlertingModule } from '@modules/alerting/alerting.module';
import { BucketModule } from '@modules/bucket/bucket.module';
import { CalendarModule } from '../calendar/calendar.module';
import { GigModule } from '../gig/gig.module';
import { TelegramModule } from '../telegram/telegram.module';
import { UserModule } from '../user/user.module';
import { GigCandidateBodyPipe } from './pipes/gig-candidate-body.pipe';
import { MongoGigCandidateRepository } from './repositories/mongo-gig-candidate.repository';
import { MongoGigCandidateApprovalRepository } from './gig-candidate-approval/repositories/mongo-gig-candidate-approval.repository';
import { GIG_CANDIDATE_APPROVAL_REPOSITORY } from './gig-candidate-approval/repositories/gig-candidate-approval.repository';
import { GIG_CANDIDATE_REPOSITORY } from './repositories/gig-candidate.repository';
import { GigCandidateController } from './gig-candidate.controller';
import { GigCandidate, GigCandidateSchema } from './gig-candidate.schema';
import { GigCandidateService } from './gig-candidate.service';
import { GigCandidateFeedbackService } from './gig-candidate-feedback.service';
import { GigCandidateApprovalService } from './gig-candidate-approval/gig-candidate-approval.service';
import { GigCandidatePosterService } from './gig-candidate-poster/gig-candidate-poster.service';
import { LocationModule } from '@modules/location/location.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GigCandidate.name, schema: GigCandidateSchema },
    ]),
    AlertingModule,
    GigModule,
    CalendarModule,
    TelegramModule,
    UserModule,
    AuthModule,
    AiModule,
    BucketModule,
    LocationModule,
  ],
  controllers: [GigCandidateController],
  providers: [
    GigCandidateService,
    GigCandidateFeedbackService,
    GigCandidatePosterService,
    GigCandidateApprovalService,
    GigCandidateBodyPipe,
    {
      provide: GIG_CANDIDATE_REPOSITORY,
      useClass: MongoGigCandidateRepository,
    },
    {
      provide: GIG_CANDIDATE_APPROVAL_REPOSITORY,
      useClass: MongoGigCandidateApprovalRepository,
    },
  ],
  exports: [GigCandidateService, GigCandidateApprovalService],
})
export class GigCandidateModule {}

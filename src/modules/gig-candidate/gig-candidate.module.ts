import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { CalendarModule } from '../calendar/calendar.module';
import { GigModule } from '../gig/gig.module';
import { TelegramModule } from '../telegram/telegram.module';
import { UserModule } from '../user/user.module';
import { GigCandidateBodyPipe } from './pipes/gig-candidate-body.pipe';
import { MongoGigCandidateRepository } from './repositories/mongo-gig-candidate.repository';
import { MongoGigCandidateApprovalRepository } from './repositories/mongo-gig-candidate-approval.repository';
import { GIG_CANDIDATE_APPROVAL_REPOSITORY } from './repositories/gig-candidate-approval.repository';
import { GIG_CANDIDATE_REPOSITORY } from './repositories/gig-candidate.repository';
import { GigCandidateController } from './gig-candidate.controller';
import { GigCandidate, GigCandidateSchema } from './gig-candidate.schema';
import { GigCandidateService } from './gig-candidate.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GigCandidate.name, schema: GigCandidateSchema },
    ]),
    GigModule,
    CalendarModule,
    TelegramModule,
    UserModule,
    AuthModule,
    AiModule,
  ],
  controllers: [GigCandidateController],
  providers: [
    GigCandidateService,
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
  exports: [GigCandidateService],
})
export class GigCandidateModule {}

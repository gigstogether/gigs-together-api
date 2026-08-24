import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { GigModule } from '../gig/gig.module';
import { TelegramModule } from '../telegram/telegram.module';
import { GigCandidateBodyPipe } from './pipes/gig-candidate-body.pipe';
import { MongoGigCandidateRepository } from './repositories/mongo-gig-candidate.repository';
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
    TelegramModule,
    AuthModule,
  ],
  controllers: [GigCandidateController],
  providers: [
    GigCandidateService,
    GigCandidateBodyPipe,
    {
      provide: GIG_CANDIDATE_REPOSITORY,
      useClass: MongoGigCandidateRepository,
    },
  ],
  exports: [GigCandidateService],
})
export class GigCandidateModule {}

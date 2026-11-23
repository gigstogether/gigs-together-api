import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LocationModule } from '@modules/location/location.module';
import { CommunityController } from './community.controller';
import { Community, CommunitySchema } from './community.schema';
import { CommunityService } from './community.service';
import { COMMUNITY_REPOSITORY } from './repositories/community.repository';
import { MongoCommunityRepository } from './repositories/mongo-community.repository';

@Module({
  imports: [
    LocationModule,
    MongooseModule.forFeature([
      { name: Community.name, schema: CommunitySchema },
    ]),
  ],
  controllers: [CommunityController],
  providers: [
    CommunityService,
    {
      provide: COMMUNITY_REPOSITORY,
      useClass: MongoCommunityRepository,
    },
  ],
  exports: [CommunityService],
})
export class CommunityModule {}

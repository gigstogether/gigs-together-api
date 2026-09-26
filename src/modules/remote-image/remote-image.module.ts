import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { RemoteImageService } from './remote-image.service';

@Module({
  imports: [HttpModule],
  providers: [RemoteImageService],
  exports: [RemoteImageService],
})
export class RemoteImageModule {}

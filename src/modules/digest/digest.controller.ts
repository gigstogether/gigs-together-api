import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  Version,
} from '@nestjs/common';
import { DigestService } from './digest.service';
import { DigestPublishGuard } from './guards/digest-publish.guard';

/**
 * Manual digest publish hook (authenticated POST for operators).
 * Requires DIGEST_PUBLISH_SECRET; if unset, POST returns 503.
 */
@Controller('digest')
export class DigestController {
  constructor(private readonly digestService: DigestService) {}

  @Version('1')
  @Post('publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(DigestPublishGuard)
  async publishDigest(): Promise<void> {
    await this.digestService.publish();
  }
}

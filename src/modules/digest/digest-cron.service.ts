import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  DigestService,
  DIGEST_POST_CRON_EXPRESSION,
  DIGEST_POST_TIMEZONE,
} from './digest.service';
import { logError } from '../../shared/utils/logging';

@Injectable()
export class DigestCronService implements OnModuleInit {
  private readonly logger = new Logger(DigestCronService.name);

  constructor(private readonly digestService: DigestService) {}

  onModuleInit(): void {
    void this.createWeeklyDigestPostOnStartup();
  }

  @Cron(DIGEST_POST_CRON_EXPRESSION, {
    name: 'digestWeeklyPost',
    timeZone: DIGEST_POST_TIMEZONE,
  })
  async createWeeklyDigestPostScheduled(): Promise<void> {
    this.logger.log('Scheduled weekly digest post started');
    await this.digestService.createPostIfEligible();
  }

  private async createWeeklyDigestPostOnStartup(): Promise<void> {
    try {
      await this.digestService.createPostIfEligible();
    } catch (e: unknown) {
      logError(this.logger, {
        error: e,
        note: 'Startup weekly digest catch-up failed; application will continue running',
        context: DigestCronService.name,
      });
    }
  }
}

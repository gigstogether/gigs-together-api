import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  DigestService,
  DIGEST_POST_CRON_EXPRESSION,
  DIGEST_POST_TIMEZONE,
} from './digest.service';

@Injectable()
export class DigestCronService implements OnModuleInit {
  private readonly logger = new Logger(DigestCronService.name);

  constructor(private readonly digestService: DigestService) {}

  onModuleInit(): void {
    void this.digestService.createPostIfEligible();
  }

  @Cron(DIGEST_POST_CRON_EXPRESSION, {
    name: 'digestWeeklyPost',
    timeZone: DIGEST_POST_TIMEZONE,
  })
  async createWeeklyDigestPostScheduled(): Promise<void> {
    this.logger.log('Scheduled weekly digest post started');
    await this.digestService.createPostIfEligible();
  }
}

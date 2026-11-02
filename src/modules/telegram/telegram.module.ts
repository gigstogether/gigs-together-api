import { Module } from '@nestjs/common';
import { TelegramInitDataValidationService } from './telegram-auth/telegram-init-data-validation.service';
import { TelegramBotClientModule } from './telegram-bot-client/telegram-bot-client.module';
import { TelegramBotReplyComposerService } from './telegram-bot-reply/telegram-bot-reply-composer.service';
import { TelegramBotReplyService } from './telegram-bot-reply/telegram-bot-reply.service';
import { TelegramDigestComposerService } from './telegram-digest/telegram-digest-composer.service';
import { TelegramDigestService } from './telegram-digest/telegram-digest.service';
import { TelegramGigCandidateComposerService } from './telegram-gig-candidate/telegram-gig-candidate-composer.service';
import { TelegramGigCandidateService } from './telegram-gig-candidate/telegram-gig-candidate.service';
import { TelegramGigComposerService } from './telegram-gig/telegram-gig-composer.service';
import { TelegramGigService } from './telegram-gig/telegram-gig.service';
import { TelegramComposerService } from './telegram-composer.service';
import { TelegramTemplateService } from './telegram-template.service';
import { TelegramService } from './telegram.service';
import { CacheModule } from '@nestjs/cache-manager';
import { BucketModule } from '../bucket/bucket.module';
import { AuthModule } from '../auth/auth.module';
import { TranslationModule } from '../translation/translation.module';
import { TelegramAuthController } from './telegram-auth/telegram-auth.controller';
import { TelegramInitDataAuthService } from './telegram-auth/telegram-init-data-auth.service';
import { TelegramAccessExchangeService } from './telegram-auth/telegram-access-exchange.service';
import { TelegramOidcAuthService } from './telegram-auth/telegram-oidc-auth.service';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TelegramBotClientModule,
    CacheModule.register({
      ttl: 60_000 * 60,
    }),
    BucketModule,
    AuthModule,
    UserModule,
    TranslationModule,
  ],
  controllers: [TelegramAuthController],
  providers: [
    TelegramInitDataValidationService,
    TelegramTemplateService,
    TelegramComposerService,
    TelegramBotReplyComposerService,
    TelegramDigestComposerService,
    TelegramGigCandidateComposerService,
    TelegramGigComposerService,
    TelegramBotReplyService,
    TelegramDigestService,
    TelegramGigCandidateService,
    TelegramGigService,
    TelegramService,
    TelegramInitDataAuthService,
    TelegramAccessExchangeService,
    TelegramOidcAuthService,
  ],
  exports: [
    TelegramService,
    TelegramComposerService,
    TelegramBotReplyService,
    TelegramDigestService,
    TelegramGigCandidateService,
    TelegramGigService,
    TelegramInitDataAuthService,
  ],
})
export class TelegramModule {}

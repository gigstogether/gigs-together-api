import { Module } from '@nestjs/common';
import { TelegramInitDataValidationService } from './telegram-init-data-validation.service';
import { TelegramBotClient } from './telegram-bot.client';
import { TelegramPostComposerService } from './telegram-post-composer.service';
import { TelegramTemplateService } from './telegram-template.service';
import { TelegramService } from './telegram.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { BucketModule } from '../bucket/bucket.module';
import { AuthModule } from '../auth/auth.module';
import { TranslationModule } from '../translation/translation.module';
import { TelegramAuthController } from './telegram-auth.controller';
import { TelegramInitDataAuthService } from './telegram-init-data-auth.service';
import { TelegramAccessExchangeService } from './telegram-access-exchange.service';
import { TelegramOidcAuthService } from './telegram-oidc-auth.service';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        baseURL: `https://api.telegram.org/bot${configService.get<string>('BOT_TOKEN')}`,
      }),
    }),
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
    TelegramBotClient,
    TelegramTemplateService,
    TelegramPostComposerService,
    TelegramService,
    TelegramInitDataAuthService,
    TelegramAccessExchangeService,
    TelegramOidcAuthService,
  ],
  exports: [TelegramService, TelegramInitDataAuthService],
})
export class TelegramModule {}

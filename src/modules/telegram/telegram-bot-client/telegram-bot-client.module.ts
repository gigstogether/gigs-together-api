import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getRequiredConfigString } from '@shared/utils/env';
import { RemoteImageModule } from '../../remote-image/remote-image.module';
import { TelegramBotClient } from './telegram-bot.client';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const botToken = getRequiredConfigString(configService, 'BOT_TOKEN');
        return {
          baseURL: `https://api.telegram.org/bot${botToken}`,
        };
      },
    }),
    RemoteImageModule,
  ],
  providers: [TelegramBotClient],
  exports: [TelegramBotClient],
})
export class TelegramBotClientModule {}

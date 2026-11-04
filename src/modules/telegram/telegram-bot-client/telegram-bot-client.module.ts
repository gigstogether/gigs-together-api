import { HttpService } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getRequiredConfigString } from '@shared/utils/env';
import { RemoteImageModule } from '@modules/remote-image/remote-image.module';
import axios from 'axios';
import {
  TELEGRAM_BOT_HTTP,
  TELEGRAM_FILE_HTTP,
  TelegramBotClient,
} from './telegram-bot.client';

interface TelegramBotHttpEndpoints {
  baseUrl: string;
  fileBaseUrl: string;
}

const TELEGRAM_HTTP_ENDPOINTS = Symbol('TELEGRAM_HTTP_ENDPOINTS');
const TELEGRAM_API_BASE_URL = 'https://api.telegram.org';

@Module({
  imports: [ConfigModule, RemoteImageModule],
  providers: [
    {
      provide: TELEGRAM_HTTP_ENDPOINTS,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): TelegramBotHttpEndpoints => {
        const botToken = getRequiredConfigString(configService, 'BOT_TOKEN');
        return {
          baseUrl: `${TELEGRAM_API_BASE_URL}/bot${botToken}`,
          fileBaseUrl: `${TELEGRAM_API_BASE_URL}/file/bot${botToken}`,
        };
      },
    },
    {
      provide: TELEGRAM_BOT_HTTP,
      inject: [TELEGRAM_HTTP_ENDPOINTS],
      useFactory: (endpoints: TelegramBotHttpEndpoints) =>
        new HttpService(axios.create({ baseURL: endpoints.baseUrl })),
    },
    {
      provide: TELEGRAM_FILE_HTTP,
      inject: [TELEGRAM_HTTP_ENDPOINTS],
      useFactory: (endpoints: TelegramBotHttpEndpoints) =>
        new HttpService(axios.create({ baseURL: endpoints.fileBaseUrl })),
    },
    TelegramBotClient,
  ],
  exports: [TelegramBotClient],
})
export class TelegramBotClientModule {}

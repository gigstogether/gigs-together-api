import { IsString, MinLength } from 'class-validator';

/** Body for `POST v1/auth/telegram/web-app` containing Telegram Mini App `initData`. */
export class V1TelegramWebAppBodyDto {
  @IsString()
  @MinLength(1)
  initData!: string;
}

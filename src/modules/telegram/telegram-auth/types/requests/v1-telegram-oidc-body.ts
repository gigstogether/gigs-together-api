import { IsNotEmpty, IsString } from 'class-validator';

/** Body for `POST v1/auth/telegram/oidc` from the current Telegram Login library. */
export class V1TelegramOidcBodyDto {
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}

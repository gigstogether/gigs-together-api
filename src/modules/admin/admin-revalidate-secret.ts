import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

export function assertAdminRevalidateSecret(
  configService: ConfigService,
  secretHeader: string | undefined,
): void {
  const secret = (
    configService.get<string>('ADMIN_REVALIDATE_SECRET') ?? ''
  ).trim();

  if (!secret) {
    throw new ServiceUnavailableException(
      'ADMIN_REVALIDATE_SECRET is not configured',
    );
  }

  const provided = (secretHeader ?? '').trim();
  if (!provided || provided !== secret) {
    throw new UnauthorizedException();
  }
}

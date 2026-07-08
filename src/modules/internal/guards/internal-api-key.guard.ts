import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

const INTERNAL_API_KEY_ENV_KEY = 'INTERNAL_API_KEY';
const INTERNAL_API_KEY_HEADER = 'x-internal-api-key';

function readSingleHeader(
  req: Request,
  headerName: string,
): string | undefined {
  const raw = req.headers[headerName];
  if (raw === undefined) return undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Requires `x-internal-api-key` to match configured INTERNAL_API_KEY.
 * When the env key is unset, rejects with 503 (endpoint not operational).
 */
@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const apiKeyHeader = readSingleHeader(req, INTERNAL_API_KEY_HEADER);

    const apiKey = (
      this.configService.get<string>(INTERNAL_API_KEY_ENV_KEY) ?? ''
    ).trim();

    if (!apiKey) {
      throw new ServiceUnavailableException(
        `${INTERNAL_API_KEY_ENV_KEY} is not configured`,
      );
    }

    const provided = (apiKeyHeader ?? '').trim();
    if (!provided || provided !== apiKey) {
      throw new UnauthorizedException();
    }

    return true;
  }
}

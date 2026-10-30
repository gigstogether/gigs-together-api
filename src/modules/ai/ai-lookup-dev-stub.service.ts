import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GigFormInput } from '../gig/types/gig.types';
import { getConfigBoolean, getConfigString } from '@shared/utils/env';

interface AiLookupParams {
  readonly name: string;
  readonly location: string;
}

@Injectable()
export class AiLookupDevStubService {
  private readonly logger = new Logger(AiLookupDevStubService.name);
  private static readonly DEV_STUB_COUNTRY = 'ES';
  private static readonly DEV_STUB_CITY = 'barcelona';
  private static readonly DEV_STUB_VENUE = 'Sala Razzmatazz';
  private static readonly DEV_STUB_TICKETS_URL = 'https://example.com/dev-stub';
  private readonly nodeEnv: string;
  private readonly isStubEnabled: boolean;
  private readonly stubKeyword: string | undefined;
  private readonly defaultGigPosterUrl: string | undefined;

  constructor(configService: ConfigService) {
    this.nodeEnv = (
      getConfigString(configService, 'NODE_ENV') ?? 'dev'
    ).toLowerCase();
    this.isStubEnabled =
      getConfigBoolean(configService, 'AI_LOOKUP_DEV_STUB') ?? false;
    this.stubKeyword = getConfigString(
      configService,
      'AI_LOOKUP_DEV_STUB_KEYWORD',
    )?.toLowerCase();
    this.defaultGigPosterUrl = getConfigString(
      configService,
      'DEFAULT_GIG_POSTER_URL',
    );
  }

  resolveGigOrNull(params: AiLookupParams): GigFormInput | null {
    if (!this.shouldUseStub(params)) {
      return null;
    }

    this.logger.log(
      `[AI lookup dev stub] name=${JSON.stringify(params.name)} location=${JSON.stringify(params.location)}`,
    );

    return this.buildStubGig(params);
  }

  private isNonProductionEnvironment(): boolean {
    return this.nodeEnv !== 'prod' && this.nodeEnv !== 'production';
  }

  private shouldUseStub(params: AiLookupParams): boolean {
    if (!this.isNonProductionEnvironment()) {
      return false;
    }

    if (this.isStubEnabled) {
      return true;
    }

    if (this.stubKeyword === undefined) {
      return false;
    }

    const haystack = `${params.name} ${params.location}`.toLowerCase();
    return haystack.includes(this.stubKeyword);
  }

  private buildStubGig(params: AiLookupParams): GigFormInput {
    const now = new Date();
    const futureDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 14,
        19,
        0,
        0,
        0,
      ),
    );

    const normalizedName = params.name.trim();
    const normalizedLocation = params.location.trim();
    const title = normalizedName
      ? `[DEV STUB] ${normalizedName}`
      : '[DEV STUB] Example Gig';
    const venue = normalizedLocation
      ? `${AiLookupDevStubService.DEV_STUB_VENUE} (${normalizedLocation})`
      : AiLookupDevStubService.DEV_STUB_VENUE;
    return {
      title,
      date: futureDate.toISOString(),
      city: AiLookupDevStubService.DEV_STUB_CITY,
      country: AiLookupDevStubService.DEV_STUB_COUNTRY,
      venue,
      ticketsUrl: AiLookupDevStubService.DEV_STUB_TICKETS_URL,
      posterUrl: this.defaultGigPosterUrl,
    };
  }
}

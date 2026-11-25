import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  getConfigBoolean,
  getConfigString,
  isProductionEnvironment,
} from '@shared/utils/env';
import type { AiGigLookupParams, AiGigLookupResult } from './ai-lookup.types';

@Injectable()
export class AiLookupDevStubService {
  private readonly logger = new Logger(AiLookupDevStubService.name);
  private static readonly DEV_STUB_COUNTRY = 'ES';
  private static readonly DEV_STUB_LOCALITY = 'barcelona';
  private static readonly DEV_STUB_VENUE = 'Sala Razzmatazz';
  private static readonly DEV_STUB_TICKETS_URL = 'https://example.com/dev-stub';
  // Cache the environment classification as part of this singleton's immutable configuration.
  private readonly isProduction: boolean;
  private readonly isStubEnabled: boolean;
  private readonly stubKeyword: string | undefined;
  private readonly defaultGigPosterUrl: string | undefined;

  constructor(configService: ConfigService) {
    this.isProduction = isProductionEnvironment(configService);
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

  getStubGig(params: AiGigLookupParams): AiGigLookupResult | null {
    if (!this.shouldUseStub(params)) {
      return null;
    }

    this.logger.log(
      `[AI lookup dev stub] name=${JSON.stringify(params.name)} location=${JSON.stringify(params.location)}`,
    );

    return this.buildStubGig(params);
  }

  private shouldUseStub(params: AiGigLookupParams): boolean {
    if (this.isProduction) {
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

  private buildStubGig(params: AiGigLookupParams): AiGigLookupResult {
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
      ticketsUrl: AiLookupDevStubService.DEV_STUB_TICKETS_URL,
      posterUrl: this.defaultGigPosterUrl,
      locationHint: {
        locality: AiLookupDevStubService.DEV_STUB_LOCALITY,
        country: AiLookupDevStubService.DEV_STUB_COUNTRY,
        venue,
      },
    };
  }
}

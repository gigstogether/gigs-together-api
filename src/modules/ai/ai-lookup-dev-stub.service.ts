import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GigFormInput } from '../gig/types/gig.types';

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

  constructor(private readonly configService: ConfigService) {}

  resolveGigOrNull(params: AiLookupParams): GigFormInput | null {
    if (!this.shouldUseStub(params)) {
      return null;
    }

    this.logger.log(
      `[AI lookup dev stub] name=${JSON.stringify(params.name)} location=${JSON.stringify(params.location)}`,
    );

    return this.buildStubGig(params);
  }

  private getNodeEnv(): string {
    return (
      this.configService.get<string>('NODE_ENV') ??
      process.env.NODE_ENV ??
      'dev'
    )
      .trim()
      .toLowerCase();
  }

  private isNonProductionEnvironment(): boolean {
    const nodeEnv = this.getNodeEnv();
    return nodeEnv !== 'prod' && nodeEnv !== 'production';
  }

  private isStubEnabled(): boolean {
    const raw =
      this.configService.get<string>('AI_LOOKUP_DEV_STUB') ??
      process.env.AI_LOOKUP_DEV_STUB;
    return raw === '1' || raw === 'true' || raw === 'yes';
  }

  private getStubKeyword(): string | undefined {
    const raw =
      this.configService.get<string>('AI_LOOKUP_DEV_STUB_KEYWORD') ??
      process.env.AI_LOOKUP_DEV_STUB_KEYWORD;
    const keyword = raw?.trim().toLowerCase();
    return keyword ? keyword : undefined;
  }

  private shouldUseStub(params: AiLookupParams): boolean {
    if (!this.isNonProductionEnvironment()) {
      return false;
    }

    if (this.isStubEnabled()) {
      return true;
    }

    const keyword = this.getStubKeyword();
    if (!keyword) {
      return false;
    }

    const haystack = `${params.name} ${params.location}`.toLowerCase();
    return haystack.includes(keyword);
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
    const posterUrl =
      this.configService.get<string>('DEFAULT_GIG_POSTER_URL') ??
      process.env.DEFAULT_GIG_POSTER_URL;
    const normalizedPosterUrl = posterUrl?.trim() || undefined;

    return {
      title,
      date: futureDate.toISOString(),
      city: AiLookupDevStubService.DEV_STUB_CITY,
      country: AiLookupDevStubService.DEV_STUB_COUNTRY,
      venue,
      ticketsUrl: AiLookupDevStubService.DEV_STUB_TICKETS_URL,
      posterUrl: normalizedPosterUrl,
    };
  }
}

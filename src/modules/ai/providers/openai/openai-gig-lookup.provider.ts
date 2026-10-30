import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import { getConfigBoolean, getConfigString } from '@shared/utils/env';
import { isRecord } from '@shared/utils/is-record';
import type { GigFormInput } from '../../../gig/types/gig.types';
import type { AiGigLookupParams } from '../../ai-lookup.types';
import { buildV1FutureGigLookupPrompt } from '../../prompts/v1-gig-lookup-prompt';
import type { AiGigLookupProvider } from '../ai-gig-lookup.provider';
import { GIG_LOOKUP_OPENAI_JSON_SCHEMA } from './openai-gig-lookup.request';

@Injectable()
export class OpenAiGigLookupProvider implements AiGigLookupProvider {
  private readonly logger = new Logger(OpenAiGigLookupProvider.name);
  /** When true, logs non-sensitive lookup diagnostics (set AI_LOOKUP_DEBUG=1). */
  private readonly isLookupDebugEnabled: boolean;
  private readonly apiKey: string | undefined;
  private readonly model: string | undefined;
  private readonly baseUrl: string | undefined;

  constructor(configService: ConfigService) {
    this.isLookupDebugEnabled =
      getConfigBoolean(configService, 'AI_LOOKUP_DEBUG') ?? false;
    this.apiKey = getConfigString(configService, 'AI_API_KEY');
    this.model = getConfigString(configService, 'AI_MODEL');
    this.baseUrl = getConfigString(configService, 'AI_URL');
  }

  async lookupGig(params: AiGigLookupParams): Promise<GigFormInput | null> {
    if (this.apiKey === undefined) {
      throw new InternalServerErrorException(
        'AI_API_KEY is not set on the server',
      );
    }
    if (this.model === undefined) {
      throw new InternalServerErrorException(
        'AI_MODEL is not set on the server',
      );
    }
    if (this.baseUrl === undefined) {
      throw new InternalServerErrorException('AI_URL is not set on the server');
    }

    const prompt = buildV1FutureGigLookupPrompt({
      name: params.name,
      place: params.location,
    });
    const client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
    });

    try {
      const response = await client.responses.create({
        model: this.model,
        tools: [{ type: 'web_search' }],
        input: prompt,
        text: {
          format: {
            type: 'json_schema',
            name: 'gig_lookup',
            strict: true,
            schema: GIG_LOOKUP_OPENAI_JSON_SCHEMA,
          },
        },
      });
      const text: unknown = response.output_text;

      if (this.isLookupDebugEnabled) {
        const contentForLog =
          typeof text === 'string'
            ? text
            : text === undefined
              ? '(undefined)'
              : JSON.stringify(text);
        const maxLen = 6_000;
        const clipped =
          contentForLog.length > maxLen
            ? `${contentForLog.slice(0, maxLen)}…(truncated)`
            : contentForLog;
        this.logger.log(
          `[AI lookup debug] model=${this.model} endpoint=${this.getAiEndpointOriginForLog(this.baseUrl)} name=${JSON.stringify(params.name)} place=${JSON.stringify(params.location)} content_type=${typeof text} raw_content=${clipped}`,
        );
      }

      if (typeof text !== 'string' || text.trim() === '') {
        throw new InternalServerErrorException('AI returned empty response');
      }

      const trimmed = text.trim();
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        // Try to recover if model wrapped JSON in extra text.
        const start = trimmed.indexOf('{');
        const end = trimmed.lastIndexOf('}');
        if (start >= 0 && end > start) {
          parsed = JSON.parse(trimmed.slice(start, end + 1));
        } else {
          throw new InternalServerErrorException(
            'Model did not return valid JSON',
          );
        }
      }

      if (isRecord(parsed) && typeof parsed.isFound === 'boolean') {
        if (!parsed.isFound) {
          if (this.isLookupDebugEnabled) {
            this.logger.log(
              '[AI lookup debug] not_found_reason=model_set_isFound_false',
            );
          }
          return null;
        }
      } else if (parsed === null) {
        if (this.isLookupDebugEnabled) {
          this.logger.log(
            '[AI lookup debug] not_found_reason=model_returned_json_null (prompt allows null when no matching future gig)',
          );
        }
        return null;
      }

      const gig = this.normalizeLookedUpGig(parsed);
      const dateRaw = gig.date.trim();
      if (dateRaw === '') {
        if (this.isLookupDebugEnabled) {
          this.logger.log(
            '[AI lookup debug] not_found_reason=empty_date_after_normalize',
          );
        }
        return null;
      }

      const timestamp = new Date(dateRaw).getTime();
      if (Number.isNaN(timestamp) || timestamp <= Date.now()) {
        if (this.isLookupDebugEnabled) {
          this.logger.log(
            `[AI lookup debug] not_found_reason=invalid_or_past_date dateRaw=${JSON.stringify(dateRaw)} ts=${timestamp}`,
          );
        }
        return null;
      }

      return gig;
    } catch (e) {
      if (e instanceof OpenAI.APIError) {
        const status = e.status;
        const nested = this.getNestedErrorMessage(e.error);
        const message = nested ?? e.message ?? 'AI request failed';
        throw new InternalServerErrorException(
          `AI request failed${status ? ` (HTTP ${status})` : ''}: ${message}`,
        );
      }
      throw e;
    }
  }

  private normalizeLookedUpGig(raw: unknown): GigFormInput {
    if (!isRecord(raw)) {
      throw new InternalServerErrorException(
        'Invalid AI response: expected a JSON object',
      );
    }

    const title = typeof raw.title === 'string' ? raw.title : '';
    const city = typeof raw.city === 'string' ? raw.city : '';
    const rawCountry = typeof raw.country === 'string' ? raw.country : '';
    const normalizedCountry = rawCountry.trim().toUpperCase();
    const country = /^[A-Z]{2}$/.test(normalizedCountry)
      ? normalizedCountry
      : '';
    const venue = typeof raw.venue === 'string' ? raw.venue : '';
    const ticketsUrl = typeof raw.ticketsUrl === 'string' ? raw.ticketsUrl : '';
    const posterUrl = typeof raw.posterUrl === 'string' ? raw.posterUrl : '';
    const endDateRaw = typeof raw.endDate === 'string' ? raw.endDate : '';

    let date = '';
    if (typeof raw.date === 'string') {
      date = raw.date;
    } else if (typeof raw.date === 'number' && Number.isFinite(raw.date)) {
      date = new Date(raw.date).toISOString();
    }

    const gig: GigFormInput = {
      title,
      date,
      city,
      country,
      venue,
      ticketsUrl,
    };
    if (endDateRaw.trim() !== '') {
      gig.endDate = endDateRaw;
    }
    if (posterUrl.trim() !== '') {
      gig.posterUrl = posterUrl;
    }
    return gig;
  }

  private getAiEndpointOriginForLog(url: string): string {
    try {
      return new URL(url).origin;
    } catch {
      return '(invalid AI_URL)';
    }
  }

  private getNestedErrorMessage(rawData: unknown): string | undefined {
    if (!isRecord(rawData) || !isRecord(rawData.error)) {
      return undefined;
    }
    const message = rawData.error.message;
    return typeof message === 'string' && message.trim() !== ''
      ? message.trim()
      : undefined;
  }
}

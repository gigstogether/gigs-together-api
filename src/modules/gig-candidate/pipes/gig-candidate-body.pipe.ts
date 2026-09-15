import type { PipeTransform } from '@nestjs/common';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { V1CreateGigCandidateRequestBodyGig } from '../types/requests/v1-create-gig-candidate-request';

export interface GigCandidateBodyWithParsedGig extends Record<string, unknown> {
  gig: V1CreateGigCandidateRequestBodyGig;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Normalizes `body.gig` so that downstream handlers always receive an object.
 *
 * Needed because in multipart/form-data, nested objects are sent as strings.
 * Field-level validation happens in GigCandidateService.
 */
@Injectable()
export class GigCandidateBodyPipe implements PipeTransform<
  unknown,
  GigCandidateBodyWithParsedGig
> {
  private parseGig(value: unknown): V1CreateGigCandidateRequestBodyGig {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        throw new BadRequestException('gig must be a JSON object');
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        throw new BadRequestException('gig must be a valid JSON object');
      }
      if (!isPlainObject(parsed)) {
        throw new BadRequestException('gig must be a JSON object');
      }
      return this.toGigBody(parsed);
    }

    if (!isPlainObject(value)) {
      throw new BadRequestException('gig must be an object');
    }

    return this.toGigBody(value);
  }

  private toGigBody(
    value: Record<string, unknown>,
  ): V1CreateGigCandidateRequestBodyGig {
    return {
      title: this.readOptionalString(value, 'title') ?? '',
      date: this.readOptionalString(value, 'date') ?? '',
      city: this.readOptionalString(value, 'city') ?? '',
      country: this.readOptionalString(value, 'country') ?? '',
      ...(value.endDate !== undefined
        ? { endDate: this.readOptionalString(value, 'endDate') }
        : {}),
      ...(value.venue !== undefined
        ? { venue: this.readOptionalString(value, 'venue') }
        : {}),
      ...(value.ticketsUrl !== undefined
        ? { ticketsUrl: this.readOptionalString(value, 'ticketsUrl') }
        : {}),
      ...(value.posterUrl !== undefined
        ? { posterUrl: this.readOptionalString(value, 'posterUrl') }
        : {}),
    };
  }

  private readOptionalString(
    value: Record<string, unknown>,
    field: string,
  ): string | undefined {
    const raw = value[field];
    if (raw === undefined || raw === null) {
      return undefined;
    }
    if (typeof raw !== 'string') {
      throw new BadRequestException(`${field} must be a string`);
    }
    return raw;
  }

  transform(bodyRaw: unknown): GigCandidateBodyWithParsedGig {
    if (!isPlainObject(bodyRaw)) {
      throw new BadRequestException('Body must be an object');
    }

    return {
      ...bodyRaw,
      gig: this.parseGig(bodyRaw.gig),
    };
  }
}

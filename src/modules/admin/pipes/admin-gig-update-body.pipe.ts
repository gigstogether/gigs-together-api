import type { PipeTransform } from '@nestjs/common';
import { BadRequestException, Injectable } from '@nestjs/common';
import { GIG_TITLE_MAX_LENGTH } from '../../gig/gig.constants';
import type { GigFormInput } from '../../gig/types/gig.types';

const GIG_FIELDS = [
  'title',
  'date',
  'endDate',
  'city',
  'country',
  'venue',
  'ticketsUrl',
  'posterUrl',
] as const;
const BODY_FIELDS = ['gig', 'expectedVersion'] as const;

export interface AdminGigUpdateBody {
  gig: GigFormInput;
  expectedVersion: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalizes an object field so downstream handlers receive a validated object.
 * Multipart form fields arrive as strings, so nested objects use JSON strings.
 */
function parseRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      throw new BadRequestException(`${field} must be a JSON object`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new BadRequestException(`${field} must be a valid JSON object`);
    }
    if (!isRecord(parsed)) {
      throw new BadRequestException(`${field} must be a JSON object`);
    }
    return parsed;
  }

  if (!isRecord(value)) {
    throw new BadRequestException(`${field} must be an object`);
  }
  return value;
}

function assertOnlyFields(
  value: Record<string, unknown>,
  allowedFields: readonly string[],
  fieldName: string,
): void {
  const unsupportedField = Object.keys(value).find(
    (field) => !allowedFields.includes(field),
  );
  if (unsupportedField !== undefined) {
    throw new BadRequestException(
      `${fieldName} contains unsupported field: ${unsupportedField}`,
    );
  }
}

function readRequiredString(
  value: Record<string, unknown>,
  field: string,
): string {
  const fieldValue = value[field];
  if (typeof fieldValue !== 'string') {
    throw new BadRequestException(`${field} must be a string`);
  }
  return fieldValue;
}

function readOptionalString(
  value: Record<string, unknown>,
  field: string,
): string | undefined {
  const fieldValue = value[field];
  if (fieldValue === undefined) {
    return undefined;
  }
  if (typeof fieldValue !== 'string') {
    throw new BadRequestException(`${field} must be a string`);
  }
  return fieldValue;
}

function readRequiredTitle(value: Record<string, unknown>): string {
  const title = readRequiredString(value, 'title').trim();
  if (title === '') {
    throw new BadRequestException('title is required');
  }
  if (title.length > GIG_TITLE_MAX_LENGTH) {
    throw new BadRequestException(
      `title must contain at most ${GIG_TITLE_MAX_LENGTH} characters`,
    );
  }
  return title;
}

function parseGig(value: unknown): GigFormInput {
  const gig = parseRecord(value, 'gig');
  assertOnlyFields(gig, GIG_FIELDS, 'gig');
  const endDate = readOptionalString(gig, 'endDate');
  const posterUrl = readOptionalString(gig, 'posterUrl');

  return {
    title: readRequiredTitle(gig),
    date: readRequiredString(gig, 'date'),
    city: readRequiredString(gig, 'city'),
    country: readRequiredString(gig, 'country'),
    venue: readRequiredString(gig, 'venue'),
    ticketsUrl: readRequiredString(gig, 'ticketsUrl'),
    ...(endDate !== undefined ? { endDate } : {}),
    ...(posterUrl !== undefined ? { posterUrl } : {}),
  };
}

function parseExpectedVersion(value: unknown): number {
  const parsed =
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isInteger(parsed) || parsed < 0) {
    throw new BadRequestException(
      'expectedVersion must be a non-negative integer',
    );
  }
  return parsed;
}

@Injectable()
export class AdminGigUpdateBodyPipe implements PipeTransform<
  unknown,
  AdminGigUpdateBody
> {
  transform(bodyRaw: unknown): AdminGigUpdateBody {
    if (!isRecord(bodyRaw)) {
      throw new BadRequestException('Body must be an object');
    }
    assertOnlyFields(bodyRaw, BODY_FIELDS, 'body');
    return {
      gig: parseGig(bodyRaw.gig),
      expectedVersion: parseExpectedVersion(bodyRaw.expectedVersion),
    };
  }
}

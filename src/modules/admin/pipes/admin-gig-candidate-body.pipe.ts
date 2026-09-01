import type { PipeTransform } from '@nestjs/common';
import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  V1AdminCreateGigCandidateRequestBody,
  V1AdminApproveGigCandidateRequestBody,
  V1AdminGigCandidateGigDraftRequestBody,
  V1AdminGigCandidateLookupRequestBody,
  V1AdminRejectGigCandidateRequestBody,
  V1AdminSendGigCandidateToModerationRequestBody,
  V1AdminUpdateGigCandidateDraftRequestBody,
} from '../types/requests/v1-admin-gig-candidate-requests';

const GIG_DRAFT_FIELDS = [
  'title',
  'date',
  'endDate',
  'city',
  'country',
  'venue',
  'ticketsUrl',
  'posterUrl',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
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
  field: string,
): void {
  const unexpectedField = Object.keys(value).find(
    (key) => !allowedFields.includes(key),
  );
  if (unexpectedField !== undefined) {
    throw new BadRequestException(
      `${field} contains unsupported field: ${unexpectedField}`,
    );
  }
}

function readOptionalString(
  value: Record<string, unknown>,
  field: string,
): string | undefined {
  const raw = value[field];
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== 'string') {
    throw new BadRequestException(`${field} must be a string`);
  }
  return raw;
}

function parseGigDraft(value: unknown): V1AdminGigCandidateGigDraftRequestBody {
  const record = parseRecord(value, 'gigDraft');
  assertOnlyFields(record, GIG_DRAFT_FIELDS, 'gigDraft');

  return Object.fromEntries(
    GIG_DRAFT_FIELDS.flatMap((field) => {
      const fieldValue = readOptionalString(record, field);
      return fieldValue === undefined ? [] : [[field, fieldValue]];
    }),
  );
}

function parseBody(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new BadRequestException('Body must be an object');
  }
  return value;
}

function parseExpectedVersion(value: unknown): number {
  const parsed =
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isInteger(parsed) || Number(parsed) < 0) {
    throw new BadRequestException(
      'expectedVersion must be a non-negative integer',
    );
  }
  return Number(parsed);
}

@Injectable()
export class AdminGigCandidateCreateBodyPipe implements PipeTransform<
  unknown,
  V1AdminCreateGigCandidateRequestBody
> {
  transform(bodyRaw: unknown): V1AdminCreateGigCandidateRequestBody {
    const body = parseBody(bodyRaw);
    assertOnlyFields(body, ['gigDraft'], 'body');
    return { gigDraft: parseGigDraft(body.gigDraft) };
  }
}

@Injectable()
export class AdminGigCandidateDraftUpdateBodyPipe implements PipeTransform<
  unknown,
  V1AdminUpdateGigCandidateDraftRequestBody
> {
  transform(bodyRaw: unknown): V1AdminUpdateGigCandidateDraftRequestBody {
    const body = parseBody(bodyRaw);
    assertOnlyFields(body, ['expectedVersion', 'gigDraft'], 'body');
    return {
      expectedVersion: parseExpectedVersion(body.expectedVersion),
      gigDraft: parseGigDraft(body.gigDraft),
    };
  }
}

@Injectable()
export class AdminGigCandidateRejectBodyPipe implements PipeTransform<
  unknown,
  V1AdminRejectGigCandidateRequestBody
> {
  transform(bodyRaw: unknown): V1AdminRejectGigCandidateRequestBody {
    const body = parseBody(bodyRaw);
    assertOnlyFields(body, ['expectedVersion'], 'body');
    return { expectedVersion: parseExpectedVersion(body.expectedVersion) };
  }
}

@Injectable()
export class AdminGigCandidateApproveBodyPipe implements PipeTransform<
  unknown,
  V1AdminApproveGigCandidateRequestBody
> {
  transform(bodyRaw: unknown): V1AdminApproveGigCandidateRequestBody {
    const body = parseBody(bodyRaw);
    assertOnlyFields(body, ['expectedVersion'], 'body');
    return { expectedVersion: parseExpectedVersion(body.expectedVersion) };
  }
}

@Injectable()
export class AdminGigCandidateSendToModerationBodyPipe implements PipeTransform<
  unknown,
  V1AdminSendGigCandidateToModerationRequestBody
> {
  transform(bodyRaw: unknown): V1AdminSendGigCandidateToModerationRequestBody {
    const body = parseBody(bodyRaw);
    assertOnlyFields(body, ['expectedVersion'], 'body');
    return { expectedVersion: parseExpectedVersion(body.expectedVersion) };
  }
}

@Injectable()
export class AdminGigCandidateLookupBodyPipe implements PipeTransform<
  unknown,
  V1AdminGigCandidateLookupRequestBody
> {
  transform(bodyRaw: unknown): V1AdminGigCandidateLookupRequestBody {
    const body = parseBody(bodyRaw);
    assertOnlyFields(body, ['title', 'location'], 'body');
    const title = readOptionalString(body, 'title')?.trim();
    const location = readOptionalString(body, 'location')?.trim();
    if (!title || title.length > 200) {
      throw new BadRequestException(
        'title must contain between 1 and 200 characters',
      );
    }
    if (!location || location.length > 200) {
      throw new BadRequestException(
        'location must contain between 1 and 200 characters',
      );
    }
    return { title, location };
  }
}

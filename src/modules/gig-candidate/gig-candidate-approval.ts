import type {
  GigCandidate,
  GigCandidateSource,
} from './types/gig-candidate.types';
import type { GigData, GigSource } from '../gig/types/gig.types';

export interface GigCandidateApprovalIssue {
  field: string;
  code: 'required' | 'invalid';
  message: string;
}

export class GigCandidateApprovalValidationError extends Error {
  issues: GigCandidateApprovalIssue[];

  constructor(issues: GigCandidateApprovalIssue[]) {
    super('GigCandidate gigDraft is incomplete or invalid.');
    this.name = GigCandidateApprovalValidationError.name;
    this.issues = issues;
  }
}

export function validateGigCandidateDraftForApproval(
  gigDraft: Partial<GigData>,
): GigData {
  const issues: GigCandidateApprovalIssue[] = [];
  const title = validateRequiredNormalizedString(
    gigDraft.title,
    'title',
    issues,
  );
  const city = validateRequiredNormalizedString(gigDraft.city, 'city', issues);
  const country = validateRequiredNormalizedString(
    gigDraft.country,
    'country',
    issues,
  );
  const date = validateRequiredDate(gigDraft.date, 'date', issues);
  const endDate = validateOptionalDate(gigDraft.endDate, 'endDate', issues);
  const venue = validateRequiredNormalizedString(
    gigDraft.venue,
    'venue',
    issues,
  );
  const ticketsUrl = validateRequiredUrl(
    gigDraft.ticketsUrl,
    'ticketsUrl',
    issues,
  );

  if (country !== undefined && !/^[A-Z]{2}$/.test(country)) {
    issues.push({
      field: 'country',
      code: 'invalid',
      message: 'country must be an uppercase ISO 3166-1 alpha-2 code',
    });
  }
  if (date !== undefined && endDate !== undefined && endDate < date) {
    issues.push({
      field: 'endDate',
      code: 'invalid',
      message: 'endDate must be on or after date',
    });
  }
  if (
    gigDraft.poster !== undefined &&
    (typeof gigDraft.poster.bucketPath !== 'string' ||
      gigDraft.poster.bucketPath.trim() === '')
  ) {
    issues.push({
      field: 'poster',
      code: 'invalid',
      message: 'poster must contain a non-empty bucketPath',
    });
  }

  if (
    issues.length > 0 ||
    title === undefined ||
    date === undefined ||
    city === undefined ||
    country === undefined ||
    venue === undefined ||
    ticketsUrl === undefined
  ) {
    throw new GigCandidateApprovalValidationError(issues);
  }

  return {
    title,
    date,
    ...(endDate !== undefined ? { endDate } : {}),
    city,
    country,
    venue,
    ticketsUrl,
    ...(gigDraft.poster !== undefined
      ? { poster: { ...gigDraft.poster } }
      : {}),
  };
}

export function projectGigCandidateSource(
  source: GigCandidateSource,
): GigSource {
  if (source.type === 'user') {
    return {
      type: 'user',
      userId: source.userId,
      origin: { type: source.origin.type },
    };
  }

  return {
    type: 'provider',
    provider: {
      name: source.provider.name,
      externalEventId: source.provider.externalEventId,
      sourceUrl: source.provider.sourceUrl,
      fetchedAt: new Date(source.provider.fetchedAt),
      ...(source.provider.externalVersionId !== undefined
        ? { externalVersionId: source.provider.externalVersionId }
        : {}),
      ...(source.provider.providerUpdatedAt !== undefined
        ? { providerUpdatedAt: new Date(source.provider.providerUpdatedAt) }
        : {}),
    },
  };
}

export function requireApprovedGigId(gigCandidate: GigCandidate): string {
  if (gigCandidate.gigId !== undefined) {
    return gigCandidate.gigId;
  }
  throw new Error(`Approved GigCandidate ${gigCandidate.id} has no gigId.`);
}

function validateRequiredNormalizedString(
  value: string | undefined,
  field: string,
  issues: GigCandidateApprovalIssue[],
): string | undefined {
  if (value === undefined || value.trim() === '') {
    issues.push({ field, code: 'required', message: `${field} is required` });
    return undefined;
  }
  if (value !== value.trim()) {
    issues.push({
      field,
      code: 'invalid',
      message: `${field} must be normalized without surrounding whitespace`,
    });
  }
  return value;
}

function validateRequiredDate(
  value: number | undefined,
  field: string,
  issues: GigCandidateApprovalIssue[],
): number | undefined {
  if (value === undefined) {
    issues.push({ field, code: 'required', message: `${field} is required` });
    return undefined;
  }
  return validateDate(value, field, issues);
}

function validateOptionalDate(
  value: number | undefined,
  field: string,
  issues: GigCandidateApprovalIssue[],
): number | undefined {
  return value === undefined ? undefined : validateDate(value, field, issues);
}

function validateDate(
  value: number,
  field: string,
  issues: GigCandidateApprovalIssue[],
): number | undefined {
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    !Number.isFinite(new Date(value).getTime())
  ) {
    issues.push({
      field,
      code: 'invalid',
      message: `${field} must be a valid integer timestamp`,
    });
    return undefined;
  }
  return value;
}

function validateRequiredUrl(
  value: string | undefined,
  field: string,
  issues: GigCandidateApprovalIssue[],
): string | undefined {
  const normalized = validateRequiredNormalizedString(value, field, issues);
  if (normalized === undefined) {
    return undefined;
  }
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Unsupported URL protocol');
    }
  } catch {
    issues.push({
      field,
      code: 'invalid',
      message: `${field} must be an absolute http(s) URL`,
    });
  }
  return normalized;
}

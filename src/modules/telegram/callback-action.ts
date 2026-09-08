/** Telegram callback_data hard limit (bytes / UTF-8 characters for ASCII). */
export const TELEGRAM_CALLBACK_DATA_MAX_CHARS = 64;

export enum CallbackScope {
  Gig = 'gig',
  GigCandidate = 'gigCandidate',
}

export enum GigCallbackAction {
  Hide = 'hide',
  Post = 'post',
  Show = 'show',
}

export interface GigCallbackData {
  scope: CallbackScope.Gig;
  action: GigCallbackAction;
  id: string;
  expectedVersion: number;
}

export enum GigCandidateCallbackAction {
  SendToModeration = 'sendToModeration',
  Approve = 'approve',
  Reject = 'reject',
}

export interface GigCandidateCallbackData {
  scope: CallbackScope.GigCandidate;
  action: GigCandidateCallbackAction;
  id: string;
  expectedVersion: number;
}

export type EncodeCallbackDataParams =
  GigCallbackData | GigCandidateCallbackData;

export type ParsedCallbackData = EncodeCallbackDataParams;

function isGigCallbackAction(value: string): value is GigCallbackAction {
  return (
    value === GigCallbackAction.Hide ||
    value === GigCallbackAction.Post ||
    value === GigCallbackAction.Show
  );
}

function isGigCandidateCallbackAction(
  value: string,
): value is GigCandidateCallbackAction {
  return (
    value === GigCandidateCallbackAction.SendToModeration ||
    value === GigCandidateCallbackAction.Approve ||
    value === GigCandidateCallbackAction.Reject
  );
}

export function encodeCallbackData(params: EncodeCallbackDataParams): string {
  const id = params.id.trim();
  if (id.length === 0) {
    throw new Error('callback_data id must be a non-empty string');
  }
  if (id.includes(':')) {
    throw new Error('callback_data id must not contain ":"');
  }
  if (
    (params.scope === CallbackScope.GigCandidate ||
      params.scope === CallbackScope.Gig) &&
    (!Number.isInteger(params.expectedVersion) || params.expectedVersion < 0)
  ) {
    throw new Error(
      'callback_data expectedVersion must be a non-negative integer',
    );
  }

  const data = `${params.scope}:${params.action}:${id}:${params.expectedVersion}`;
  if (data.length > TELEGRAM_CALLBACK_DATA_MAX_CHARS) {
    throw new Error(
      `callback_data exceeds Telegram limit of ${TELEGRAM_CALLBACK_DATA_MAX_CHARS} characters`,
    );
  }

  return data;
}

export function parseCallbackData(data: string): ParsedCallbackData | null {
  const parts = data.split(':');
  const [scopeRaw, actionRaw, idRaw, expectedVersionRaw] = parts;
  if (idRaw === undefined) {
    return null;
  }
  const id = idRaw.trim();
  if (id.length === 0) {
    return null;
  }

  const expectedVersion = Number(expectedVersionRaw);
  if (
    parts.length === 4 &&
    scopeRaw === CallbackScope.Gig &&
    isGigCallbackAction(actionRaw) &&
    Number.isInteger(expectedVersion) &&
    expectedVersion >= 0
  ) {
    return {
      scope: CallbackScope.Gig,
      action: actionRaw,
      id,
      expectedVersion,
    };
  }

  if (
    parts.length === 4 &&
    scopeRaw === CallbackScope.GigCandidate &&
    isGigCandidateCallbackAction(actionRaw) &&
    Number.isInteger(expectedVersion) &&
    expectedVersion >= 0
  ) {
    return {
      scope: CallbackScope.GigCandidate,
      action: actionRaw,
      id,
      expectedVersion,
    };
  }

  return null;
}

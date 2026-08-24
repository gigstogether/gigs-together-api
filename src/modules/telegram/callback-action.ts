/** Telegram callback_data hard limit (bytes / UTF-8 characters for ASCII). */
export const TELEGRAM_CALLBACK_DATA_MAX_CHARS = 64;

export enum CallbackScope {
  Gig = 'gig',
}

export enum GigCallbackAction {
  Approve = 'approve',
  Reject = 'reject',
  Post = 'post',
}

export interface GigCallbackData {
  scope: CallbackScope.Gig;
  action: GigCallbackAction;
  id: string;
}

export type EncodeCallbackDataParams = GigCallbackData;

export type ParsedCallbackData = EncodeCallbackDataParams;

function isGigCallbackAction(value: string): value is GigCallbackAction {
  return (
    value === GigCallbackAction.Approve ||
    value === GigCallbackAction.Reject ||
    value === GigCallbackAction.Post
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

  const data = `${params.scope}:${params.action}:${id}`;
  if (data.length > TELEGRAM_CALLBACK_DATA_MAX_CHARS) {
    throw new Error(
      `callback_data exceeds Telegram limit of ${TELEGRAM_CALLBACK_DATA_MAX_CHARS} characters`,
    );
  }

  return data;
}

export function parseCallbackData(data: string): ParsedCallbackData | null {
  const parts = data.split(':');
  if (parts.length !== 3) {
    return null;
  }

  const [scopeRaw, actionRaw, idRaw] = parts;
  const id = idRaw.trim();
  if (id.length === 0) {
    return null;
  }

  if (scopeRaw === CallbackScope.Gig && isGigCallbackAction(actionRaw)) {
    return {
      scope: CallbackScope.Gig,
      action: actionRaw,
      id,
    };
  }

  return null;
}

import { isAxiosError } from 'axios';
import { isRecord } from '@shared/utils/is-record';
import { formatErrorMessage } from '@shared/utils/logging';

const TELEGRAM_CHAT_NOT_FOUND_DESCRIPTION = 'Bad Request: chat not found';

export function isTelegramChatNotFoundError(e: unknown): boolean {
  if (!isAxiosError(e) || e.response?.status !== 400) {
    return false;
  }

  const responseData = e.response.data;
  return (
    isRecord(responseData) &&
    responseData.error_code === 400 &&
    responseData.description === TELEGRAM_CHAT_NOT_FOUND_DESCRIPTION
  );
}

export function formatTelegramErrorMessage(e: unknown): string {
  if (!isAxiosError(e)) {
    return formatErrorMessage(e);
  }

  const parts = [formatErrorMessage(e)];

  const responseData = e.response?.data;
  if (isRecord(responseData)) {
    if (typeof responseData.error_code === 'number') {
      parts.push(`telegramErrorCode=${responseData.error_code}`);
    }
    if (typeof responseData.description === 'string') {
      parts.push(`telegramDescription=${responseData.description}`);
    }
  }

  return parts.join('; ');
}

import { isAxiosError } from 'axios';
import { isRecord } from '../../shared/utils/is-record';
import { formatErrorMessage } from '../../shared/utils/logging';

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

import {
  TELEGRAM_DATE_LOCALE,
  TELEGRAM_GIG_DATE_FORMAT,
} from '../telegram.constants';

const telegramGigDateFormatter = new Intl.DateTimeFormat(
  TELEGRAM_DATE_LOCALE,
  TELEGRAM_GIG_DATE_FORMAT,
);

export function formatTelegramGigDates(date: number, endDate?: number): string {
  const dateLabel = telegramGigDateFormatter.format(new Date(date));
  if (endDate === undefined) {
    return dateLabel;
  }

  const endDateLabel = telegramGigDateFormatter.format(new Date(endDate));
  return `${dateLabel} - ${endDateLabel}`;
}

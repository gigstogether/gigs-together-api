export function isValidIanaTimeZone(timeZone: string): boolean {
  if (timeZone.length === 0) {
    return false;
  }

  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

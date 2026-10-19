import type { ConfigService } from '@nestjs/config';

export function getRequiredConfigString(
  configService: ConfigService,
  variableName: string,
): string {
  const raw = configService.get<unknown>(variableName);
  if (typeof raw !== 'string') {
    throw new Error(`${variableName} is not configured.`);
  }

  const value = raw.trim();
  if (value === '') {
    throw new Error(`${variableName} is not configured.`);
  }
  return value;
}

export function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === null) return defaultValue;
  const v = String(raw).trim().toLowerCase();
  if (v === '') return defaultValue;
  if (['false', '0', 'no', 'off'].includes(v)) return false;
  if (['true', '1', 'yes', 'on'].includes(v)) return true;
  return defaultValue;
}

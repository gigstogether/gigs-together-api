export const LegacyGigStatus = {
  New: 'New',
  Pending: 'Pending',
  Approved: 'Approved',
  Rejected: 'Rejected',
  Published: 'Published',
} as const;

export type LegacyGigStatus =
  (typeof LegacyGigStatus)[keyof typeof LegacyGigStatus];

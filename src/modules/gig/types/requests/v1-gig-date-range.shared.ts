/**
 * Shared helpers for parsing gig date range query params.
 *
 * We intentionally keep formats strict to avoid timezone surprises.
 */

export function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Gigs visible in the feed on and after `fromMs`:
 * - single-day (no `endDate`): `date` is on or after `fromMs`;
 * - multi-day: still listed while `endDate` is on or after `fromMs` (last day inclusive).
 */
export function buildFeedVisibleDateClause(
  fromMs: number,
): Record<string, unknown> {
  return {
    $or: [{ date: { $gte: fromMs } }, { endDate: { $gte: fromMs } }],
  };
}

/**
 * Parses "YYYY-MM-DD" into local-day bounds.
 * - for "from": start of day (00:00:00.000)
 * - for "to": end of day (23:59:59.999)
 */
export function parseYyyyMmDdToMs(raw: unknown, field: 'from' | 'to'): number {
  if (typeof raw !== 'string') return NaN;
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN;
  const [y, m, d] = s.split('-').map((x) => Number(x));
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return NaN;
  if (field === 'to') dt.setHours(23, 59, 59, 999);
  else dt.setHours(0, 0, 0, 0);
  return dt.getTime();
}

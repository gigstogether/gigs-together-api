import { describe, expect, it } from 'vitest';
import { buildFeedVisibleDateClause } from './v1-gig-date-range.shared';

describe('buildFeedVisibleDateClause', () => {
  it('should include gigs starting on or after fromMs or still running with endDate', () => {
    const fromMs = Date.UTC(2026, 5, 4);
    expect(buildFeedVisibleDateClause(fromMs)).toEqual({
      $or: [{ date: { $gte: fromMs } }, { endDate: { $gte: fromMs } }],
    });
  });
});

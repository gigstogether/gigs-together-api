import { GigCandidateSource } from '../types/gig-candidate-source.enum';
import { describe, expect, it } from 'vitest';

import { GigCandidateStatus } from '../types/gig-candidate-status.enum';
import { GigCandidateRepositoryMapper } from './gig-candidate.repository.mapper';
import type { GigCandidateLeanDocument } from './gig-candidate.repository.mapper';

describe('GigCandidateRepositoryMapper', () => {
  it('should map lean document id and gigId to strings', () => {
    const doc: GigCandidateLeanDocument = {
      _id: { toString: () => '507f1f77bcf86cd799439099' },
      source: GigCandidateSource.User,
      title: 'Band',
      date: 1,
      city: 'Barcelona',
      country: 'ES',
      status: GigCandidateStatus.Pending,
      posts: [],
      suggestedBy: { userId: 1 },
      gigId: { toString: () => '507f1f77bcf86cd799439011' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    };

    const record = GigCandidateRepositoryMapper.toGigCandidateRecord(doc);

    expect(record.id).toBe('507f1f77bcf86cd799439099');
    expect(record.gigId).toBe('507f1f77bcf86cd799439011');
    expect(record.status).toBe(GigCandidateStatus.Pending);
  });
});

import { BadRequestException } from '@nestjs/common';

import { AdminGigUpdateBodyPipe } from './admin-gig-update-body.pipe';

const gig = {
  communityIds: ['507f1f77bcf86cd799439022'],
  venueIds: ['507f1f77bcf86cd799439033'],
  title: 'Radiohead',
  date: '2026-06-12',
  ticketsUrl: 'https://tickets.example/radiohead',
};

describe('AdminGigUpdateBodyPipe', () => {
  const pipe = new AdminGigUpdateBodyPipe();

  it('should parse Gig and expectedVersion from multipart form data', () => {
    expect(
      pipe.transform({
        gig: JSON.stringify(gig),
        expectedVersion: '4',
      }),
    ).toEqual({ gig, expectedVersion: 4 });
  });

  it('should preserve typed JSON request values', () => {
    expect(pipe.transform({ gig, expectedVersion: 2 })).toEqual({
      gig,
      expectedVersion: 2,
    });
  });

  it('should accept and normalize a one-character title', () => {
    expect(
      pipe.transform({ gig: { ...gig, title: ' B ' }, expectedVersion: 2 }),
    ).toEqual({
      gig: { ...gig, title: 'B' },
      expectedVersion: 2,
    });
  });

  it('should reject a title longer than 300 characters', () => {
    expect(() =>
      pipe.transform({
        gig: { ...gig, title: 'A'.repeat(301) },
        expectedVersion: 2,
      }),
    ).toThrow(/title must contain at most 300 characters/);
  });

  it('should reject an invalid expectedVersion', () => {
    expect(() => pipe.transform({ gig, expectedVersion: 'latest' })).toThrow(
      BadRequestException,
    );
  });

  it('should reject a Gig with a missing required field', () => {
    expect(() =>
      pipe.transform({
        gig: { ...gig, venueIds: undefined },
        expectedVersion: 2,
      }),
    ).toThrow('venueIds must be an array of strings');
  });

  it('should reject unsupported legacy Gig input', () => {
    expect(() =>
      pipe.transform({
        gig: { ...gig, legacyStatus: 'removed' },
        expectedVersion: 2,
      }),
    ).toThrow('gig contains unsupported field: legacyStatus');
  });
});

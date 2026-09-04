import { BadRequestException } from '@nestjs/common';

import { AdminGigUpdateBodyPipe } from './admin-gig-update-body.pipe';

const gig = {
  title: 'Radiohead',
  date: '2026-06-12',
  city: 'Barcelona',
  country: 'ES',
  venue: 'Palau Sant Jordi',
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

  it('should reject an invalid expectedVersion', () => {
    expect(() => pipe.transform({ gig, expectedVersion: 'latest' })).toThrow(
      BadRequestException,
    );
  });

  it('should reject a Gig with a missing required field', () => {
    expect(() =>
      pipe.transform({
        gig: { ...gig, venue: undefined },
        expectedVersion: 2,
      }),
    ).toThrow('venue must be a string');
  });

  it('should reject removed Gig status input', () => {
    expect(() =>
      pipe.transform({
        gig: { ...gig, status: 'Published' },
        expectedVersion: 2,
      }),
    ).toThrow('gig contains unsupported field: status');
  });
});

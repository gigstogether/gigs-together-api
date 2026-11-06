import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { GigCandidateBodyPipe } from './gig-candidate-body.pipe';

describe('GigCandidateBodyPipe', () => {
  const pipe = new GigCandidateBodyPipe();

  it('should parse gig JSON string from multipart body', () => {
    const result = pipe.transform({
      gig: JSON.stringify({
        communityIds: ['507f1f77bcf86cd799439011'],
        title: 'Band',
        date: '2026-08-01',
        city: 'Barcelona',
        country: 'ES',
      }),
    });

    expect(result.gig.title).toBe('Band');
  });

  it('should accept gig already provided as an object', () => {
    const result = pipe.transform({
      gig: {
        communityIds: ['507f1f77bcf86cd799439011'],
        title: 'Band',
        date: '2026-08-01',
        city: 'Barcelona',
        country: 'ES',
        venue: 'Venue',
      },
    });

    expect(result.gig).toEqual({
      communityIds: ['507f1f77bcf86cd799439011'],
      title: 'Band',
      date: '2026-08-01',
      city: 'Barcelona',
      country: 'ES',
      venue: 'Venue',
    });
  });

  it('should throw when gig is missing', () => {
    expect(() => pipe.transform({})).toThrow(BadRequestException);
  });

  it('should throw when gig JSON is invalid', () => {
    expect(() => pipe.transform({ gig: '{not-json' })).toThrow(
      BadRequestException,
    );
  });

  it('should throw when gig is an array', () => {
    expect(() => pipe.transform({ gig: [] })).toThrow(BadRequestException);
  });

  it('should throw when body is not an object', () => {
    expect(() => pipe.transform(null)).toThrow(BadRequestException);
  });

  it('should throw when a gig field is not a string', () => {
    expect(() =>
      pipe.transform({
        gig: {
          communityIds: ['507f1f77bcf86cd799439011'],
          title: 1,
          date: '2026-08-01',
          city: 'Barcelona',
          country: 'ES',
        },
      }),
    ).toThrow(BadRequestException);
  });

  it('should throw when Community assignments are missing', () => {
    expect(() =>
      pipe.transform({
        gig: {
          title: 'Band',
          date: '2026-08-01',
          city: 'Barcelona',
          country: 'ES',
        },
      }),
    ).toThrow(BadRequestException);
  });
});

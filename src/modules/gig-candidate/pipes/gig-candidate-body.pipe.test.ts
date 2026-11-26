import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { GigCandidateBodyPipe } from './gig-candidate-body.pipe';

describe('GigCandidateBodyPipe', () => {
  const pipe = new GigCandidateBodyPipe();

  it('should parse gig JSON string from multipart body', () => {
    const result = pipe.transform({
      gig: JSON.stringify({
        communityId: '507f1f77bcf86cd799439011',
        localityId: '507f1f77bcf86cd799439012',
        title: 'Band',
        date: '2026-08-01',
      }),
    });

    expect(result.gig.title).toBe('Band');
  });

  it('should accept gig already provided as an object', () => {
    const result = pipe.transform({
      gig: {
        communityId: '507f1f77bcf86cd799439011',
        localityId: '507f1f77bcf86cd799439012',
        title: 'Band',
        date: '2026-08-01',
        venueIds: ['507f1f77bcf86cd799439013', '507f1f77bcf86cd799439014'],
      },
    });

    expect(result.gig).toEqual({
      communityId: '507f1f77bcf86cd799439011',
      localityId: '507f1f77bcf86cd799439012',
      title: 'Band',
      date: '2026-08-01',
      venueIds: ['507f1f77bcf86cd799439013', '507f1f77bcf86cd799439014'],
    });
  });

  it('should accept gig without date', () => {
    const result = pipe.transform({
      gig: {
        communityId: '507f1f77bcf86cd799439011',
        localityId: '507f1f77bcf86cd799439012',
        title: 'Band',
      },
    });

    expect(result.gig).not.toHaveProperty('date');
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
          communityId: '507f1f77bcf86cd799439011',
          localityId: '507f1f77bcf86cd799439012',
          title: 1,
          date: '2026-08-01',
        },
      }),
    ).toThrow(BadRequestException);
  });

  it('should throw when Venue assignments are not an array of strings', () => {
    expect(() =>
      pipe.transform({
        gig: {
          communityId: '507f1f77bcf86cd799439011',
          localityId: '507f1f77bcf86cd799439012',
          title: 'Band',
          date: '2026-08-01',
          venueIds: ['507f1f77bcf86cd799439013', 1],
        },
      }),
    ).toThrow(BadRequestException);
  });

  it('should throw when Community assignment is missing', () => {
    expect(() =>
      pipe.transform({
        gig: {
          title: 'Band',
          localityId: '507f1f77bcf86cd799439012',
          date: '2026-08-01',
        },
      }),
    ).toThrow(BadRequestException);
  });
});

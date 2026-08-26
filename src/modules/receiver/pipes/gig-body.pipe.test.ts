import { BadRequestException } from '@nestjs/common';

import { GigBodyPipe } from './gig-body.pipe';

describe('GigBodyPipe', () => {
  const pipe = new GigBodyPipe();

  it('should parse expectedVersion from multipart form data', () => {
    expect(
      pipe.transform({
        gig: JSON.stringify({ title: 'Radiohead' }),
        expectedVersion: '4',
      }),
    ).toEqual({
      gig: { title: 'Radiohead' },
      expectedVersion: 4,
    });
  });

  it('should preserve a numeric expectedVersion from JSON', () => {
    expect(
      pipe.transform({
        gig: { title: 'Radiohead' },
        expectedVersion: 2,
      }),
    ).toEqual({
      gig: { title: 'Radiohead' },
      expectedVersion: 2,
    });
  });

  it('should reject an invalid expectedVersion', () => {
    expect(() =>
      pipe.transform({
        gig: { title: 'Radiohead' },
        expectedVersion: 'latest',
      }),
    ).toThrow(BadRequestException);
  });
});

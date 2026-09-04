import { Types } from 'mongoose';

import { GigSchema } from './gig.schema';

describe('GigSchema', () => {
  it('should require explicit visibility and integer version without defaults', () => {
    const visibilityOptions = GigSchema.path('isVisible').options;
    const versionOptions = GigSchema.path('version').options;

    expect(visibilityOptions.required).toBe(true);
    expect(visibilityOptions.default).toBeUndefined();
    expect(versionOptions.required).toBe(true);
    expect(versionOptions.default).toBeUndefined();
    expect(versionOptions.validate(2)).toBe(true);
    expect(versionOptions.validate(2.5)).toBe(false);
  });

  it('should remove Gig moderation status while retaining legacy suggestedBy', () => {
    const suggestedByOptions = GigSchema.path('suggestedBy').options;

    expect(GigSchema.path('status')).toBeUndefined();
    expect(suggestedByOptions.required).not.toBe(true);
  });

  it('should require immutable source as one discriminated union value', () => {
    const sourcePath = GigSchema.path('source');
    const validate = sourcePath.options.validate;

    expect(sourcePath.instance).toBe('Mixed');
    expect(sourcePath.options.required).toBe(true);
    expect(sourcePath.options.immutable).toBe(true);
    expect(validate).toEqual(expect.any(Function));
    expect(
      validate({
        type: 'user',
        userId: new Types.ObjectId(),
        origin: { type: 'messenger' },
      }),
    ).toBe(true);
    expect(
      validate({
        type: 'provider',
        provider: {
          name: 'setlistFm',
          externalEventId: 'event-1',
          sourceUrl: 'https://www.setlist.fm/setlist/event-1',
          fetchedAt: new Date('2026-08-25T10:00:00.000Z'),
        },
      }),
    ).toBe(true);
    expect(
      validate({
        type: 'user',
        userId: new Types.ObjectId(),
        origin: { type: 'admin' },
        provider: null,
      }),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(GigSchema.paths, 'source.userId'),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(GigSchema.paths, 'source.provider'),
    ).toBe(false);
  });

  it('should define a visibility index for location feed ordering', () => {
    const visibilityIndexes = GigSchema.indexes().filter(([fields]) =>
      Object.prototype.hasOwnProperty.call(fields, 'isVisible'),
    );

    expect(visibilityIndexes).toEqual([
      [
        { isVisible: 1, country: 1, city: 1, date: 1, _id: 1 },
        { collation: { locale: 'en', strength: 2 } },
      ],
    ]);
  });
});

import { Types } from 'mongoose';

import {
  fromObjectIdArray,
  isNonEmptyUniqueObjectIdArray,
  toObjectIdArray,
} from './mongoose-object-id-array';

describe('isNonEmptyUniqueObjectIdArray', () => {
  it('should accept non-empty unique ObjectIds', () => {
    expect(
      isNonEmptyUniqueObjectIdArray([
        new Types.ObjectId('507f1f77bcf86cd799439011'),
      ]),
    ).toBe(true);
  });

  it.each([
    { value: [] },
    { value: ['507f1f77bcf86cd799439011'] },
    {
      value: [
        new Types.ObjectId('507f1f77bcf86cd799439011'),
        new Types.ObjectId('507f1f77bcf86cd799439011'),
      ],
    },
  ])('should reject invalid ObjectId arrays %#', ({ value }) => {
    expect(isNonEmptyUniqueObjectIdArray(value)).toBe(false);
  });
});

describe('toObjectIdArray', () => {
  it('should map normalized strings to ObjectIds', () => {
    expect(
      toObjectIdArray(['507F1F77BCF86CD799439011'], 'Gig communityIds'),
    ).toEqual([new Types.ObjectId('507f1f77bcf86cd799439011')]);
  });

  it('should reject duplicate values', () => {
    expect(() =>
      toObjectIdArray(
        ['507f1f77bcf86cd799439011', '507F1F77BCF86CD799439011'],
        'Gig communityIds',
      ),
    ).toThrow(/must not contain duplicates/);
  });
});

describe('fromObjectIdArray', () => {
  it('should map ObjectIds to strings', () => {
    expect(
      fromObjectIdArray(
        [new Types.ObjectId('507f1f77bcf86cd799439011')],
        'Gig communityIds',
      ),
    ).toEqual(['507f1f77bcf86cd799439011']);
  });

  it('should reject duplicate ObjectIds', () => {
    const objectId = new Types.ObjectId('507f1f77bcf86cd799439011');

    expect(() =>
      fromObjectIdArray([objectId, objectId], 'Gig communityIds'),
    ).toThrow(/must not contain duplicates/);
  });
});

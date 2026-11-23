import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { V1AdminGigsGetQueryDto } from './v1-admin-gigs-get-query';

describe('V1AdminGigsGetQueryDto', () => {
  it('should accept sorting without a legacy status filter', async () => {
    const dto = plainToInstance(V1AdminGigsGetQueryDto, {
      sortBy: 'createdAt',
      sortOrder: 'desc',
      limit: '20',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.limit).toBe(20);
  });
});

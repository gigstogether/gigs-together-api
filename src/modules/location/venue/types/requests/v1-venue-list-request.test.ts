import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { V1VenuesGetQueryDto } from './v1-venue-list-request';

const LOCALITY_ID = '690a1fdb17f0a7771e9c1c32';

describe('V1VenuesGetQueryDto', () => {
  it('should accept a required Locality', async () => {
    const dto = plainToInstance(V1VenuesGetQueryDto, {
      localityId: LOCALITY_ID,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toEqual({ localityId: LOCALITY_ID });
  });

  it('should reject a query without a Locality', async () => {
    const dto = plainToInstance(V1VenuesGetQueryDto, {});

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});

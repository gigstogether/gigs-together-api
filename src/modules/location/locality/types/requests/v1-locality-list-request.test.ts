import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { V1LocalitiesGetQueryDto } from './v1-locality-list-request';

describe('V1LocalitiesGetQueryDto', () => {
  it('should normalize a required Country', async () => {
    const dto = plainToInstance(V1LocalitiesGetQueryDto, {
      countryIso: ' es ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toEqual({ countryIso: 'ES' });
  });

  it('should reject a query without a Country', async () => {
    const dto = plainToInstance(V1LocalitiesGetQueryDto, {});

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});

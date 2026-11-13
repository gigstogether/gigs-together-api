import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  V1AdminVenueCreateBodyDto,
  V1AdminVenuesGetQueryDto,
} from './v1-admin-venue-request';

const LOCALITY_ID = '690a1fdb17f0a7771e9c1c32';

describe('V1AdminVenueCreateBodyDto', () => {
  it('should accept a valid Venue request', async () => {
    const dto = plainToInstance(V1AdminVenueCreateBodyDto, {
      localityId: LOCALITY_ID,
      name: ' Sala Apolo ',
      aliases: ['Apolo'],
      isActive: true,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.name).toBe('Sala Apolo');
  });

  it('should reject a non-boolean active state', async () => {
    const dto = plainToInstance(V1AdminVenueCreateBodyDto, {
      localityId: LOCALITY_ID,
      name: 'Sala Apolo',
      aliases: [],
      isActive: 'true',
    });

    const errors = await validate(dto);

    expect(errors).toEqual([expect.objectContaining({ property: 'isActive' })]);
  });
});

describe('V1AdminVenuesGetQueryDto', () => {
  it('should parse an active-state query filter', async () => {
    const dto = plainToInstance(V1AdminVenuesGetQueryDto, {
      isActive: 'false',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.isActive).toBe(false);
  });

  it('should reject an invalid active-state query filter', async () => {
    const dto = plainToInstance(V1AdminVenuesGetQueryDto, {
      isActive: 'yes',
    });

    const errors = await validate(dto);

    expect(errors).toEqual([expect.objectContaining({ property: 'isActive' })]);
  });
});

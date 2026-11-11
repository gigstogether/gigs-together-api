import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  V1AdminPlaceCreateBodyDto,
  V1AdminPlacesGetQueryDto,
} from './v1-admin-place-request';

const LOCALITY_ID = '690a1fdb17f0a7771e9c1c32';

describe('V1AdminPlaceCreateBodyDto', () => {
  it('should accept a valid Place request', async () => {
    const dto = plainToInstance(V1AdminPlaceCreateBodyDto, {
      localityId: LOCALITY_ID,
      name: ' Sala Apolo ',
      aliases: ['Apolo'],
      isActive: true,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.name).toBe('Sala Apolo');
  });

  it('should reject a non-boolean active state', async () => {
    const dto = plainToInstance(V1AdminPlaceCreateBodyDto, {
      localityId: LOCALITY_ID,
      name: 'Sala Apolo',
      aliases: [],
      isActive: 'true',
    });

    const errors = await validate(dto);

    expect(errors).toEqual([expect.objectContaining({ property: 'isActive' })]);
  });
});

describe('V1AdminPlacesGetQueryDto', () => {
  it('should parse an active-state query filter', async () => {
    const dto = plainToInstance(V1AdminPlacesGetQueryDto, {
      isActive: 'false',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.isActive).toBe(false);
  });

  it('should reject an invalid active-state query filter', async () => {
    const dto = plainToInstance(V1AdminPlacesGetQueryDto, {
      isActive: 'yes',
    });

    const errors = await validate(dto);

    expect(errors).toEqual([expect.objectContaining({ property: 'isActive' })]);
  });
});

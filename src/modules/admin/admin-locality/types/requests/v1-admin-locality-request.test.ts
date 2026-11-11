import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { V1AdminLocalityCreateBodyDto } from './v1-admin-locality-request';

const REGION_ID = '690a1fdb17f0a7771e9c1c31';

describe('V1AdminLocalityCreateBodyDto', () => {
  it('should accept a valid Locality request', async () => {
    const dto = plainToInstance(V1AdminLocalityCreateBodyDto, {
      regionId: REGION_ID,
      name: ' Barcelona ',
      aliases: ['Barna', 'BCN'],
      timeZone: ' Europe/Madrid ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.name).toBe('Barcelona');
    expect(dto.timeZone).toBe('Europe/Madrid');
  });

  it('should reject an invalid time zone', async () => {
    const dto = plainToInstance(V1AdminLocalityCreateBodyDto, {
      regionId: REGION_ID,
      name: 'Barcelona',
      aliases: [],
      timeZone: 'Europe/Invalid',
    });

    const errors = await validate(dto);

    expect(errors).toEqual([expect.objectContaining({ property: 'timeZone' })]);
  });
});

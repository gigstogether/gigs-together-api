import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  V1AdminLocalityCreateBodyDto,
  V1AdminLocalityPatchBodyDto,
} from './v1-admin-locality-request';

describe('V1AdminLocalityCreateBodyDto', () => {
  it('should accept a valid Locality request', async () => {
    const dto = plainToInstance(V1AdminLocalityCreateBodyDto, {
      countryIso: ' es ',
      name: ' Barcelona ',
      qualifier: ' Barcelona province ',
      aliases: ['Barna', 'BCN'],
      timeZone: ' Europe/Madrid ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.name).toBe('Barcelona');
    expect(dto.countryIso).toBe('ES');
    expect(dto.qualifier).toBe('Barcelona province');
    expect(dto.timeZone).toBe('Europe/Madrid');
  });

  it('should reject an invalid time zone', async () => {
    const dto = plainToInstance(V1AdminLocalityCreateBodyDto, {
      countryIso: 'ES',
      name: 'Barcelona',
      aliases: [],
      timeZone: 'Europe/Invalid',
    });

    const errors = await validate(dto);

    expect(errors).toEqual([expect.objectContaining({ property: 'timeZone' })]);
  });

  it('should reject a blank qualifier', async () => {
    const dto = plainToInstance(V1AdminLocalityCreateBodyDto, {
      countryIso: 'ES',
      name: 'Barcelona',
      qualifier: ' ',
      aliases: [],
      timeZone: 'Europe/Madrid',
    });

    const errors = await validate(dto);

    expect(errors).toEqual([
      expect.objectContaining({ property: 'qualifier' }),
    ]);
  });
});

describe('V1AdminLocalityPatchBodyDto', () => {
  it('should accept null to clear a qualifier', async () => {
    const dto = plainToInstance(V1AdminLocalityPatchBodyDto, {
      qualifier: null,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.qualifier).toBeNull();
  });
});

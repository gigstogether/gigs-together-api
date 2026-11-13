import { mapV1LocalityListItemResponse } from './locality.mapper';

describe('mapV1LocalityListItemResponse', () => {
  it('should preserve the qualifier in the public Locality label data', () => {
    expect(
      mapV1LocalityListItemResponse({
        id: '690a1fdb17f0a7771e9c1c32',
        countryIso: 'ES',
        name: 'San Pedro',
        qualifier: 'Albacete province',
        aliases: ['San Pedro de Albacete'],
        timeZone: 'Europe/Madrid',
      }),
    ).toEqual({
      id: '690a1fdb17f0a7771e9c1c32',
      countryIso: 'ES',
      name: 'San Pedro',
      qualifier: 'Albacete province',
      timeZone: 'Europe/Madrid',
    });
  });
});

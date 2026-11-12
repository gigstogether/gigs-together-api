import { Types } from 'mongoose';
import { LocalityRepositoryMapper } from './locality.repository.mapper';
import type { LocalityLeanDocument } from './locality.repository.mapper';

const LOCALITY_ID = '690a1fdb17f0a7771e9c1c32';

function createLocalityDocument(): LocalityLeanDocument {
  return {
    _id: new Types.ObjectId(LOCALITY_ID),
    countryIso: 'ES',
    name: 'Barcelona',
    qualifier: 'Barcelona province',
    aliases: ['Barna', 'BCN'],
    timeZone: 'Europe/Madrid',
  };
}

describe('LocalityRepositoryMapper', () => {
  it('should map a stored Locality to the domain model', () => {
    expect(
      LocalityRepositoryMapper.toLocality(createLocalityDocument()),
    ).toEqual({
      id: LOCALITY_ID,
      countryIso: 'ES',
      name: 'Barcelona',
      qualifier: 'Barcelona province',
      aliases: ['Barna', 'BCN'],
      timeZone: 'Europe/Madrid',
    });
  });

  it('should reject an invalid Country ISO', () => {
    const doc = createLocalityDocument();
    doc.countryIso = '';

    expect(() => LocalityRepositoryMapper.toLocality(doc)).toThrow(
      'Locality countryIso must be a non-empty string',
    );
  });

  it('should reject an invalid qualifier', () => {
    const doc = createLocalityDocument();
    doc.qualifier = '';

    expect(() => LocalityRepositoryMapper.toLocality(doc)).toThrow(
      'Locality qualifier must be a non-empty canonical name when provided',
    );
  });

  it('should reject duplicate aliases', () => {
    const doc = createLocalityDocument();
    doc.aliases = ['BCN', 'bcn'];

    expect(() => LocalityRepositoryMapper.toLocality(doc)).toThrow(
      'Locality aliases must be unique non-empty names',
    );
  });

  it('should reject an invalid time zone', () => {
    const doc = createLocalityDocument();
    doc.timeZone = 'Europe/Invalid';

    expect(() => LocalityRepositoryMapper.toLocality(doc)).toThrow(
      'Locality timeZone must be a valid IANA time zone',
    );
  });
});

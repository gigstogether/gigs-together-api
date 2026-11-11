import { Types } from 'mongoose';
import { LocalityRepositoryMapper } from './locality.repository.mapper';
import type { LocalityLeanDocument } from './locality.repository.mapper';

const LOCALITY_ID = '690a1fdb17f0a7771e9c1c32';
const REGION_ID = '690a1fdb17f0a7771e9c1c31';

function createLocalityDocument(): LocalityLeanDocument {
  return {
    _id: new Types.ObjectId(LOCALITY_ID),
    regionId: new Types.ObjectId(REGION_ID),
    name: 'Barcelona',
    aliases: ['Barna', 'BCN'],
    timeZone: 'Europe/Madrid',
  };
}

describe('LocalityRepositoryMapper', () => {
  it('should map a Region id to its stored ObjectId', () => {
    expect(LocalityRepositoryMapper.toStoredRegionId(REGION_ID)).toEqual(
      new Types.ObjectId(REGION_ID),
    );
  });

  it('should reject an invalid Region id before persistence', () => {
    expect(() => LocalityRepositoryMapper.toStoredRegionId('invalid')).toThrow(
      'Region id must be a valid ObjectId',
    );
  });

  it('should map a stored Locality to the domain model', () => {
    expect(
      LocalityRepositoryMapper.toLocality(createLocalityDocument()),
    ).toEqual({
      id: LOCALITY_ID,
      regionId: REGION_ID,
      name: 'Barcelona',
      aliases: ['Barna', 'BCN'],
      timeZone: 'Europe/Madrid',
    });
  });

  it('should reject an invalid Region id', () => {
    const doc = createLocalityDocument();
    doc.regionId = 'invalid';

    expect(() => LocalityRepositoryMapper.toLocality(doc)).toThrow(
      'Locality regionId must be an ObjectId',
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

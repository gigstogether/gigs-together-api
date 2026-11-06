import { Types } from 'mongoose';
import { RegionRepositoryMapper } from './region.repository.mapper';
import type { RegionLeanDocument } from './region.repository.mapper';

const REGION_ID = '690a1fdb17f0a7771e9c1c31';

function createRegionDocument(): RegionLeanDocument {
  return {
    _id: new Types.ObjectId(REGION_ID),
    countryIso: 'ES',
    name: 'Catalonia',
    aliases: ['Catalunya', 'Cataluña'],
  };
}

describe('RegionRepositoryMapper', () => {
  it('should map a stored Region to the domain model', () => {
    expect(RegionRepositoryMapper.toRegion(createRegionDocument())).toEqual({
      id: REGION_ID,
      countryIso: 'ES',
      name: 'Catalonia',
      aliases: ['Catalunya', 'Cataluña'],
    });
  });

  it('should reject an empty country ISO', () => {
    const doc = createRegionDocument();
    doc.countryIso = '';

    expect(() => RegionRepositoryMapper.toRegion(doc)).toThrow(
      'Region countryIso must be a non-empty string',
    );
  });

  it('should reject duplicate aliases', () => {
    const doc = createRegionDocument();
    doc.aliases = ['Catalunya', 'CATALUNYA'];

    expect(() => RegionRepositoryMapper.toRegion(doc)).toThrow(
      'Region aliases must be unique non-empty names',
    );
  });
});

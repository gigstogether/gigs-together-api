import { Types } from 'mongoose';
import { PlaceRepositoryMapper } from './place.repository.mapper';
import type { PlaceLeanDocument } from './place.repository.mapper';

const PLACE_ID = '690a1fdb17f0a7771e9c1c33';
const LOCALITY_ID = '690a1fdb17f0a7771e9c1c32';

function createPlaceDocument(): PlaceLeanDocument {
  return {
    _id: new Types.ObjectId(PLACE_ID),
    localityId: new Types.ObjectId(LOCALITY_ID),
    name: 'Sala Apolo',
    aliases: ['Apolo'],
    isActive: true,
  };
}

describe('PlaceRepositoryMapper', () => {
  it('should map a Locality id to its stored ObjectId', () => {
    expect(PlaceRepositoryMapper.toStoredLocalityId(LOCALITY_ID)).toEqual(
      new Types.ObjectId(LOCALITY_ID),
    );
  });

  it('should reject an invalid Locality id before persistence', () => {
    expect(() => PlaceRepositoryMapper.toStoredLocalityId('invalid')).toThrow(
      'Locality id must be a valid ObjectId',
    );
  });

  it('should map a stored Place to the domain model', () => {
    expect(PlaceRepositoryMapper.toPlace(createPlaceDocument())).toEqual({
      id: PLACE_ID,
      localityId: LOCALITY_ID,
      name: 'Sala Apolo',
      aliases: ['Apolo'],
      isActive: true,
    });
  });

  it('should reject an invalid Locality reference', () => {
    const doc = createPlaceDocument();
    doc.localityId = 'invalid';

    expect(() => PlaceRepositoryMapper.toPlace(doc)).toThrow(
      'Place localityId must be an ObjectId',
    );
  });

  it('should reject duplicate aliases', () => {
    const doc = createPlaceDocument();
    doc.aliases = ['Apolo', 'APOLO'];

    expect(() => PlaceRepositoryMapper.toPlace(doc)).toThrow(
      'Place aliases must be unique non-empty names',
    );
  });
});

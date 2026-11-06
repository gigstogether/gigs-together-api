import { Types } from 'mongoose';
import { CommunityRepositoryMapper } from './community.repository.mapper';
import type { CommunityLeanDocument } from './community.repository.mapper';

const COMMUNITY_ID = '690a1fdb17f0a7771e9c1c21';

function createCommunityDocument(): CommunityLeanDocument {
  return {
    _id: new Types.ObjectId(COMMUNITY_ID),
    countryIso: 'ES',
    slug: 'barcelona',
    nameTranslationKey: 'barcelona.name',
    timeZone: 'Europe/Madrid',
    isActive: true,
  };
}

describe('CommunityRepositoryMapper', () => {
  it('should map a stored Community to the domain model', () => {
    expect(
      CommunityRepositoryMapper.toCommunity(createCommunityDocument()),
    ).toEqual({
      id: COMMUNITY_ID,
      countryIso: 'ES',
      slug: 'barcelona',
      nameTranslationKey: 'barcelona.name',
      timeZone: 'Europe/Madrid',
      isActive: true,
    });
  });

  it('should reject a Community without an ObjectId', () => {
    const doc = createCommunityDocument();
    doc._id = COMMUNITY_ID;

    expect(() => CommunityRepositoryMapper.toCommunity(doc)).toThrow(
      'Community _id must be an ObjectId',
    );
  });

  it('should reject an invalid country ISO code', () => {
    const doc = createCommunityDocument();
    doc.countryIso = 'es';

    expect(() => CommunityRepositoryMapper.toCommunity(doc)).toThrow(
      'Community countryIso must be an uppercase ISO 3166-1 alpha-2 code',
    );
  });

  it('should reject an invalid route slug', () => {
    const doc = createCommunityDocument();
    doc.slug = 'Barcelona City';

    expect(() => CommunityRepositoryMapper.toCommunity(doc)).toThrow(
      'Community slug must be a lowercase route slug',
    );
  });

  it('should reject an invalid name translation key', () => {
    const doc = createCommunityDocument();
    doc.nameTranslationKey = 'Community.Barcelona';

    expect(() => CommunityRepositoryMapper.toCommunity(doc)).toThrow(
      'Community nameTranslationKey must be a valid key',
    );
  });

  it('should reject an invalid time zone', () => {
    const doc = createCommunityDocument();
    doc.timeZone = 'Europe/Invalid';

    expect(() => CommunityRepositoryMapper.toCommunity(doc)).toThrow(
      'Community timeZone must be a valid IANA time zone',
    );
  });

  it('should reject a non-boolean active state', () => {
    const doc = createCommunityDocument();
    doc.isActive = 1;

    expect(() => CommunityRepositoryMapper.toCommunity(doc)).toThrow(
      'Community isActive must be a boolean',
    );
  });
});

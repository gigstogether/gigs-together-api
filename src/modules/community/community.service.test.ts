import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CommunityRouteConflictError } from './community.errors';
import { CountryService } from '@modules/location/country/country.service';
import { TranslationService } from '@modules/translation/translation.service';
import type { StoredTranslationRecord } from '@modules/translation/types/translation-record.types';
import { CommunityService } from './community.service';
import { COMMUNITY_REPOSITORY } from './repositories/community.repository';

const COMMUNITY = {
  id: 'community-id',
  countryIso: 'ES',
  slug: 'barcelona',
  nameTranslationKey: 'barcelona.name',
  timeZone: 'Europe/Madrid',
  isActive: true,
};
const COMMUNITY_ID = '507f1f77bcf86cd799439011';
const COMMUNITY_NAME: StoredTranslationRecord = {
  id: '507f1f77bcf86cd799439022',
  namespace: 'community',
  locale: 'en',
  key: 'barcelona.name',
  value: 'Barcelona',
  format: 'plain',
  kind: 'text',
  isActive: true,
};

describe('CommunityService', () => {
  let service: CommunityService;

  const findActiveMock = vi.fn();
  const findByIdMock = vi.fn();
  const findByIdsMock = vi.fn();
  const findByRouteMock = vi.fn();
  const hasCountryMock = vi.fn();
  const createMock = vi.fn();
  const updateMock = vi.fn();
  const findAllMock = vi.fn();
  const findRecordMock = vi.fn<TranslationService['findRecord']>();

  beforeEach(async () => {
    createMock.mockReset();
    updateMock.mockReset();
    findAllMock.mockReset();
    findActiveMock.mockReset();
    findByIdMock.mockReset();
    findByIdsMock.mockReset();
    findByRouteMock.mockReset();
    hasCountryMock.mockReset();
    hasCountryMock.mockReturnValue(true);
    findRecordMock.mockReset();
    findRecordMock.mockResolvedValue(COMMUNITY_NAME);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityService,
        {
          provide: COMMUNITY_REPOSITORY,
          useValue: {
            create: createMock,
            update: updateMock,
            findAll: findAllMock,
            findActive: findActiveMock,
            findById: findByIdMock,
            findByIds: findByIdsMock,
            findByRoute: findByRouteMock,
          },
        },
        {
          provide: CountryService,
          useValue: { hasCountry: hasCountryMock },
        },
        {
          provide: TranslationService,
          useValue: { findRecord: findRecordMock },
        },
      ],
    }).compile();

    service = module.get<CommunityService>(CommunityService);
  });

  it('should include inactive Communities when reading the admin catalog', async () => {
    const inactive = { ...COMMUNITY, isActive: false };
    findAllMock.mockResolvedValue([inactive]);
    await expect(service.findAll()).resolves.toEqual([inactive]);
  });

  it('should normalize Community fields when creating a Community', async () => {
    createMock.mockResolvedValue(COMMUNITY);
    await expect(
      service.createCommunity({
        ...COMMUNITY,
        countryIso: ' es ',
        slug: ' Barcelona ',
        nameTranslationKey: ' barcelona.name ',
        timeZone: ' Europe/Madrid ',
      }),
    ).resolves.toEqual(COMMUNITY);
    expect(createMock).toHaveBeenCalledWith({
      countryIso: 'ES',
      slug: 'barcelona',
      nameTranslationKey: 'barcelona.name',
      timeZone: 'Europe/Madrid',
      isActive: true,
    });
  });

  it('should query one name in the default locale when creating an active Community directly', async () => {
    createMock.mockResolvedValue(COMMUNITY);
    await service.createCommunity(COMMUNITY);
    expect(findRecordMock).toHaveBeenCalledWith({
      namespace: 'community',
      locale: 'en',
      key: 'barcelona.name',
    });
  });

  it.each([
    { label: 'missing', record: null },
    { label: 'inactive', record: { ...COMMUNITY_NAME, isActive: false } },
    { label: 'template', record: { ...COMMUNITY_NAME, kind: 'template' } },
    { label: 'ICU', record: { ...COMMUNITY_NAME, format: 'icu' } },
    { label: 'blank', record: { ...COMMUNITY_NAME, value: '   ' } },
  ] satisfies { label: string; record: StoredTranslationRecord | null }[])(
    'should reject active creation when the name is $label',
    async ({ record }) => {
      findRecordMock.mockResolvedValue(record);
      const creation = service.createCommunity(COMMUNITY);
      await expect(creation).rejects.toBeInstanceOf(BadRequestException);
      await expect(creation).rejects.toThrow('plain-text name for locale "en"');
      expect(createMock).not.toHaveBeenCalled();
    },
  );

  it('should skip name lookup when creating an inactive Community', async () => {
    const inactive = { ...COMMUNITY, isActive: false };
    createMock.mockResolvedValue(inactive);
    await expect(service.createCommunity(inactive)).resolves.toEqual(inactive);
    expect(findRecordMock).not.toHaveBeenCalled();
  });

  it('should reject activation when a draft has no name in the default locale', async () => {
    findByIdMock.mockResolvedValue({ ...COMMUNITY, isActive: false });
    findRecordMock.mockResolvedValue(null);
    const activation = service.updateCommunity({
      id: COMMUNITY_ID,
      isActive: true,
    });
    await expect(activation).rejects.toBeInstanceOf(BadRequestException);
    await expect(activation).rejects.toThrow('plain-text name for locale "en"');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('should check the new name when changing an active Community translation key', async () => {
    findByIdMock.mockResolvedValue(COMMUNITY);
    findRecordMock.mockResolvedValue(null);
    await expect(
      service.updateCommunity({
        id: COMMUNITY_ID,
        nameTranslationKey: 'girona.name',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findRecordMock).toHaveBeenCalledWith({
      namespace: 'community',
      locale: 'en',
      key: 'girona.name',
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('should allow activation when the default-locale name is valid', async () => {
    findByIdMock.mockResolvedValue({ ...COMMUNITY, isActive: false });
    updateMock.mockResolvedValue(COMMUNITY);
    await expect(
      service.updateCommunity({ id: COMMUNITY_ID, isActive: true }),
    ).resolves.toEqual(COMMUNITY);
    expect(findRecordMock).toHaveBeenCalledOnce();
  });

  it('should skip name lookup when deactivating a Community with a missing name', async () => {
    findByIdMock.mockResolvedValue(COMMUNITY);
    findRecordMock.mockResolvedValue(null);
    const inactive = { ...COMMUNITY, isActive: false };
    updateMock.mockResolvedValue(inactive);
    await expect(
      service.updateCommunity({ id: COMMUNITY_ID, isActive: false }),
    ).resolves.toEqual(inactive);
    expect(findRecordMock).not.toHaveBeenCalled();
  });

  it('should propagate a translation lookup failure without creating a Community', async () => {
    const failure = new Error('Translation storage unavailable');
    findRecordMock.mockRejectedValue(failure);
    await expect(service.createCommunity(COMMUNITY)).rejects.toBe(failure);
    expect(createMock).not.toHaveBeenCalled();
  });

  it.each([
    { slug: 'bad/slug' },
    { timeZone: 'Europe/Invalid' },
    { nameTranslationKey: 'bad_key' },
  ])(
    'should reject invalid fields when creating a Community with %j',
    async (invalid) => {
      const creation = service.createCommunity({ ...COMMUNITY, ...invalid });
      await expect(creation).rejects.toBeInstanceOf(BadRequestException);
      expect(createMock).not.toHaveBeenCalled();
    },
  );

  it('should reject an unsupported country when creating a Community', async () => {
    hasCountryMock.mockReturnValue(false);
    await expect(service.createCommunity(COMMUNITY)).rejects.toThrow(
      'Community countryIso must be a supported ISO 3166-1 alpha-2 code',
    );
  });

  it('should report a route conflict when the repository rejects a duplicate', async () => {
    createMock.mockRejectedValue(
      new CommunityRouteConflictError({ code: 11000 }),
    );
    const creation = service.createCommunity(COMMUNITY);
    await expect(creation).rejects.toBeInstanceOf(ConflictException);
    await expect(creation).rejects.toThrow(
      'A Community with this country and slug already exists',
    );
  });

  it('should retain unspecified fields when deactivating a Community', async () => {
    findByIdMock.mockResolvedValue(COMMUNITY);
    updateMock.mockResolvedValue({ ...COMMUNITY, isActive: false });
    await expect(
      service.updateCommunity({ id: COMMUNITY_ID, isActive: false }),
    ).resolves.toMatchObject({ isActive: false });
    expect(updateMock).toHaveBeenCalledWith({
      id: COMMUNITY_ID,
      expected: COMMUNITY,
      data: {
        countryIso: 'ES',
        slug: 'barcelona',
        nameTranslationKey: 'barcelona.name',
        timeZone: 'Europe/Madrid',
        isActive: false,
      },
    });
  });

  it('should reject an empty patch when no Community fields are provided', async () => {
    await expect(service.updateCommunity({ id: COMMUNITY_ID })).rejects.toThrow(
      'Community update must include at least one field',
    );
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('should report a missing Community when it disappears during an update', async () => {
    findByIdMock.mockResolvedValueOnce(COMMUNITY).mockResolvedValueOnce(null);
    updateMock.mockResolvedValue(null);
    await expect(
      service.updateCommunity({ id: COMMUNITY_ID, isActive: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should report a conflict when the Community changes before its update is stored', async () => {
    findByIdMock.mockResolvedValue(COMMUNITY);
    updateMock.mockResolvedValue(null);
    const update = service.updateCommunity({
      id: COMMUNITY_ID,
      isActive: false,
    });
    await expect(update).rejects.toBeInstanceOf(ConflictException);
    await expect(update).rejects.toThrow('Community changed while saving');
  });

  it('should find a Community by id through the repository', async () => {
    findByIdMock.mockResolvedValue(COMMUNITY);

    await expect(service.findById('community-id')).resolves.toEqual(COMMUNITY);
    expect(findByIdMock).toHaveBeenCalledWith('community-id');
    expect(hasCountryMock).toHaveBeenCalledWith('ES');
  });

  it('should find Communities by ids through the repository', async () => {
    const ids = ['first-community-id', 'second-community-id'];
    findByIdsMock.mockResolvedValue([
      { ...COMMUNITY, id: 'first-community-id' },
      { ...COMMUNITY, id: 'second-community-id' },
    ]);

    await expect(service.findByIds(ids)).resolves.toEqual([
      { ...COMMUNITY, id: 'first-community-id' },
      { ...COMMUNITY, id: 'second-community-id' },
    ]);
    expect(findByIdsMock).toHaveBeenCalledWith(ids);
  });

  it('should find a Community by a valid route', async () => {
    findByRouteMock.mockResolvedValue({ id: 'community-id' });
    const params = { countryIso: 'ES', communitySlug: 'barcelona' };

    await expect(service.findByRoute(params)).resolves.toEqual({
      id: 'community-id',
    });
    expect(hasCountryMock).toHaveBeenCalledWith('ES');
    expect(findByRouteMock).toHaveBeenCalledWith(params);
  });

  it('should return null for a route outside the Country catalog', async () => {
    hasCountryMock.mockReturnValue(false);

    await expect(
      service.findByRoute({
        countryIso: 'ZZ',
        communitySlug: 'barcelona',
      }),
    ).resolves.toBeNull();
    expect(findByRouteMock).not.toHaveBeenCalled();
  });

  it('should reject an invalid route slug', async () => {
    await expect(
      service.findByRoute({
        countryIso: 'ES',
        communitySlug: 'Barcelona City',
      }),
    ).rejects.toThrow('Community slug must be a lowercase route slug');
    expect(hasCountryMock).not.toHaveBeenCalled();
    expect(findByRouteMock).not.toHaveBeenCalled();
  });

  it('should return active Communities through the repository', async () => {
    findActiveMock.mockResolvedValue([COMMUNITY]);

    await expect(service.findActive()).resolves.toEqual([COMMUNITY]);
    expect(findActiveMock).toHaveBeenCalledOnce();
  });

  it('should validate and normalize active Community assignments', async () => {
    findByIdsMock.mockResolvedValue([
      { ...COMMUNITY, id: COMMUNITY_ID, isActive: true },
    ]);

    await expect(
      service.requireActiveCommunityIds([COMMUNITY_ID.toUpperCase()]),
    ).resolves.toEqual([COMMUNITY_ID]);
    expect(findByIdsMock).toHaveBeenCalledWith([COMMUNITY_ID]);
  });

  it('should reject Community assignments that are missing or inactive', async () => {
    findByIdsMock.mockResolvedValue([]);

    await expect(
      service.requireActiveCommunityIds([COMMUNITY_ID]),
    ).rejects.toThrow('communityIds must reference active Communities');
  });

  it.each([
    { communityIds: [], message: 'at least one Community id' },
    { communityIds: ['invalid'], message: 'valid Community ids' },
    {
      communityIds: [COMMUNITY_ID, COMMUNITY_ID.toUpperCase()],
      message: 'must not contain duplicates',
    },
  ])(
    'should reject invalid Community assignments %#',
    async ({ communityIds, message }) => {
      await expect(
        service.requireActiveCommunityIds(communityIds),
      ).rejects.toThrow(message);
      expect(findByIdsMock).not.toHaveBeenCalled();
    },
  );

  it('should reject a stored Community outside the Country catalog', async () => {
    findActiveMock.mockResolvedValue([
      { id: 'community-id', countryIso: 'ZZ' },
    ]);
    hasCountryMock.mockReturnValue(false);

    await expect(service.findActive()).rejects.toThrow(
      'Community countryIso "ZZ" must be a supported ISO 3166-1 alpha-2 code',
    );
  });
});

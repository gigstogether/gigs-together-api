import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { CountryService } from '../country/country.service';
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

describe('CommunityService', () => {
  let service: CommunityService;

  const findActiveMock = vi.fn();
  const findByIdMock = vi.fn();
  const findByIdsMock = vi.fn();
  const findByRouteMock = vi.fn();
  const hasCountryMock = vi.fn();

  beforeEach(async () => {
    findActiveMock.mockReset();
    findByIdMock.mockReset();
    findByIdsMock.mockReset();
    findByRouteMock.mockReset();
    hasCountryMock.mockReset();
    hasCountryMock.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityService,
        {
          provide: COMMUNITY_REPOSITORY,
          useValue: {
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
      ],
    }).compile();

    service = module.get<CommunityService>(CommunityService);
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
    hasCountryMock.mockResolvedValue(false);

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

  it('should reject a stored Community outside the Country catalog', async () => {
    findActiveMock.mockResolvedValue([
      { id: 'community-id', countryIso: 'ZZ' },
    ]);
    hasCountryMock.mockResolvedValue(false);

    await expect(service.findActive()).rejects.toThrow(
      'Community countryIso "ZZ" must reference an existing Country',
    );
  });
});

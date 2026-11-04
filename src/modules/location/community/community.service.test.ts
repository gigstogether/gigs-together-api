import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { CommunityService } from './community.service';
import { COMMUNITY_REPOSITORY } from './repositories/community.repository';

describe('CommunityService', () => {
  let service: CommunityService;

  const findActiveMock = vi.fn();
  const findByIdMock = vi.fn();
  const findByRouteMock = vi.fn();

  beforeEach(async () => {
    findActiveMock.mockReset();
    findByIdMock.mockReset();
    findByRouteMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityService,
        {
          provide: COMMUNITY_REPOSITORY,
          useValue: {
            findActive: findActiveMock,
            findById: findByIdMock,
            findByRoute: findByRouteMock,
          },
        },
      ],
    }).compile();

    service = module.get<CommunityService>(CommunityService);
  });

  it('should find a Community by id through the repository', async () => {
    findByIdMock.mockResolvedValue({ id: 'community-id' });

    await expect(service.findById('community-id')).resolves.toEqual({
      id: 'community-id',
    });
    expect(findByIdMock).toHaveBeenCalledWith('community-id');
  });

  it('should find a Community by a valid route', async () => {
    findByRouteMock.mockResolvedValue({ id: 'community-id' });
    const params = { countryIso: 'ES', communitySlug: 'barcelona' };

    await expect(service.findByRoute(params)).resolves.toEqual({
      id: 'community-id',
    });
    expect(findByRouteMock).toHaveBeenCalledWith(params);
  });

  it('should reject an invalid route country ISO code', () => {
    expect(() =>
      service.findByRoute({
        countryIso: 'es',
        communitySlug: 'barcelona',
      }),
    ).toThrow(
      'Community countryIso must be an uppercase ISO 3166-1 alpha-2 code',
    );
    expect(findByRouteMock).not.toHaveBeenCalled();
  });

  it('should reject an invalid route slug', () => {
    expect(() =>
      service.findByRoute({
        countryIso: 'ES',
        communitySlug: 'Barcelona City',
      }),
    ).toThrow('Community slug must be a lowercase route slug');
    expect(findByRouteMock).not.toHaveBeenCalled();
  });

  it('should return active Communities through the repository', async () => {
    findActiveMock.mockResolvedValue([{ id: 'community-id' }]);

    await expect(service.findActive()).resolves.toEqual([
      { id: 'community-id' },
    ]);
    expect(findActiveMock).toHaveBeenCalledOnce();
  });
});

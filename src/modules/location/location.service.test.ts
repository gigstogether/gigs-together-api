import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { LocationService } from './location.service';
import { LOCATION_REPOSITORY } from './repositories/location.repository';

describe('LocationService', () => {
  let service: LocationService;

  const findCountriesOrderedByIsoMock = vi.fn();

  beforeEach(async () => {
    findCountriesOrderedByIsoMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationService,
        {
          provide: LOCATION_REPOSITORY,
          useValue: {
            findCountriesOrderedByIso: findCountriesOrderedByIsoMock,
          },
        },
      ],
    }).compile();

    service = module.get<LocationService>(LocationService);
  });

  it('should return countries from the repository', async () => {
    findCountriesOrderedByIsoMock.mockResolvedValue([
      { iso: 'ES' },
      { iso: 'FR' },
    ]);

    await expect(service.getCountriesV1()).resolves.toEqual([
      { iso: 'ES' },
      { iso: 'FR' },
    ]);
    expect(findCountriesOrderedByIsoMock).toHaveBeenCalledOnce();
  });
});

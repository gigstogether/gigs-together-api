import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { CountryService } from './country.service';
import { COUNTRY_REPOSITORY } from './repositories/country.repository';

describe('CountryService', () => {
  let service: CountryService;

  const findAllOrderedByIsoMock = vi.fn();

  beforeEach(async () => {
    findAllOrderedByIsoMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CountryService,
        {
          provide: COUNTRY_REPOSITORY,
          useValue: {
            findAllOrderedByIso: findAllOrderedByIsoMock,
          },
        },
      ],
    }).compile();

    service = module.get<CountryService>(CountryService);
  });

  it('should return countries from the repository', async () => {
    findAllOrderedByIsoMock.mockResolvedValue([{ iso: 'ES' }, { iso: 'FR' }]);

    await expect(service.getCountries()).resolves.toEqual([
      { iso: 'ES' },
      { iso: 'FR' },
    ]);
    expect(findAllOrderedByIsoMock).toHaveBeenCalledOnce();
  });
});

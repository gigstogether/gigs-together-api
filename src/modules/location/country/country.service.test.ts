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

  it('should check country existence through the cached catalog', async () => {
    findAllOrderedByIsoMock.mockResolvedValue([{ iso: 'ES' }, { iso: 'FR' }]);

    await expect(service.hasCountry('ES')).resolves.toBe(true);
    await expect(service.hasCountry('DE')).resolves.toBe(false);
    expect(findAllOrderedByIsoMock).toHaveBeenCalledOnce();
  });

  it('should reject ISO codes absent from the cached catalog', async () => {
    findAllOrderedByIsoMock.mockResolvedValue([{ iso: 'ES' }]);

    await expect(service.hasCountry('es')).resolves.toBe(false);
    expect(findAllOrderedByIsoMock).toHaveBeenCalledOnce();
  });

  it('should retry loading the catalog after a repository failure', async () => {
    const repositoryError = new Error('Country read failed');
    findAllOrderedByIsoMock
      .mockRejectedValueOnce(repositoryError)
      .mockResolvedValueOnce([{ iso: 'ES' }]);

    await expect(service.getCountries()).rejects.toBe(repositoryError);
    await expect(service.getCountries()).resolves.toEqual([{ iso: 'ES' }]);
    expect(findAllOrderedByIsoMock).toHaveBeenCalledTimes(2);
  });

  it('should reject duplicate country ISO codes in the cached catalog', async () => {
    findAllOrderedByIsoMock.mockResolvedValue([{ iso: 'ES' }, { iso: 'ES' }]);

    await expect(service.getCountries()).rejects.toThrow(
      'Country catalog must contain unique ISO codes',
    );
  });
});

import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { CountryIsoConflictError } from './country.errors';
import { CountryReferenceService } from './country-reference.service';
import { CountryService } from './country.service';
import { COUNTRY_REPOSITORY } from './repositories/country.repository';

describe('CountryService', () => {
  let service: CountryService;

  const findAllOrderedByIsoMock = vi.fn();
  const createMock = vi.fn();
  const hasReferenceCountryMock = vi.fn();

  beforeEach(async () => {
    findAllOrderedByIsoMock.mockReset();
    createMock.mockReset();
    hasReferenceCountryMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CountryService,
        {
          provide: COUNTRY_REPOSITORY,
          useValue: {
            create: createMock,
            findAllOrderedByIso: findAllOrderedByIsoMock,
          },
        },
        {
          provide: CountryReferenceService,
          useValue: { hasCountry: hasReferenceCountryMock },
        },
      ],
    }).compile();

    service = module.get<CountryService>(CountryService);
  });

  it('should create a country present in the reference catalog', async () => {
    hasReferenceCountryMock.mockResolvedValue(true);
    createMock.mockResolvedValue({ iso: 'FR' });

    await expect(service.createCountry({ iso: 'FR' })).resolves.toEqual({
      iso: 'FR',
    });
    expect(createMock).toHaveBeenCalledWith({ iso: 'FR' });
  });

  it('should reject a country absent from the reference catalog', async () => {
    hasReferenceCountryMock.mockResolvedValue(false);

    await expect(service.createCountry({ iso: 'ZZ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it('should expose a conflict when the country already exists', async () => {
    hasReferenceCountryMock.mockResolvedValue(true);
    createMock.mockRejectedValue(new CountryIsoConflictError());

    await expect(service.createCountry({ iso: 'ES' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('should invalidate the configured-country cache after creation', async () => {
    findAllOrderedByIsoMock
      .mockResolvedValueOnce([{ iso: 'ES' }])
      .mockResolvedValueOnce([{ iso: 'ES' }, { iso: 'FR' }]);
    hasReferenceCountryMock.mockResolvedValue(true);
    createMock.mockResolvedValue({ iso: 'FR' });

    await service.getCountries();
    await service.createCountry({ iso: 'FR' });

    await expect(service.getCountries()).resolves.toEqual([
      { iso: 'ES' },
      { iso: 'FR' },
    ]);
    expect(findAllOrderedByIsoMock).toHaveBeenCalledTimes(2);
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

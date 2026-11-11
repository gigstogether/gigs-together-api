import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { CountryReferenceService } from '@modules/location/country/country-reference.service';
import { CountryService } from '@modules/location/country/country.service';
import { AdminCountryService } from './admin-country.service';

describe('AdminCountryService', () => {
  let service: AdminCountryService;

  const getCountriesMock = vi.fn();
  const createCountryMock = vi.fn();
  const getCountryReferencesMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminCountryService,
        {
          provide: CountryService,
          useValue: {
            getCountries: getCountriesMock,
            createCountry: createCountryMock,
          },
        },
        {
          provide: CountryReferenceService,
          useValue: { getCountries: getCountryReferencesMock },
        },
      ],
    }).compile();

    service = module.get<AdminCountryService>(AdminCountryService);
  });

  it('should mark already configured country options', async () => {
    getCountriesMock.mockResolvedValue([{ iso: 'ES' }]);
    getCountryReferencesMock.mockResolvedValue([{ iso: 'ES' }, { iso: 'FR' }]);

    await expect(service.getCountryOptions()).resolves.toEqual([
      { iso: 'ES', isConfigured: true },
      { iso: 'FR', isConfigured: false },
    ]);
  });

  it('should delegate country creation to the country service', async () => {
    createCountryMock.mockResolvedValue({ iso: 'FR' });

    await expect(service.createCountry({ iso: 'FR' })).resolves.toEqual({
      iso: 'FR',
    });
    expect(createCountryMock).toHaveBeenCalledWith({ iso: 'FR' });
  });
});

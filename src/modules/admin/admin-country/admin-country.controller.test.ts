import { PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AccessJwtAuthGuard } from '@modules/auth/guards/access-jwt-auth.guard';
import { AdminGuard } from '@modules/auth/guards/admin.guard';
import { AuthenticatedUserGuard } from '@modules/auth/guards/authenticated-user.guard';
import { AdminCountryController } from './admin-country.controller';
import { AdminCountryService } from './admin-country.service';

describe('AdminCountryController', () => {
  let controller: AdminCountryController;

  const getCountriesMock = vi.fn();
  const getCountryOptionsMock = vi.fn();
  const createCountryMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminCountryController],
      providers: [
        {
          provide: AdminCountryService,
          useValue: {
            getCountries: getCountriesMock,
            getCountryOptions: getCountryOptionsMock,
            createCountry: createCountryMock,
          },
        },
      ],
    })
      .overrideGuard(AccessJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthenticatedUserGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminCountryController>(AdminCountryController);
  });

  it('should expose the plural admin Countries resource route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminCountryController)).toBe(
      'admin/countries',
    );
  });

  it('should return configured countries', async () => {
    getCountriesMock.mockResolvedValue([{ iso: 'ES' }]);

    await expect(controller.getCountriesV1()).resolves.toEqual({
      countries: [{ iso: 'ES' }],
    });
  });

  it('should return country options with configuration state', async () => {
    getCountryOptionsMock.mockResolvedValue([
      { iso: 'ES', isConfigured: true },
    ]);

    await expect(controller.getCountryOptionsV1()).resolves.toEqual({
      countries: [{ iso: 'ES', isConfigured: true }],
    });
  });

  it('should create a country from the v1 request', async () => {
    createCountryMock.mockResolvedValue({ iso: 'FR' });

    await expect(controller.createCountryV1({ iso: 'FR' })).resolves.toEqual({
      iso: 'FR',
    });
    expect(createCountryMock).toHaveBeenCalledWith({ iso: 'FR' });
  });
});

import { Test } from '@nestjs/testing';

import { AccessJwtAuthGuard } from '@modules/auth/guards/access-jwt-auth.guard';
import { AdminGuard } from '@modules/auth/guards/admin.guard';
import { AuthenticatedUserGuard } from '@modules/auth/guards/authenticated-user.guard';
import { LocaleService } from '@modules/locale/locale.service';
import { AdminLocaleController } from './admin-locale.controller';

describe('AdminLocaleController', () => {
  const localeService = {
    getAllLocalesOrdered: vi
      .fn()
      .mockResolvedValue([
        { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
      ]),
    updateLocaleByIso: vi.fn().mockResolvedValue({
      iso: 'en',
      nativeName: 'English',
      isActive: false,
      order: 0,
    }),
    updateLocalesOrder: vi.fn().mockResolvedValue([
      { iso: 'es', nativeName: 'Español', isActive: true, order: 0 },
      { iso: 'en', nativeName: 'English', isActive: true, order: 1 },
    ]),
  } satisfies Pick<
    LocaleService,
    'getAllLocalesOrdered' | 'updateLocaleByIso' | 'updateLocalesOrder'
  >;

  let controller: AdminLocaleController;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [AdminLocaleController],
      providers: [{ provide: LocaleService, useValue: localeService }],
    })
      .overrideGuard(AccessJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthenticatedUserGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AdminLocaleController);
  });

  it('should return locales from locale service', async () => {
    await expect(controller.getLocales()).resolves.toEqual([
      { iso: 'en', nativeName: 'English', isActive: true, order: 0 },
    ]);
    expect(localeService.getAllLocalesOrdered).toHaveBeenCalledTimes(1);
  });

  it('should update locale via locale service', async () => {
    await expect(
      controller.patchLocale('en', { isActive: false }),
    ).resolves.toEqual({
      iso: 'en',
      nativeName: 'English',
      isActive: false,
      order: 0,
    });
    expect(localeService.updateLocaleByIso).toHaveBeenCalledWith({
      iso: 'en',
      isActive: false,
    });
  });

  it('should batch update locale order via locale service', async () => {
    const locales = [
      { iso: 'es', order: 0 },
      { iso: 'en', order: 1 },
    ];

    await expect(controller.patchLocalesOrder({ locales })).resolves.toEqual([
      { iso: 'es', nativeName: 'Español', isActive: true, order: 0 },
      { iso: 'en', nativeName: 'English', isActive: true, order: 1 },
    ]);
    expect(localeService.updateLocalesOrder).toHaveBeenCalledWith({ locales });
  });
});

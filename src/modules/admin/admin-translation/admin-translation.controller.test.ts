import { HttpStatus, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';

import { AccessJwtAuthGuard } from '@modules/auth/guards/access-jwt-auth.guard';
import { AdminGuard } from '@modules/auth/guards/admin.guard';
import { AuthenticatedUserGuard } from '@modules/auth/guards/authenticated-user.guard';
import { TranslationRevalidateService } from '@modules/translation/translation-revalidate.service';
import { TranslationService } from '@modules/translation/translation.service';
import { AdminTranslationController } from './admin-translation.controller';

describe('AdminTranslationController', () => {
  const storedRecord = {
    id: '64f1a2b3c4d5e6f7a8b9c0d1',
    namespace: 'about',
    locale: 'en',
    key: 'title',
    value: 'About',
    format: 'plain',
    kind: 'text',
    isActive: true,
  } as const;
  const translationService = {
    listDistinctNamespaces: vi.fn().mockResolvedValue(['about', 'country']),
    listRecords: vi.fn().mockResolvedValue([storedRecord]),
    upsertRecord: vi.fn().mockResolvedValue({ isCreated: false }),
    setActiveById: vi
      .fn()
      .mockResolvedValue({ ...storedRecord, isActive: false }),
  } satisfies Pick<
    TranslationService,
    'listDistinctNamespaces' | 'listRecords' | 'upsertRecord' | 'setActiveById'
  >;
  const translationRevalidateService = {
    revalidateAll: vi.fn().mockResolvedValue(undefined),
  } satisfies Pick<TranslationRevalidateService, 'revalidateAll'>;

  let controller: AdminTranslationController;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [AdminTranslationController],
      providers: [
        { provide: TranslationService, useValue: translationService },
        {
          provide: TranslationRevalidateService,
          useValue: translationRevalidateService,
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

    controller = module.get(AdminTranslationController);
  });

  it('should revalidate all translation caches via translation revalidate service', async () => {
    await expect(controller.revalidateTranslations()).resolves.toBeUndefined();
    expect(translationRevalidateService.revalidateAll).toHaveBeenCalledTimes(1);
  });

  it('should return translation namespaces from translation service', async () => {
    await expect(controller.getTranslationNamespaces()).resolves.toEqual({
      namespaces: ['about', 'country'],
    });
    expect(translationService.listDistinctNamespaces).toHaveBeenCalledTimes(1);
  });

  it('should return all translations when filters are omitted', async () => {
    await expect(controller.getTranslations({})).resolves.toEqual({
      records: [storedRecord],
    });
    expect(translationService.listRecords).toHaveBeenCalledWith({
      namespace: undefined,
      locale: undefined,
    });
  });

  it('should return translations filtered by namespace and locale', async () => {
    await expect(
      controller.getTranslations({ namespace: 'about', locale: 'en' }),
    ).resolves.toEqual({ records: [storedRecord] });
    expect(translationService.listRecords).toHaveBeenCalledWith({
      namespace: 'about',
      locale: 'en',
    });
  });

  it('should expose the translation natural identity in the resource URI', () => {
    const route = AdminTranslationController.prototype.putTranslation;

    expect(Reflect.getMetadata(PATH_METADATA, AdminTranslationController)).toBe(
      'admin/translations',
    );
    expect(Reflect.getMetadata(PATH_METADATA, route)).toBe(
      ':namespace/:locale/:key',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, route)).toBe(RequestMethod.PUT);
  });

  it('should return 204 without a body when replacing an existing translation', async () => {
    const response = { status: vi.fn() };

    await expect(
      controller.putTranslation(
        { namespace: 'about', locale: 'en', key: 'title' },
        {
          value: 'About us',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
        response,
      ),
    ).resolves.toBeUndefined();
    expect(translationService.upsertRecord).toHaveBeenCalledWith({
      namespace: 'about',
      locale: 'en',
      key: 'title',
      value: 'About us',
      format: 'plain',
      kind: 'text',
      isActive: true,
    });
    expect(response.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
  });

  it('should return 201 when creating a translation', async () => {
    const response = { status: vi.fn() };
    translationService.upsertRecord.mockResolvedValueOnce({ isCreated: true });

    await expect(
      controller.putTranslation(
        { namespace: 'about', locale: 'en', key: 'title' },
        {
          value: 'About us',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
        response,
      ),
    ).resolves.toBeUndefined();
    expect(response.status).toHaveBeenCalledWith(HttpStatus.CREATED);
  });

  it('should toggle translation active flag via translation service', async () => {
    await expect(
      controller.patchTranslationActive(
        { id: storedRecord.id },
        { isActive: false },
      ),
    ).resolves.toEqual({ ...storedRecord, isActive: false });
    expect(translationService.setActiveById).toHaveBeenCalledWith({
      id: storedRecord.id,
      isActive: false,
    });
  });
});

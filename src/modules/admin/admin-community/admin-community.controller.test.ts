import {
  BadRequestException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  PATH_METADATA,
  VERSION_METADATA,
} from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { AccessJwtAuthGuard } from '@modules/auth/guards/access-jwt-auth.guard';
import { AuthenticatedUserGuard } from '@modules/auth/guards/authenticated-user.guard';
import { AdminGuard } from '@modules/auth/guards/admin.guard';
import { CommunityService } from '@modules/community/community.service';
import { COMMUNITY_REPOSITORY } from '@modules/community/repositories/community.repository';
import { CountryService } from '@modules/location/country/country.service';
import { GigFeedRevalidationService } from '@modules/gig/gig-feed/gig-feed-revalidation.service';
import { TranslationService } from '@modules/translation/translation.service';
import { AdminCommunityController } from './admin-community.controller';
import { AdminCommunityService } from './admin-community.service';
import {
  V1AdminCommunityCreateBodyDto,
  V1AdminCommunityIdParamsDto,
  V1AdminCommunityPatchBodyDto,
} from './types/requests/v1-admin-community-request';

const COMMUNITY = {
  id: '507f1f77bcf86cd799439011',
  countryIso: 'ES',
  slug: 'barcelona',
  nameTranslationKey: 'barcelona.name',
  timeZone: 'Europe/Madrid',
  isActive: true,
};

describe('AdminCommunityController', () => {
  let controller: AdminCommunityController;
  const repository = {
    create: vi.fn(),
    update: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
  };
  const findRecord = vi.fn<TranslationService['findRecord']>();
  const revalidate = vi.fn();
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  beforeEach(async () => {
    vi.resetAllMocks();
    repository.findById.mockResolvedValue(COMMUNITY);
    repository.create.mockResolvedValue(COMMUNITY);
    repository.update.mockResolvedValue(COMMUNITY);
    repository.findAll.mockResolvedValue([
      COMMUNITY,
      {
        ...COMMUNITY,
        id: '507f1f77bcf86cd799439022',
        slug: 'madrid',
        isActive: false,
      },
    ]);
    findRecord.mockResolvedValue({
      id: '507f1f77bcf86cd799439033',
      namespace: 'community',
      locale: 'en',
      key: COMMUNITY.nameTranslationKey,
      isActive: true,
      format: 'plain',
      kind: 'text',
      value: 'Barcelona',
    });
    revalidate.mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      controllers: [AdminCommunityController],
      providers: [
        CommunityService,
        AdminCommunityService,
        CountryService,
        { provide: COMMUNITY_REPOSITORY, useValue: repository },
        { provide: TranslationService, useValue: { findRecord } },
        {
          provide: GigFeedRevalidationService,
          useValue: { revalidateCommunityCatalog: revalidate },
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
    controller = module.get(AdminCommunityController);
  });

  it('should protect the resource when administrative routes are registered', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminCommunityController)).toBe(
      'admin/communities',
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminCommunityController),
    ).toEqual([AccessJwtAuthGuard, AuthenticatedUserGuard, AdminGuard]);
    expect(
      Reflect.getMetadata(VERSION_METADATA, controller.getCommunitiesV1),
    ).toBe('1');
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, controller.createCommunityV1),
    ).toBe(201);
  });

  it('should include inactive Communities when listing the admin catalog', async () => {
    const result = await controller.getCommunitiesV1();
    expect(result.communities.map((community) => community.isActive)).toEqual([
      true,
      false,
    ]);
  });

  it('should omit internal storage fields when returning Community details', async () => {
    repository.findById.mockResolvedValue({
      ...COMMUNITY,
      __v: 0,
    });
    await expect(
      controller.getCommunityV1({ id: COMMUNITY.id }),
    ).resolves.toEqual(COMMUNITY);
  });

  it('should normalize the request and refresh the feed when creating a Community', async () => {
    const body = await pipe.transform(
      {
        countryIso: ' es ',
        slug: ' Barcelona ',
        nameTranslationKey: ' barcelona.name ',
        timeZone: ' Europe/Madrid ',
        isActive: true,
      },
      { type: 'body', metatype: V1AdminCommunityCreateBodyDto },
    );
    await expect(controller.createCommunityV1(body)).resolves.toEqual(
      COMMUNITY,
    );
    expect(repository.create).toHaveBeenCalledWith({
      countryIso: 'ES',
      slug: 'barcelona',
      nameTranslationKey: 'barcelona.name',
      timeZone: 'Europe/Madrid',
      isActive: true,
    });
    expect(revalidate).toHaveBeenCalledWith([COMMUNITY]);
  });

  it('should reject activation when an English Community name is unavailable', async () => {
    findRecord.mockResolvedValue(null);
    const creation = controller.createCommunityV1({ ...COMMUNITY });
    await expect(creation).rejects.toBeInstanceOf(BadRequestException);
    await expect(creation).rejects.toThrow(
      'Active Communities require an active plain-text name for locale "en"',
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('should allow an inactive draft when its name has not been translated yet', async () => {
    findRecord.mockResolvedValue(null);
    repository.create.mockResolvedValue({ ...COMMUNITY, isActive: false });
    await expect(
      controller.createCommunityV1({ ...COMMUNITY, isActive: false }),
    ).resolves.toMatchObject({ isActive: false });
    expect(findRecord).not.toHaveBeenCalled();
  });

  it('should refresh the catalog after reading the Community once when changing its slug', async () => {
    const updated = { ...COMMUNITY, slug: 'girona' };
    repository.update.mockResolvedValue(updated);
    await expect(
      controller.updateCommunityV1({ id: COMMUNITY.id }, { slug: 'girona' }),
    ).resolves.toEqual(updated);
    expect(revalidate).toHaveBeenCalledWith([updated]);
    expect(repository.findById).toHaveBeenCalledTimes(1);
  });

  it('should allow deactivation when the existing name is unavailable', async () => {
    findRecord.mockResolvedValue(null);
    repository.update.mockResolvedValue({ ...COMMUNITY, isActive: false });
    await expect(
      controller.updateCommunityV1({ id: COMMUNITY.id }, { isActive: false }),
    ).resolves.toMatchObject({ isActive: false });
    expect(findRecord).not.toHaveBeenCalled();
  });

  it.each(['countryIso', 'slug', 'nameTranslationKey', 'timeZone', 'isActive'])(
    'should reject null when patching %s',
    async (field) => {
      await expect(
        pipe.transform(
          { [field]: null },
          { type: 'body', metatype: V1AdminCommunityPatchBodyDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('should reject unknown fields when validating a creation request', async () => {
    await expect(
      pipe.transform(
        { ...COMMUNITY, id: undefined, unexpected: true },
        { type: 'body', metatype: V1AdminCommunityCreateBodyDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject invalid ids when validating resource parameters', async () => {
    await expect(
      pipe.transform(
        { id: 'invalid' },
        { type: 'param', metatype: V1AdminCommunityIdParamsDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should return not found when the requested Community does not exist', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(
      controller.getCommunityV1({ id: COMMUNITY.id }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

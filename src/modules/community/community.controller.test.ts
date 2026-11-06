import { PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { CommunityService } from './community.service';
import { CommunityController } from './community.controller';

describe('CommunityController', () => {
  let controller: CommunityController;

  const findActiveMock = vi.fn();

  beforeEach(async () => {
    findActiveMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommunityController],
      providers: [
        {
          provide: CommunityService,
          useValue: { findActive: findActiveMock },
        },
      ],
    }).compile();

    controller = module.get<CommunityController>(CommunityController);
  });

  it('should expose the plural Communities resource route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, CommunityController)).toBe(
      'communities',
    );
  });

  it('should expose active Communities through the v1 response contract', async () => {
    findActiveMock.mockResolvedValue([
      {
        id: '690a1fdb17f0a7771e9c1c21',
        countryIso: 'ES',
        slug: 'barcelona',
        nameTranslationKey: 'barcelona.name',
        timeZone: 'Europe/Madrid',
        isActive: true,
      },
    ]);

    await expect(controller.getCommunitiesV1()).resolves.toEqual({
      nameTranslationNamespace: 'community',
      communities: [
        {
          id: '690a1fdb17f0a7771e9c1c21',
          countryIso: 'ES',
          slug: 'barcelona',
          nameTranslationKey: 'barcelona.name',
          timeZone: 'Europe/Madrid',
        },
      ],
    });
    expect(findActiveMock).toHaveBeenCalledOnce();
  });
});

import { PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AccessJwtAuthGuard } from '@modules/auth/guards/access-jwt-auth.guard';
import { AdminGuard } from '@modules/auth/guards/admin.guard';
import { AuthenticatedUserGuard } from '@modules/auth/guards/authenticated-user.guard';
import { RegionService } from '@modules/location/region/region.service';
import { AdminRegionController } from './admin-region.controller';

const REGION_ID = '690a1fdb17f0a7771e9c1c31';
const REGION = {
  id: REGION_ID,
  countryIso: 'ES',
  name: 'Catalonia',
  aliases: ['Catalunya', 'Cataluña'],
};

describe('AdminRegionController', () => {
  let controller: AdminRegionController;

  const createRegionMock = vi.fn();
  const getRegionByIdMock = vi.fn();
  const findRegionsMock = vi.fn();
  const updateRegionMock = vi.fn();
  const deleteRegionMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminRegionController],
      providers: [
        {
          provide: RegionService,
          useValue: {
            createRegion: createRegionMock,
            getRegionById: getRegionByIdMock,
            findRegions: findRegionsMock,
            updateRegion: updateRegionMock,
            deleteRegion: deleteRegionMock,
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

    controller = module.get<AdminRegionController>(AdminRegionController);
  });

  it('should expose the plural admin Regions resource route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminRegionController)).toBe(
      'admin/regions',
    );
  });

  it('should return mapped Regions', async () => {
    findRegionsMock.mockResolvedValue([REGION]);

    await expect(
      controller.getRegionsV1({ countryIso: 'ES', search: 'cat' }),
    ).resolves.toEqual({ regions: [REGION] });
    expect(findRegionsMock).toHaveBeenCalledWith({
      countryIso: 'ES',
      search: 'cat',
    });
  });

  it('should create a Region from the v1 request', async () => {
    createRegionMock.mockResolvedValue(REGION);

    await expect(
      controller.createRegionV1({
        countryIso: 'ES',
        name: 'Catalonia',
        aliases: ['Catalunya', 'Cataluña'],
      }),
    ).resolves.toEqual(REGION);
    expect(createRegionMock).toHaveBeenCalledWith({
      countryIso: 'ES',
      name: 'Catalonia',
      aliases: ['Catalunya', 'Cataluña'],
    });
  });

  it('should map a partial Region update', async () => {
    updateRegionMock.mockResolvedValue(REGION);

    await expect(
      controller.updateRegionV1({ id: REGION_ID }, { name: 'Catalonia' }),
    ).resolves.toEqual(REGION);
    expect(updateRegionMock).toHaveBeenCalledWith({
      id: REGION_ID,
      name: 'Catalonia',
    });
  });
});

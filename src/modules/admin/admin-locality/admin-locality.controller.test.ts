import { PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AccessJwtAuthGuard } from '@modules/auth/guards/access-jwt-auth.guard';
import { AdminGuard } from '@modules/auth/guards/admin.guard';
import { AuthenticatedUserGuard } from '@modules/auth/guards/authenticated-user.guard';
import { LocalityService } from '@modules/location/locality/locality.service';
import { AdminLocalityController } from './admin-locality.controller';

const LOCALITY_ID = '690a1fdb17f0a7771e9c1c32';
const REGION_ID = '690a1fdb17f0a7771e9c1c31';
const LOCALITY = {
  id: LOCALITY_ID,
  regionId: REGION_ID,
  name: 'Barcelona',
  aliases: ['Barna', 'BCN'],
  timeZone: 'Europe/Madrid',
};

describe('AdminLocalityController', () => {
  let controller: AdminLocalityController;

  const createLocalityMock = vi.fn();
  const getLocalityByIdMock = vi.fn();
  const findLocalitiesMock = vi.fn();
  const updateLocalityMock = vi.fn();
  const deleteLocalityMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminLocalityController],
      providers: [
        {
          provide: LocalityService,
          useValue: {
            createLocality: createLocalityMock,
            getLocalityById: getLocalityByIdMock,
            findLocalities: findLocalitiesMock,
            updateLocality: updateLocalityMock,
            deleteLocality: deleteLocalityMock,
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

    controller = module.get<AdminLocalityController>(AdminLocalityController);
  });

  it('should expose the plural admin Localities resource route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminLocalityController)).toBe(
      'admin/localities',
    );
  });

  it('should return mapped Localities', async () => {
    findLocalitiesMock.mockResolvedValue([LOCALITY]);

    await expect(
      controller.getLocalitiesV1({ regionId: REGION_ID, search: 'bar' }),
    ).resolves.toEqual({ localities: [LOCALITY] });
    expect(findLocalitiesMock).toHaveBeenCalledWith({
      regionId: REGION_ID,
      search: 'bar',
    });
  });

  it('should create a Locality from the v1 request', async () => {
    createLocalityMock.mockResolvedValue(LOCALITY);

    await expect(
      controller.createLocalityV1({
        regionId: REGION_ID,
        name: 'Barcelona',
        aliases: ['Barna', 'BCN'],
        timeZone: 'Europe/Madrid',
      }),
    ).resolves.toEqual(LOCALITY);
    expect(createLocalityMock).toHaveBeenCalledWith({
      regionId: REGION_ID,
      name: 'Barcelona',
      aliases: ['Barna', 'BCN'],
      timeZone: 'Europe/Madrid',
    });
  });

  it('should map a partial Locality update', async () => {
    updateLocalityMock.mockResolvedValue(LOCALITY);

    await expect(
      controller.updateLocalityV1(
        { id: LOCALITY_ID },
        { timeZone: 'Europe/Madrid' },
      ),
    ).resolves.toEqual(LOCALITY);
    expect(updateLocalityMock).toHaveBeenCalledWith({
      id: LOCALITY_ID,
      timeZone: 'Europe/Madrid',
    });
  });
});

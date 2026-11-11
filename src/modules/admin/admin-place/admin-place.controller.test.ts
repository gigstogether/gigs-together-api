import { PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AccessJwtAuthGuard } from '@modules/auth/guards/access-jwt-auth.guard';
import { AdminGuard } from '@modules/auth/guards/admin.guard';
import { AuthenticatedUserGuard } from '@modules/auth/guards/authenticated-user.guard';
import { PlaceService } from '@modules/location/place/place.service';
import { AdminPlaceController } from './admin-place.controller';

const PLACE_ID = '690a1fdb17f0a7771e9c1c33';
const LOCALITY_ID = '690a1fdb17f0a7771e9c1c32';
const PLACE = {
  id: PLACE_ID,
  localityId: LOCALITY_ID,
  name: 'Sala Apolo',
  aliases: ['Apolo'],
  isActive: true,
};

describe('AdminPlaceController', () => {
  let controller: AdminPlaceController;

  const createPlaceMock = vi.fn();
  const getPlaceByIdMock = vi.fn();
  const findPlacesMock = vi.fn();
  const updatePlaceMock = vi.fn();
  const deletePlaceMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminPlaceController],
      providers: [
        {
          provide: PlaceService,
          useValue: {
            createPlace: createPlaceMock,
            getPlaceById: getPlaceByIdMock,
            findPlaces: findPlacesMock,
            updatePlace: updatePlaceMock,
            deletePlace: deletePlaceMock,
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

    controller = module.get<AdminPlaceController>(AdminPlaceController);
  });

  it('should expose the plural admin Places resource route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminPlaceController)).toBe(
      'admin/places',
    );
  });

  it('should return mapped Places', async () => {
    findPlacesMock.mockResolvedValue([PLACE]);

    await expect(
      controller.getPlacesV1({
        localityId: LOCALITY_ID,
        search: 'apolo',
        isActive: true,
      }),
    ).resolves.toEqual({ places: [PLACE] });
    expect(findPlacesMock).toHaveBeenCalledWith({
      localityId: LOCALITY_ID,
      search: 'apolo',
      isActive: true,
    });
  });

  it('should create a Place from the v1 request', async () => {
    createPlaceMock.mockResolvedValue(PLACE);

    await expect(
      controller.createPlaceV1({
        localityId: LOCALITY_ID,
        name: 'Sala Apolo',
        aliases: ['Apolo'],
        isActive: true,
      }),
    ).resolves.toEqual(PLACE);
    expect(createPlaceMock).toHaveBeenCalledWith({
      localityId: LOCALITY_ID,
      name: 'Sala Apolo',
      aliases: ['Apolo'],
      isActive: true,
    });
  });

  it('should map a partial Place update', async () => {
    updatePlaceMock.mockResolvedValue({ ...PLACE, isActive: false });

    await expect(
      controller.updatePlaceV1({ id: PLACE_ID }, { isActive: false }),
    ).resolves.toEqual({ ...PLACE, isActive: false });
    expect(updatePlaceMock).toHaveBeenCalledWith({
      id: PLACE_ID,
      isActive: false,
    });
  });
});

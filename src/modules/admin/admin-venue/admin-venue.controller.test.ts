import { PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AccessJwtAuthGuard } from '@modules/auth/guards/access-jwt-auth.guard';
import { AdminGuard } from '@modules/auth/guards/admin.guard';
import { AuthenticatedUserGuard } from '@modules/auth/guards/authenticated-user.guard';
import { VenueService } from '@modules/location/venue/venue.service';
import { AdminVenueController } from './admin-venue.controller';

const VENUE_ID = '690a1fdb17f0a7771e9c1c33';
const LOCALITY_ID = '690a1fdb17f0a7771e9c1c32';
const VENUE = {
  id: VENUE_ID,
  localityId: LOCALITY_ID,
  name: 'Sala Apolo',
  aliases: ['Apolo'],
  isActive: true,
};

describe('AdminVenueController', () => {
  let controller: AdminVenueController;

  const createVenueMock = vi.fn();
  const getVenueByIdMock = vi.fn();
  const findVenuesMock = vi.fn();
  const updateVenueMock = vi.fn();
  const deleteVenueMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminVenueController],
      providers: [
        {
          provide: VenueService,
          useValue: {
            createVenue: createVenueMock,
            getVenueById: getVenueByIdMock,
            findVenues: findVenuesMock,
            updateVenue: updateVenueMock,
            deleteVenue: deleteVenueMock,
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

    controller = module.get<AdminVenueController>(AdminVenueController);
  });

  it('should expose the plural admin Venues resource route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminVenueController)).toBe(
      'admin/venues',
    );
  });

  it('should return mapped Venues', async () => {
    findVenuesMock.mockResolvedValue([VENUE]);

    await expect(
      controller.getVenuesV1({
        localityId: LOCALITY_ID,
        search: 'apolo',
        isActive: true,
      }),
    ).resolves.toEqual({ venues: [VENUE] });
    expect(findVenuesMock).toHaveBeenCalledWith({
      localityId: LOCALITY_ID,
      search: 'apolo',
      isActive: true,
    });
  });

  it('should create a Venue from the v1 request', async () => {
    createVenueMock.mockResolvedValue(VENUE);

    await expect(
      controller.createVenueV1({
        localityId: LOCALITY_ID,
        name: 'Sala Apolo',
        aliases: ['Apolo'],
        isActive: true,
      }),
    ).resolves.toEqual(VENUE);
    expect(createVenueMock).toHaveBeenCalledWith({
      localityId: LOCALITY_ID,
      name: 'Sala Apolo',
      aliases: ['Apolo'],
      isActive: true,
    });
  });

  it('should map a partial Venue update', async () => {
    updateVenueMock.mockResolvedValue({ ...VENUE, isActive: false });

    await expect(
      controller.updateVenueV1({ id: VENUE_ID }, { isActive: false }),
    ).resolves.toEqual({ ...VENUE, isActive: false });
    expect(updateVenueMock).toHaveBeenCalledWith({
      id: VENUE_ID,
      isActive: false,
    });
  });
});

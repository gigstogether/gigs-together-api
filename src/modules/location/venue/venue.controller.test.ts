import { PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { VenueController } from './venue.controller';
import { VenueService } from './venue.service';

const LOCALITY_ID = '690a1fdb17f0a7771e9c1c32';
const LOCALITY = {
  id: LOCALITY_ID,
  countryIso: 'ES',
  name: 'San Pedro',
  qualifier: 'Albacete province',
  aliases: ['San Pedro de Albacete'],
  timeZone: 'Europe/Madrid',
};
const VENUE = {
  id: '690a1fdb17f0a7771e9c1c33',
  localityId: LOCALITY_ID,
  name: 'Festival Grounds',
  aliases: ['Main Festival Grounds'],
  isActive: true,
};

describe('VenueController', () => {
  let controller: VenueController;
  const getActiveVenueCatalogMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VenueController],
      providers: [
        {
          provide: VenueService,
          useValue: {
            getActiveVenueCatalog: getActiveVenueCatalogMock,
          },
        },
      ],
    }).compile();

    controller = module.get<VenueController>(VenueController);
  });

  it('should expose the Venues collection as a plural root resource', () => {
    expect(Reflect.getMetadata(PATH_METADATA, VenueController)).toBe('venues');
  });

  it('should return active Venue options with qualified Locality data', async () => {
    getActiveVenueCatalogMock.mockResolvedValue({
      locality: LOCALITY,
      venues: [VENUE],
    });

    await expect(
      controller.getVenuesV1({ localityId: LOCALITY_ID }),
    ).resolves.toEqual({
      locality: {
        id: LOCALITY_ID,
        countryIso: 'ES',
        name: 'San Pedro',
        qualifier: 'Albacete province',
        timeZone: 'Europe/Madrid',
      },
      venues: [{ id: VENUE.id, name: 'Festival Grounds' }],
    });
    expect(getActiveVenueCatalogMock).toHaveBeenCalledWith({
      localityId: LOCALITY_ID,
    });
  });
});

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { LocalityService } from '../locality/locality.service';
import { VenueNameConflictError } from './venue.errors';
import { VenueService } from './venue.service';
import { VENUE_REPOSITORY } from './repositories/venue.repository';

const VENUE_ID = '690a1fdb17f0a7771e9c1c33';
const LOCALITY_ID = '690a1fdb17f0a7771e9c1c32';
const VENUE = {
  id: VENUE_ID,
  localityId: LOCALITY_ID,
  name: 'Sala Apolo',
  aliases: ['Apolo'],
  isActive: true,
};

describe('VenueService', () => {
  let service: VenueService;

  const createMock = vi.fn();
  const findByIdMock = vi.fn();
  const findMock = vi.fn();
  const updateMock = vi.fn();
  const deleteByIdMock = vi.fn();
  const hasLocalityMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    hasLocalityMock.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VenueService,
        {
          provide: VENUE_REPOSITORY,
          useValue: {
            create: createMock,
            findById: findByIdMock,
            find: findMock,
            update: updateMock,
            deleteById: deleteByIdMock,
          },
        },
        {
          provide: LocalityService,
          useValue: { hasLocality: hasLocalityMock },
        },
      ],
    }).compile();

    service = module.get<VenueService>(VenueService);
  });

  it('should create a normalized Venue for an existing Locality', async () => {
    createMock.mockResolvedValue(VENUE);

    await expect(
      service.createVenue({
        localityId: LOCALITY_ID,
        name: ' Sala Apolo ',
        aliases: [' Apolo '],
        isActive: true,
      }),
    ).resolves.toEqual(VENUE);
    expect(hasLocalityMock).toHaveBeenCalledWith(LOCALITY_ID);
    expect(createMock).toHaveBeenCalledWith({
      localityId: LOCALITY_ID,
      name: 'Sala Apolo',
      aliases: ['Apolo'],
      isActive: true,
    });
  });

  it('should reject a Venue for an unknown Locality', async () => {
    hasLocalityMock.mockResolvedValue(false);

    await expect(
      service.createVenue({
        localityId: LOCALITY_ID,
        name: 'Sala Apolo',
        aliases: [],
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('should reject an alias equal to the canonical name', async () => {
    await expect(
      service.createVenue({
        localityId: LOCALITY_ID,
        name: 'Sala Apolo',
        aliases: ['SALA APOLO'],
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(hasLocalityMock).not.toHaveBeenCalled();
  });

  it('should translate a repository name conflict', async () => {
    createMock.mockRejectedValue(new VenueNameConflictError());

    await expect(
      service.createVenue({
        localityId: LOCALITY_ID,
        name: 'Sala Apolo',
        aliases: [],
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('should return a Venue by id', async () => {
    findByIdMock.mockResolvedValue(VENUE);

    await expect(service.getVenueById(VENUE_ID)).resolves.toEqual(VENUE);
    expect(findByIdMock).toHaveBeenCalledWith(VENUE_ID);
  });

  it('should reject an unknown Venue id', async () => {
    findByIdMock.mockResolvedValue(null);

    await expect(service.getVenueById(VENUE_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('should reject a stored Venue with an unknown Locality', async () => {
    findByIdMock.mockResolvedValue(VENUE);
    hasLocalityMock.mockResolvedValue(false);

    await expect(service.getVenueById(VENUE_ID)).rejects.toThrow(
      'Venue localityId "' +
        LOCALITY_ID +
        '" must reference an existing Locality',
    );
  });

  it('should normalize search and forward filters', async () => {
    findMock.mockResolvedValue([VENUE]);

    await expect(
      service.findVenues({
        localityId: LOCALITY_ID,
        search: ' apolo ',
        isActive: true,
      }),
    ).resolves.toEqual([VENUE]);
    expect(findMock).toHaveBeenCalledWith({
      localityId: LOCALITY_ID,
      search: 'apolo',
      isActive: true,
    });
  });

  it('should deactivate a Venue while retaining its names', async () => {
    findByIdMock.mockResolvedValue(VENUE);
    updateMock.mockResolvedValue({ ...VENUE, isActive: false });

    await expect(
      service.updateVenue({ id: VENUE_ID, isActive: false }),
    ).resolves.toEqual({ ...VENUE, isActive: false });
    expect(updateMock).toHaveBeenCalledWith({
      id: VENUE_ID,
      name: 'Sala Apolo',
      aliases: ['Apolo'],
      isActive: false,
    });
  });

  it('should reject an empty update', async () => {
    await expect(service.updateVenue({ id: VENUE_ID })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it('should delete an existing Venue', async () => {
    deleteByIdMock.mockResolvedValue(true);

    await expect(service.deleteVenue(VENUE_ID)).resolves.toBeUndefined();
    expect(deleteByIdMock).toHaveBeenCalledWith(VENUE_ID);
  });
});

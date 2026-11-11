import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { LocalityService } from '../locality/locality.service';
import { PlaceNameConflictError } from './place.errors';
import { PlaceService } from './place.service';
import { PLACE_REPOSITORY } from './repositories/place.repository';

const PLACE_ID = '690a1fdb17f0a7771e9c1c33';
const LOCALITY_ID = '690a1fdb17f0a7771e9c1c32';
const PLACE = {
  id: PLACE_ID,
  localityId: LOCALITY_ID,
  name: 'Sala Apolo',
  aliases: ['Apolo'],
  isActive: true,
};

describe('PlaceService', () => {
  let service: PlaceService;

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
        PlaceService,
        {
          provide: PLACE_REPOSITORY,
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

    service = module.get<PlaceService>(PlaceService);
  });

  it('should create a normalized Place for an existing Locality', async () => {
    createMock.mockResolvedValue(PLACE);

    await expect(
      service.createPlace({
        localityId: LOCALITY_ID,
        name: ' Sala Apolo ',
        aliases: [' Apolo '],
        isActive: true,
      }),
    ).resolves.toEqual(PLACE);
    expect(hasLocalityMock).toHaveBeenCalledWith(LOCALITY_ID);
    expect(createMock).toHaveBeenCalledWith({
      localityId: LOCALITY_ID,
      name: 'Sala Apolo',
      aliases: ['Apolo'],
      isActive: true,
    });
  });

  it('should reject a Place for an unknown Locality', async () => {
    hasLocalityMock.mockResolvedValue(false);

    await expect(
      service.createPlace({
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
      service.createPlace({
        localityId: LOCALITY_ID,
        name: 'Sala Apolo',
        aliases: ['SALA APOLO'],
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(hasLocalityMock).not.toHaveBeenCalled();
  });

  it('should translate a repository name conflict', async () => {
    createMock.mockRejectedValue(new PlaceNameConflictError());

    await expect(
      service.createPlace({
        localityId: LOCALITY_ID,
        name: 'Sala Apolo',
        aliases: [],
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('should return a Place by id', async () => {
    findByIdMock.mockResolvedValue(PLACE);

    await expect(service.getPlaceById(PLACE_ID)).resolves.toEqual(PLACE);
    expect(findByIdMock).toHaveBeenCalledWith(PLACE_ID);
  });

  it('should reject an unknown Place id', async () => {
    findByIdMock.mockResolvedValue(null);

    await expect(service.getPlaceById(PLACE_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('should reject a stored Place with an unknown Locality', async () => {
    findByIdMock.mockResolvedValue(PLACE);
    hasLocalityMock.mockResolvedValue(false);

    await expect(service.getPlaceById(PLACE_ID)).rejects.toThrow(
      'Place localityId "' +
        LOCALITY_ID +
        '" must reference an existing Locality',
    );
  });

  it('should normalize search and forward filters', async () => {
    findMock.mockResolvedValue([PLACE]);

    await expect(
      service.findPlaces({
        localityId: LOCALITY_ID,
        search: ' apolo ',
        isActive: true,
      }),
    ).resolves.toEqual([PLACE]);
    expect(findMock).toHaveBeenCalledWith({
      localityId: LOCALITY_ID,
      search: 'apolo',
      isActive: true,
    });
  });

  it('should deactivate a Place while retaining its names', async () => {
    findByIdMock.mockResolvedValue(PLACE);
    updateMock.mockResolvedValue({ ...PLACE, isActive: false });

    await expect(
      service.updatePlace({ id: PLACE_ID, isActive: false }),
    ).resolves.toEqual({ ...PLACE, isActive: false });
    expect(updateMock).toHaveBeenCalledWith({
      id: PLACE_ID,
      name: 'Sala Apolo',
      aliases: ['Apolo'],
      isActive: false,
    });
  });

  it('should reject an empty update', async () => {
    await expect(service.updatePlace({ id: PLACE_ID })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it('should delete an existing Place', async () => {
    deleteByIdMock.mockResolvedValue(true);

    await expect(service.deletePlace(PLACE_ID)).resolves.toBeUndefined();
    expect(deleteByIdMock).toHaveBeenCalledWith(PLACE_ID);
  });
});

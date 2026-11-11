import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { RegionService } from '../region/region.service';
import { LocalityNameConflictError } from './locality.errors';
import { LocalityService } from './locality.service';
import { LOCALITY_REPOSITORY } from './repositories/locality.repository';

const LOCALITY_ID = '690a1fdb17f0a7771e9c1c32';
const REGION_ID = '690a1fdb17f0a7771e9c1c31';
const LOCALITY = {
  id: LOCALITY_ID,
  regionId: REGION_ID,
  name: 'Barcelona',
  aliases: ['Barna', 'BCN'],
  timeZone: 'Europe/Madrid',
};

describe('LocalityService', () => {
  let service: LocalityService;

  const createMock = vi.fn();
  const findByIdMock = vi.fn();
  const findMock = vi.fn();
  const updateMock = vi.fn();
  const deleteByIdMock = vi.fn();
  const hasRegionMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    hasRegionMock.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalityService,
        {
          provide: LOCALITY_REPOSITORY,
          useValue: {
            create: createMock,
            findById: findByIdMock,
            find: findMock,
            update: updateMock,
            deleteById: deleteByIdMock,
          },
        },
        {
          provide: RegionService,
          useValue: { hasRegion: hasRegionMock },
        },
      ],
    }).compile();

    service = module.get<LocalityService>(LocalityService);
  });

  it('should create a normalized Locality for an existing Region', async () => {
    createMock.mockResolvedValue(LOCALITY);

    await expect(
      service.createLocality({
        regionId: REGION_ID,
        name: ' Barcelona ',
        aliases: [' Barna ', ' BCN '],
        timeZone: ' Europe/Madrid ',
      }),
    ).resolves.toEqual(LOCALITY);

    expect(hasRegionMock).toHaveBeenCalledWith(REGION_ID);
    expect(createMock).toHaveBeenCalledWith({
      regionId: REGION_ID,
      name: 'Barcelona',
      aliases: ['Barna', 'BCN'],
      timeZone: 'Europe/Madrid',
    });
  });

  it('should reject a Locality for an unknown Region', async () => {
    hasRegionMock.mockResolvedValue(false);

    await expect(
      service.createLocality({
        regionId: REGION_ID,
        name: 'Barcelona',
        aliases: [],
        timeZone: 'Europe/Madrid',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('should reject an invalid time zone', async () => {
    await expect(
      service.createLocality({
        regionId: REGION_ID,
        name: 'Barcelona',
        aliases: [],
        timeZone: 'Europe/Invalid',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(hasRegionMock).not.toHaveBeenCalled();
  });

  it('should translate a repository name conflict', async () => {
    createMock.mockRejectedValue(new LocalityNameConflictError());

    await expect(
      service.createLocality({
        regionId: REGION_ID,
        name: 'Barcelona',
        aliases: [],
        timeZone: 'Europe/Madrid',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('should return a Locality by id', async () => {
    findByIdMock.mockResolvedValue(LOCALITY);

    await expect(service.getLocalityById(LOCALITY_ID)).resolves.toEqual(
      LOCALITY,
    );
    expect(findByIdMock).toHaveBeenCalledWith(LOCALITY_ID);
  });

  it('should reject an unknown Locality id', async () => {
    findByIdMock.mockResolvedValue(null);

    await expect(service.getLocalityById(LOCALITY_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('should reject a stored Locality with an unknown Region', async () => {
    findByIdMock.mockResolvedValue(LOCALITY);
    hasRegionMock.mockResolvedValue(false);

    await expect(service.getLocalityById(LOCALITY_ID)).rejects.toThrow(
      'Locality regionId "' + REGION_ID + '" must reference an existing Region',
    );
  });

  it('should normalize search and forward filters', async () => {
    findMock.mockResolvedValue([LOCALITY]);

    await expect(
      service.findLocalities({ regionId: REGION_ID, search: ' bar ' }),
    ).resolves.toEqual([LOCALITY]);
    expect(findMock).toHaveBeenCalledWith({
      regionId: REGION_ID,
      search: 'bar',
    });
  });

  it('should update the time zone while retaining other fields', async () => {
    findByIdMock.mockResolvedValue(LOCALITY);
    updateMock.mockResolvedValue({
      ...LOCALITY,
      timeZone: 'Europe/Paris',
    });

    await expect(
      service.updateLocality({
        id: LOCALITY_ID,
        timeZone: ' Europe/Paris ',
      }),
    ).resolves.toEqual({ ...LOCALITY, timeZone: 'Europe/Paris' });
    expect(updateMock).toHaveBeenCalledWith({
      id: LOCALITY_ID,
      name: 'Barcelona',
      aliases: ['Barna', 'BCN'],
      timeZone: 'Europe/Paris',
    });
  });

  it('should reject an empty update', async () => {
    await expect(
      service.updateLocality({ id: LOCALITY_ID }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it('should delete an existing Locality', async () => {
    deleteByIdMock.mockResolvedValue(true);

    await expect(service.deleteLocality(LOCALITY_ID)).resolves.toBeUndefined();
    expect(deleteByIdMock).toHaveBeenCalledWith(LOCALITY_ID);
  });
});

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { CountryService } from '../country/country.service';
import { PLACE_REPOSITORY } from '../place/repositories/place.repository';
import { LocalityNameConflictError } from './locality.errors';
import { LocalityService } from './locality.service';
import { LOCALITY_REPOSITORY } from './repositories/locality.repository';

const LOCALITY_ID = '690a1fdb17f0a7771e9c1c32';
const COUNTRY_ISO = 'ES';
const LOCALITY = {
  id: LOCALITY_ID,
  countryIso: COUNTRY_ISO,
  name: 'Barcelona',
  qualifier: 'Barcelona province',
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
  const hasCountryMock = vi.fn();
  const existsByLocalityIdMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    hasCountryMock.mockResolvedValue(true);
    existsByLocalityIdMock.mockResolvedValue(false);

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
          provide: CountryService,
          useValue: { hasCountry: hasCountryMock },
        },
        {
          provide: PLACE_REPOSITORY,
          useValue: { existsByLocalityId: existsByLocalityIdMock },
        },
      ],
    }).compile();

    service = module.get<LocalityService>(LocalityService);
  });

  it('should create a normalized Locality for an existing Country', async () => {
    createMock.mockResolvedValue(LOCALITY);

    await expect(
      service.createLocality({
        countryIso: COUNTRY_ISO,
        name: ' Barcelona ',
        qualifier: ' Barcelona province ',
        aliases: [' Barna ', ' BCN '],
        timeZone: ' Europe/Madrid ',
      }),
    ).resolves.toEqual(LOCALITY);

    expect(hasCountryMock).toHaveBeenCalledWith(COUNTRY_ISO);
    expect(createMock).toHaveBeenCalledWith({
      countryIso: COUNTRY_ISO,
      name: 'Barcelona',
      qualifier: 'Barcelona province',
      aliases: ['Barna', 'BCN'],
      timeZone: 'Europe/Madrid',
    });
  });

  it('should reject a Locality for an unknown Country', async () => {
    hasCountryMock.mockResolvedValue(false);

    await expect(
      service.createLocality({
        countryIso: COUNTRY_ISO,
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
        countryIso: COUNTRY_ISO,
        name: 'Barcelona',
        aliases: [],
        timeZone: 'Europe/Invalid',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(hasCountryMock).not.toHaveBeenCalled();
  });

  it('should translate a repository name conflict', async () => {
    createMock.mockRejectedValue(new LocalityNameConflictError());

    await expect(
      service.createLocality({
        countryIso: COUNTRY_ISO,
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

  it('should report whether a Locality exists', async () => {
    findByIdMock.mockResolvedValue(LOCALITY);

    await expect(service.hasLocality(LOCALITY_ID)).resolves.toBe(true);
  });

  it('should reject a stored Locality with an unknown Country', async () => {
    findByIdMock.mockResolvedValue(LOCALITY);
    hasCountryMock.mockResolvedValue(false);

    await expect(service.getLocalityById(LOCALITY_ID)).rejects.toThrow(
      'Locality countryIso "' +
        COUNTRY_ISO +
        '" must reference an existing Country',
    );
  });

  it('should normalize search and forward filters', async () => {
    findMock.mockResolvedValue([LOCALITY]);

    await expect(
      service.findLocalities({ countryIso: COUNTRY_ISO, search: ' bar ' }),
    ).resolves.toEqual([LOCALITY]);
    expect(findMock).toHaveBeenCalledWith({
      countryIso: COUNTRY_ISO,
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
      qualifier: 'Barcelona province',
      aliases: ['Barna', 'BCN'],
      timeZone: 'Europe/Paris',
    });
  });

  it('should clear an existing qualifier', async () => {
    findByIdMock.mockResolvedValue(LOCALITY);
    const localityWithoutQualifier = {
      id: LOCALITY.id,
      countryIso: LOCALITY.countryIso,
      name: LOCALITY.name,
      aliases: LOCALITY.aliases,
      timeZone: LOCALITY.timeZone,
    };
    updateMock.mockResolvedValue(localityWithoutQualifier);

    await expect(
      service.updateLocality({
        id: LOCALITY_ID,
        qualifier: null,
      }),
    ).resolves.toEqual(localityWithoutQualifier);
    expect(updateMock).toHaveBeenCalledWith({
      id: LOCALITY_ID,
      name: 'Barcelona',
      aliases: ['Barna', 'BCN'],
      timeZone: 'Europe/Madrid',
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

  it('should reject deletion of a Locality referenced by Places', async () => {
    existsByLocalityIdMock.mockResolvedValue(true);

    await expect(service.deleteLocality(LOCALITY_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(deleteByIdMock).not.toHaveBeenCalled();
  });
});

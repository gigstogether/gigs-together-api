import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { CountryService } from '../country/country.service';
import { RegionNameConflictError } from './region.errors';
import { REGION_REPOSITORY } from './repositories/region.repository';
import { RegionService } from './region.service';

const REGION_ID = '690a1fdb17f0a7771e9c1c31';
const REGION = {
  id: REGION_ID,
  countryIso: 'ES',
  name: 'Catalonia',
  aliases: ['Catalunya', 'Cataluña'],
};

describe('RegionService', () => {
  let service: RegionService;

  const createMock = vi.fn();
  const findByIdMock = vi.fn();
  const findMock = vi.fn();
  const updateMock = vi.fn();
  const deleteByIdMock = vi.fn();
  const hasCountryMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    hasCountryMock.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegionService,
        {
          provide: REGION_REPOSITORY,
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
      ],
    }).compile();

    service = module.get<RegionService>(RegionService);
  });

  it('should create a normalized Region for an existing country', async () => {
    hasCountryMock.mockResolvedValue(true);
    createMock.mockResolvedValue(REGION);

    await expect(
      service.createRegion({
        countryIso: 'ES',
        name: ' Catalonia ',
        aliases: [' Catalunya ', ' Cataluña '],
      }),
    ).resolves.toEqual(REGION);

    expect(hasCountryMock).toHaveBeenCalledWith('ES');
    expect(createMock).toHaveBeenCalledWith({
      countryIso: 'ES',
      name: 'Catalonia',
      aliases: ['Catalunya', 'Cataluña'],
    });
  });

  it('should reject a Region for a country outside the catalog', async () => {
    hasCountryMock.mockResolvedValue(false);

    await expect(
      service.createRegion({
        countryIso: 'ZZ',
        name: 'Unknown',
        aliases: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('should reject aliases that duplicate the canonical name', async () => {
    await expect(
      service.createRegion({
        countryIso: 'ES',
        name: 'Catalonia',
        aliases: ['CATALONIA'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(hasCountryMock).not.toHaveBeenCalled();
  });

  it('should translate a repository name conflict', async () => {
    hasCountryMock.mockResolvedValue(true);
    createMock.mockRejectedValue(new RegionNameConflictError());

    await expect(
      service.createRegion({
        countryIso: 'ES',
        name: 'Catalonia',
        aliases: [],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('should return a Region by id', async () => {
    findByIdMock.mockResolvedValue(REGION);

    await expect(service.getRegionById(REGION_ID)).resolves.toEqual(REGION);
    expect(findByIdMock).toHaveBeenCalledWith(REGION_ID);
  });

  it('should reject an unknown Region id', async () => {
    findByIdMock.mockResolvedValue(null);

    await expect(service.getRegionById(REGION_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('should report whether a Region exists', async () => {
    findByIdMock.mockResolvedValue(REGION);

    await expect(service.hasRegion(REGION_ID)).resolves.toBe(true);
  });

  it('should reject a stored Region outside the Country catalog', async () => {
    findByIdMock.mockResolvedValue({ ...REGION, countryIso: 'ZZ' });
    hasCountryMock.mockResolvedValue(false);

    await expect(service.getRegionById(REGION_ID)).rejects.toThrow(
      'Region countryIso "ZZ" must reference an existing Country',
    );
  });

  it('should normalize search and forward filters', async () => {
    hasCountryMock.mockResolvedValue(true);
    findMock.mockResolvedValue([REGION]);

    await expect(
      service.findRegions({ countryIso: 'ES', search: ' cat ' }),
    ).resolves.toEqual([REGION]);
    expect(findMock).toHaveBeenCalledWith({
      countryIso: 'ES',
      search: 'cat',
    });
  });

  it('should reject filtering by a country outside the catalog', async () => {
    hasCountryMock.mockResolvedValue(false);

    await expect(
      service.findRegions({ countryIso: 'ZZ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findMock).not.toHaveBeenCalled();
  });

  it('should update aliases while retaining the canonical name', async () => {
    findByIdMock.mockResolvedValue(REGION);
    updateMock.mockResolvedValue({
      ...REGION,
      aliases: ['Catalunya'],
    });

    await expect(
      service.updateRegion({
        id: REGION_ID,
        aliases: [' Catalunya '],
      }),
    ).resolves.toEqual({
      ...REGION,
      aliases: ['Catalunya'],
    });
    expect(updateMock).toHaveBeenCalledWith({
      id: REGION_ID,
      name: 'Catalonia',
      aliases: ['Catalunya'],
    });
  });

  it('should reject an empty update', async () => {
    await expect(
      service.updateRegion({ id: REGION_ID }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it('should delete an existing Region', async () => {
    deleteByIdMock.mockResolvedValue(true);

    await expect(service.deleteRegion(REGION_ID)).resolves.toBeUndefined();
    expect(deleteByIdMock).toHaveBeenCalledWith(REGION_ID);
  });

  it('should reject deletion of an unknown Region', async () => {
    deleteByIdMock.mockResolvedValue(false);

    await expect(service.deleteRegion(REGION_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

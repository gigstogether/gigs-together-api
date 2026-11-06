import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { RegionNameConflictError } from '../region.errors';
import { Region } from '../region.schema';
import { MongoRegionRepository } from './mongo-region.repository';

const REGION_ID = '690a1fdb17f0a7771e9c1c31';
const REGION_DOCUMENT = {
  _id: new Types.ObjectId(REGION_ID),
  countryIso: 'ES',
  name: 'Catalonia',
  aliases: ['Catalunya', 'Cataluña'],
};
const REGION_PROJECTION = {
  _id: 1,
  countryIso: 1,
  name: 1,
  aliases: 1,
};

describe('MongoRegionRepository', () => {
  let repository: MongoRegionRepository;

  const createMock = vi.fn();
  const findOneMock = vi.fn();
  const findMock = vi.fn();
  const findOneAndUpdateMock = vi.fn();
  const deleteOneMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MongoRegionRepository,
        {
          provide: getModelToken(Region.name),
          useValue: {
            create: createMock,
            findOne: findOneMock,
            find: findMock,
            findOneAndUpdate: findOneAndUpdateMock,
            deleteOne: deleteOneMock,
          },
        },
      ],
    }).compile();

    repository = module.get<MongoRegionRepository>(MongoRegionRepository);
  });

  it('should create and map a Region', async () => {
    createMock.mockResolvedValue(REGION_DOCUMENT);

    await expect(
      repository.create({
        countryIso: 'ES',
        name: 'Catalonia',
        aliases: ['Catalunya', 'Cataluña'],
      }),
    ).resolves.toEqual({
      id: REGION_ID,
      countryIso: 'ES',
      name: 'Catalonia',
      aliases: ['Catalunya', 'Cataluña'],
    });
  });

  it('should translate a duplicate key failure', async () => {
    const duplicateError = { code: 11000 };
    createMock.mockRejectedValue(duplicateError);

    const operation = repository.create({
      countryIso: 'ES',
      name: 'Catalonia',
      aliases: [],
    });

    await expect(operation).rejects.toMatchObject({
      name: RegionNameConflictError.name,
      cause: duplicateError,
    });
  });

  it('should find a Region by id', async () => {
    const execMock = vi.fn().mockResolvedValue(REGION_DOCUMENT);
    const leanMock = vi.fn().mockReturnValue({ exec: execMock });
    findOneMock.mockReturnValue({ lean: leanMock });

    await expect(repository.findById(REGION_ID)).resolves.toEqual(
      expect.objectContaining({ id: REGION_ID }),
    );
    expect(findOneMock).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(REGION_ID) },
      REGION_PROJECTION,
    );
  });

  it('should search Regions by country, name, and aliases', async () => {
    const execMock = vi.fn().mockResolvedValue([REGION_DOCUMENT]);
    const leanMock = vi.fn().mockReturnValue({ exec: execMock });
    const sortMock = vi.fn().mockReturnValue({ lean: leanMock });
    findMock.mockReturnValue({ sort: sortMock });

    await expect(
      repository.find({ countryIso: 'ES', search: 'cat' }),
    ).resolves.toEqual([expect.objectContaining({ id: REGION_ID })]);

    expect(findMock).toHaveBeenCalledWith(
      {
        countryIso: 'ES',
        $or: [{ name: expect.any(RegExp) }, { aliases: expect.any(RegExp) }],
      },
      REGION_PROJECTION,
    );
    expect(sortMock).toHaveBeenCalledWith({
      countryIso: 1,
      name: 1,
      _id: 1,
    });
  });

  it('should update a Region', async () => {
    const updatedDocument = {
      ...REGION_DOCUMENT,
      name: 'Catalunya',
      aliases: ['Catalonia'],
    };
    const execMock = vi.fn().mockResolvedValue(updatedDocument);
    const leanMock = vi.fn().mockReturnValue({ exec: execMock });
    findOneAndUpdateMock.mockReturnValue({ lean: leanMock });

    await expect(
      repository.update({
        id: REGION_ID,
        name: 'Catalunya',
        aliases: ['Catalonia'],
      }),
    ).resolves.toEqual(expect.objectContaining({ name: 'Catalunya' }));
    expect(findOneAndUpdateMock).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(REGION_ID) },
      {
        $set: {
          name: 'Catalunya',
          aliases: ['Catalonia'],
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
  });

  it('should delete a Region by id', async () => {
    const execMock = vi.fn().mockResolvedValue({ deletedCount: 1 });
    deleteOneMock.mockReturnValue({ exec: execMock });

    await expect(repository.deleteById(REGION_ID)).resolves.toBe(true);
    expect(deleteOneMock).toHaveBeenCalledWith({
      _id: new Types.ObjectId(REGION_ID),
    });
  });
});

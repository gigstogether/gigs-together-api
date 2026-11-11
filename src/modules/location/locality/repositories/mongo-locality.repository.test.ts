import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { LocalityNameConflictError } from '../locality.errors';
import { Locality } from '../locality.schema';
import { MongoLocalityRepository } from './mongo-locality.repository';

const LOCALITY_ID = '690a1fdb17f0a7771e9c1c32';
const REGION_ID = '690a1fdb17f0a7771e9c1c31';
const LOCALITY_DOCUMENT = {
  _id: new Types.ObjectId(LOCALITY_ID),
  regionId: new Types.ObjectId(REGION_ID),
  name: 'Barcelona',
  aliases: ['Barna', 'BCN'],
  timeZone: 'Europe/Madrid',
};
const LOCALITY_PROJECTION = {
  _id: 1,
  regionId: 1,
  name: 1,
  aliases: 1,
  timeZone: 1,
};

describe('MongoLocalityRepository', () => {
  let repository: MongoLocalityRepository;

  const createMock = vi.fn();
  const findOneMock = vi.fn();
  const findMock = vi.fn();
  const existsMock = vi.fn();
  const findOneAndUpdateMock = vi.fn();
  const deleteOneMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MongoLocalityRepository,
        {
          provide: getModelToken(Locality.name),
          useValue: {
            create: createMock,
            findOne: findOneMock,
            find: findMock,
            exists: existsMock,
            findOneAndUpdate: findOneAndUpdateMock,
            deleteOne: deleteOneMock,
          },
        },
      ],
    }).compile();

    repository = module.get<MongoLocalityRepository>(MongoLocalityRepository);
  });

  it('should create and map a Locality', async () => {
    createMock.mockResolvedValue(LOCALITY_DOCUMENT);

    await expect(
      repository.create({
        regionId: REGION_ID,
        name: 'Barcelona',
        aliases: ['Barna', 'BCN'],
        timeZone: 'Europe/Madrid',
      }),
    ).resolves.toEqual({
      id: LOCALITY_ID,
      regionId: REGION_ID,
      name: 'Barcelona',
      aliases: ['Barna', 'BCN'],
      timeZone: 'Europe/Madrid',
    });
  });

  it('should translate a duplicate key failure', async () => {
    const duplicateError = { code: 11000 };
    createMock.mockRejectedValue(duplicateError);

    const operation = repository.create({
      regionId: REGION_ID,
      name: 'Barcelona',
      aliases: [],
      timeZone: 'Europe/Madrid',
    });

    await expect(operation).rejects.toMatchObject({
      name: LocalityNameConflictError.name,
      cause: duplicateError,
    });
  });

  it('should find a Locality by id', async () => {
    const execMock = vi.fn().mockResolvedValue(LOCALITY_DOCUMENT);
    const leanMock = vi.fn().mockReturnValue({ exec: execMock });
    findOneMock.mockReturnValue({ lean: leanMock });

    await expect(repository.findById(LOCALITY_ID)).resolves.toEqual(
      expect.objectContaining({ id: LOCALITY_ID }),
    );
    expect(findOneMock).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(LOCALITY_ID) },
      LOCALITY_PROJECTION,
    );
  });

  it('should search Localities by Region, name, and aliases', async () => {
    const execMock = vi.fn().mockResolvedValue([LOCALITY_DOCUMENT]);
    const leanMock = vi.fn().mockReturnValue({ exec: execMock });
    const sortMock = vi.fn().mockReturnValue({ lean: leanMock });
    findMock.mockReturnValue({ sort: sortMock });

    await expect(
      repository.find({ regionId: REGION_ID, search: 'bar' }),
    ).resolves.toEqual([expect.objectContaining({ id: LOCALITY_ID })]);

    expect(findMock).toHaveBeenCalledWith(
      {
        regionId: new Types.ObjectId(REGION_ID),
        $or: [{ name: expect.any(RegExp) }, { aliases: expect.any(RegExp) }],
      },
      LOCALITY_PROJECTION,
    );
    expect(sortMock).toHaveBeenCalledWith({
      regionId: 1,
      name: 1,
      _id: 1,
    });
  });

  it('should report whether a Region has Localities', async () => {
    existsMock.mockResolvedValue({ _id: new Types.ObjectId(LOCALITY_ID) });

    await expect(repository.existsByRegionId(REGION_ID)).resolves.toBe(true);
    expect(existsMock).toHaveBeenCalledWith({
      regionId: new Types.ObjectId(REGION_ID),
    });
  });

  it('should update a Locality', async () => {
    const updatedDocument = {
      ...LOCALITY_DOCUMENT,
      aliases: ['BCN'],
    };
    const execMock = vi.fn().mockResolvedValue(updatedDocument);
    const leanMock = vi.fn().mockReturnValue({ exec: execMock });
    findOneAndUpdateMock.mockReturnValue({ lean: leanMock });

    await expect(
      repository.update({
        id: LOCALITY_ID,
        name: 'Barcelona',
        aliases: ['BCN'],
        timeZone: 'Europe/Madrid',
      }),
    ).resolves.toEqual(expect.objectContaining({ aliases: ['BCN'] }));
    expect(findOneAndUpdateMock).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(LOCALITY_ID) },
      {
        $set: {
          name: 'Barcelona',
          aliases: ['BCN'],
          timeZone: 'Europe/Madrid',
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
  });

  it('should delete a Locality by id', async () => {
    const execMock = vi.fn().mockResolvedValue({ deletedCount: 1 });
    deleteOneMock.mockReturnValue({ exec: execMock });

    await expect(repository.deleteById(LOCALITY_ID)).resolves.toBe(true);
    expect(deleteOneMock).toHaveBeenCalledWith({
      _id: new Types.ObjectId(LOCALITY_ID),
    });
  });
});

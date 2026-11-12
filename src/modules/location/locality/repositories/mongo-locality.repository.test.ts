import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { LocalityNameConflictError } from '../locality.errors';
import { Locality } from '../locality.schema';
import { MongoLocalityRepository } from './mongo-locality.repository';

const LOCALITY_ID = '690a1fdb17f0a7771e9c1c32';
const LOCALITY_DOCUMENT = {
  _id: new Types.ObjectId(LOCALITY_ID),
  countryIso: 'ES',
  name: 'Barcelona',
  qualifier: 'Barcelona province',
  aliases: ['Barna', 'BCN'],
  timeZone: 'Europe/Madrid',
};
const LOCALITY_PROJECTION = {
  _id: 1,
  countryIso: 1,
  name: 1,
  qualifier: 1,
  aliases: 1,
  timeZone: 1,
};

describe('MongoLocalityRepository', () => {
  let repository: MongoLocalityRepository;

  const createMock = vi.fn();
  const findOneMock = vi.fn();
  const findMock = vi.fn();
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
        countryIso: 'ES',
        name: 'Barcelona',
        qualifier: 'Barcelona province',
        aliases: ['Barna', 'BCN'],
        timeZone: 'Europe/Madrid',
      }),
    ).resolves.toEqual({
      id: LOCALITY_ID,
      countryIso: 'ES',
      name: 'Barcelona',
      qualifier: 'Barcelona province',
      aliases: ['Barna', 'BCN'],
      timeZone: 'Europe/Madrid',
    });
  });

  it('should translate a duplicate key failure', async () => {
    const duplicateError = { code: 11000 };
    createMock.mockRejectedValue(duplicateError);

    const operation = repository.create({
      countryIso: 'ES',
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

  it('should search Localities by Country, name, qualifier, and aliases', async () => {
    const execMock = vi.fn().mockResolvedValue([LOCALITY_DOCUMENT]);
    const leanMock = vi.fn().mockReturnValue({ exec: execMock });
    const sortMock = vi.fn().mockReturnValue({ lean: leanMock });
    findMock.mockReturnValue({ sort: sortMock });

    await expect(
      repository.find({ countryIso: 'ES', search: 'bar' }),
    ).resolves.toEqual([expect.objectContaining({ id: LOCALITY_ID })]);

    expect(findMock).toHaveBeenCalledWith(
      {
        countryIso: 'ES',
        $or: [
          { name: expect.any(RegExp) },
          { qualifier: expect.any(RegExp) },
          { aliases: expect.any(RegExp) },
        ],
      },
      LOCALITY_PROJECTION,
    );
    expect(sortMock).toHaveBeenCalledWith({
      countryIso: 1,
      name: 1,
      qualifier: 1,
      _id: 1,
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
        qualifier: 'Barcelona province',
        aliases: ['BCN'],
        timeZone: 'Europe/Madrid',
      }),
    ).resolves.toEqual(expect.objectContaining({ aliases: ['BCN'] }));
    expect(findOneAndUpdateMock).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(LOCALITY_ID) },
      {
        $set: {
          name: 'Barcelona',
          qualifier: 'Barcelona province',
          aliases: ['BCN'],
          timeZone: 'Europe/Madrid',
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
  });

  it('should unset an omitted qualifier during a full record update', async () => {
    const updatedDocument = {
      _id: LOCALITY_DOCUMENT._id,
      countryIso: LOCALITY_DOCUMENT.countryIso,
      name: LOCALITY_DOCUMENT.name,
      aliases: LOCALITY_DOCUMENT.aliases,
      timeZone: LOCALITY_DOCUMENT.timeZone,
    };
    const execMock = vi.fn().mockResolvedValue(updatedDocument);
    const leanMock = vi.fn().mockReturnValue({ exec: execMock });
    findOneAndUpdateMock.mockReturnValue({ lean: leanMock });

    await expect(
      repository.update({
        id: LOCALITY_ID,
        name: 'Barcelona',
        aliases: ['Barna', 'BCN'],
        timeZone: 'Europe/Madrid',
      }),
    ).resolves.toEqual(
      expect.not.objectContaining({ qualifier: expect.anything() }),
    );
    expect(findOneAndUpdateMock).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(LOCALITY_ID) },
      {
        $set: {
          name: 'Barcelona',
          aliases: ['Barna', 'BCN'],
          timeZone: 'Europe/Madrid',
        },
        $unset: { qualifier: 1 },
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

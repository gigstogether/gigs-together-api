import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { VenueNameConflictError } from '../venue.errors';
import { Venue } from '../venue.schema';
import { MongoVenueRepository } from './mongo-venue.repository';

const VENUE_ID = '690a1fdb17f0a7771e9c1c33';
const LOCALITY_ID = '690a1fdb17f0a7771e9c1c32';
const VENUE_DOCUMENT = {
  _id: new Types.ObjectId(VENUE_ID),
  localityId: new Types.ObjectId(LOCALITY_ID),
  name: 'Sala Apolo',
  aliases: ['Apolo'],
  isActive: true,
};
const VENUE_PROJECTION = {
  _id: 1,
  localityId: 1,
  name: 1,
  aliases: 1,
  isActive: 1,
};

describe('MongoVenueRepository', () => {
  let repository: MongoVenueRepository;

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
        MongoVenueRepository,
        {
          provide: getModelToken(Venue.name),
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

    repository = module.get<MongoVenueRepository>(MongoVenueRepository);
  });

  it('should create and map a Venue', async () => {
    createMock.mockResolvedValue(VENUE_DOCUMENT);

    await expect(
      repository.create({
        localityId: LOCALITY_ID,
        name: 'Sala Apolo',
        aliases: ['Apolo'],
        isActive: true,
      }),
    ).resolves.toEqual({
      id: VENUE_ID,
      localityId: LOCALITY_ID,
      name: 'Sala Apolo',
      aliases: ['Apolo'],
      isActive: true,
    });
    expect(createMock).toHaveBeenCalledWith({
      localityId: new Types.ObjectId(LOCALITY_ID),
      name: 'Sala Apolo',
      aliases: ['Apolo'],
      isActive: true,
    });
  });

  it('should translate a duplicate key failure', async () => {
    const duplicateError = { code: 11000 };
    createMock.mockRejectedValue(duplicateError);

    const operation = repository.create({
      localityId: LOCALITY_ID,
      name: 'Sala Apolo',
      aliases: [],
      isActive: true,
    });

    await expect(operation).rejects.toMatchObject({
      name: VenueNameConflictError.name,
      cause: duplicateError,
    });
  });

  it('should find a Venue by id', async () => {
    const execMock = vi.fn().mockResolvedValue(VENUE_DOCUMENT);
    const leanMock = vi.fn().mockReturnValue({ exec: execMock });
    findOneMock.mockReturnValue({ lean: leanMock });

    await expect(repository.findById(VENUE_ID)).resolves.toEqual(
      expect.objectContaining({ id: VENUE_ID }),
    );
    expect(findOneMock).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(VENUE_ID) },
      VENUE_PROJECTION,
    );
  });

  it('should search Venues by Locality, active state, name, and aliases', async () => {
    const execMock = vi.fn().mockResolvedValue([VENUE_DOCUMENT]);
    const leanMock = vi.fn().mockReturnValue({ exec: execMock });
    const sortMock = vi.fn().mockReturnValue({ lean: leanMock });
    findMock.mockReturnValue({ sort: sortMock });

    await expect(
      repository.find({
        localityId: LOCALITY_ID,
        search: 'apolo',
        isActive: true,
      }),
    ).resolves.toEqual([expect.objectContaining({ id: VENUE_ID })]);
    expect(findMock).toHaveBeenCalledWith(
      {
        localityId: new Types.ObjectId(LOCALITY_ID),
        isActive: true,
        $or: [{ name: expect.any(RegExp) }, { aliases: expect.any(RegExp) }],
      },
      VENUE_PROJECTION,
    );
  });

  it('should report whether a Locality has Venues', async () => {
    existsMock.mockResolvedValue({ _id: new Types.ObjectId(VENUE_ID) });

    await expect(repository.existsByLocalityId(LOCALITY_ID)).resolves.toBe(
      true,
    );
    expect(existsMock).toHaveBeenCalledWith({
      localityId: new Types.ObjectId(LOCALITY_ID),
    });
  });

  it('should update a Venue', async () => {
    const updatedDocument = { ...VENUE_DOCUMENT, isActive: false };
    const execMock = vi.fn().mockResolvedValue(updatedDocument);
    const leanMock = vi.fn().mockReturnValue({ exec: execMock });
    findOneAndUpdateMock.mockReturnValue({ lean: leanMock });

    await expect(
      repository.update({
        id: VENUE_ID,
        name: 'Sala Apolo',
        aliases: ['Apolo'],
        isActive: false,
      }),
    ).resolves.toEqual(expect.objectContaining({ isActive: false }));
    expect(findOneAndUpdateMock).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(VENUE_ID) },
      {
        $set: {
          name: 'Sala Apolo',
          aliases: ['Apolo'],
          isActive: false,
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
  });

  it('should delete a Venue by id', async () => {
    const execMock = vi.fn().mockResolvedValue({ deletedCount: 1 });
    deleteOneMock.mockReturnValue({ exec: execMock });

    await expect(repository.deleteById(VENUE_ID)).resolves.toBe(true);
    expect(deleteOneMock).toHaveBeenCalledWith({
      _id: new Types.ObjectId(VENUE_ID),
    });
  });
});

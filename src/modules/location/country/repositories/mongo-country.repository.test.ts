import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { CountryIsoConflictError } from '../country.errors';
import { Country } from '../country.schema';
import { MongoCountryRepository } from './mongo-country.repository';

describe('MongoCountryRepository', () => {
  let repository: MongoCountryRepository;

  const findMock = vi.fn();
  const createMock = vi.fn();

  beforeEach(async () => {
    findMock.mockReset();
    createMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MongoCountryRepository,
        {
          provide: getModelToken(Country.name),
          useValue: { create: createMock, find: findMock },
        },
      ],
    }).compile();

    repository = module.get<MongoCountryRepository>(MongoCountryRepository);
  });

  it('should create a country', async () => {
    createMock.mockResolvedValue({ iso: 'ES' });

    await expect(repository.create({ iso: 'ES' })).resolves.toEqual({
      iso: 'ES',
    });
    expect(createMock).toHaveBeenCalledWith({ iso: 'ES' });
  });

  it('should translate duplicate ISO errors', async () => {
    createMock.mockRejectedValue({ code: 11000 });

    await expect(repository.create({ iso: 'ES' })).rejects.toBeInstanceOf(
      CountryIsoConflictError,
    );
  });

  it('should return countries ordered by iso', async () => {
    const execMock = vi.fn().mockResolvedValue([{ iso: 'ES' }, { iso: 'FR' }]);
    const leanMock = vi.fn().mockReturnValue({ exec: execMock });
    const sortMock = vi.fn().mockReturnValue({ lean: leanMock });
    findMock.mockReturnValue({ sort: sortMock });

    await expect(repository.findAllOrderedByIso()).resolves.toEqual([
      { iso: 'ES' },
      { iso: 'FR' },
    ]);

    expect(findMock).toHaveBeenCalledWith({}, { _id: 0, iso: 1 });
    expect(sortMock).toHaveBeenCalledWith({ iso: 1 });
  });
});

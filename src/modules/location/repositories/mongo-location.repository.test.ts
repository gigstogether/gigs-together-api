import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Country } from '../location.schema';
import { MongoLocationRepository } from './mongo-location.repository';

describe('MongoLocationRepository', () => {
  let repository: MongoLocationRepository;

  const findMock = vi.fn();

  beforeEach(async () => {
    findMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MongoLocationRepository,
        {
          provide: getModelToken(Country.name),
          useValue: { find: findMock },
        },
      ],
    }).compile();

    repository = module.get<MongoLocationRepository>(MongoLocationRepository);
  });

  it('should return countries ordered by iso', async () => {
    const execMock = vi.fn().mockResolvedValue([{ iso: 'ES' }, { iso: 'FR' }]);
    const leanMock = vi.fn().mockReturnValue({ exec: execMock });
    const sortMock = vi.fn().mockReturnValue({ lean: leanMock });
    findMock.mockReturnValue({ sort: sortMock });

    await expect(repository.findCountriesOrderedByIso()).resolves.toEqual([
      { iso: 'ES' },
      { iso: 'FR' },
    ]);

    expect(findMock).toHaveBeenCalledWith({}, { _id: 0, iso: 1 });
    expect(sortMock).toHaveBeenCalledWith({ iso: 1 });
  });
});

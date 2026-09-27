import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { DigestPostState } from '../digest-post-state.schema';
import { MongoDigestPostStateRepository } from './mongo-digest-post-state.repository';

describe('MongoDigestPostStateRepository', () => {
  let repository: MongoDigestPostStateRepository;

  const findOneMock = vi.fn();
  const findOneAndUpdateMock = vi.fn();

  beforeEach(async () => {
    findOneMock.mockReset();
    findOneAndUpdateMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MongoDigestPostStateRepository,
        {
          provide: getModelToken(DigestPostState.name),
          useValue: {
            findOne: findOneMock,
            findOneAndUpdate: findOneAndUpdateMock,
          },
        },
      ],
    }).compile();

    repository = module.get<MongoDigestPostStateRepository>(
      MongoDigestPostStateRepository,
    );
  });

  it('should return the current digest post state', async () => {
    const postedAt = new Date('2026-09-21T10:00:00.000Z');
    const execMock = vi.fn().mockResolvedValue({
      postedAt,
      postUrl: 'https://t.me/c/1/42',
    });
    const leanMock = vi.fn().mockReturnValue({ exec: execMock });
    findOneMock.mockReturnValue({ lean: leanMock });

    await expect(repository.findCurrent()).resolves.toEqual({
      postedAt,
      postUrl: 'https://t.me/c/1/42',
    });

    expect(findOneMock).toHaveBeenCalledWith(
      {},
      { _id: 0, postedAt: 1, postUrl: 1 },
    );
  });

  it('should return null when no digest post state exists', async () => {
    const execMock = vi.fn().mockResolvedValue(null);
    findOneMock.mockReturnValue({
      lean: vi.fn().mockReturnValue({ exec: execMock }),
    });

    await expect(repository.findCurrent()).resolves.toBeNull();
  });

  it('should upsert a successful digest post state', async () => {
    const postedAt = new Date('2026-09-21T10:00:00.000Z');
    const execMock = vi.fn().mockResolvedValue({});
    findOneAndUpdateMock.mockReturnValue({ exec: execMock });

    await expect(
      repository.saveSuccessfulPost({
        postedAt,
        postUrl: 'https://t.me/c/1/42',
      }),
    ).resolves.toBeUndefined();

    expect(findOneAndUpdateMock).toHaveBeenCalledWith(
      {},
      {
        $set: {
          postedAt,
          postUrl: 'https://t.me/c/1/42',
        },
      },
      { upsert: true },
    );
  });
});

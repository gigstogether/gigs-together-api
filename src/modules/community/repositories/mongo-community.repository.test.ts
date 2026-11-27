import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Community } from '../community.schema';
import { MongoCommunityRepository } from './mongo-community.repository';
import { CommunityRouteConflictError } from '../community.errors';

const COMMUNITY_ID = '690a1fdb17f0a7771e9c1c21';
const SECOND_COMMUNITY_ID = '690a1fdb17f0a7771e9c1c22';
const COMMUNITY_DOCUMENT = {
  _id: new Types.ObjectId(COMMUNITY_ID),
  countryIso: 'ES',
  slug: 'barcelona',
  nameTranslationKey: 'barcelona.name',
  timeZone: 'Europe/Madrid',
  isActive: true,
};
const COMMUNITY_PROJECTION = {
  _id: 1,
  countryIso: 1,
  slug: 1,
  nameTranslationKey: 1,
  timeZone: 1,
  isActive: 1,
};

describe('MongoCommunityRepository', () => {
  let repository: MongoCommunityRepository;

  const findMock = vi.fn();
  const findOneMock = vi.fn();
  const createMock = vi.fn();
  const updateMock = vi.fn();

  beforeEach(async () => {
    createMock.mockReset();
    updateMock.mockReset();
    findMock.mockReset();
    findOneMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MongoCommunityRepository,
        {
          provide: getModelToken(Community.name),
          useValue: {
            find: findMock,
            findOne: findOneMock,
            create: createMock,
            findOneAndUpdate: updateMock,
          },
        },
      ],
    }).compile();

    repository = module.get<MongoCommunityRepository>(MongoCommunityRepository);
  });

  it('should return a domain Community when creating a record', async () => {
    createMock.mockResolvedValue({ toObject: () => COMMUNITY_DOCUMENT });
    await expect(
      repository.create({
        countryIso: 'ES',
        slug: 'barcelona',
        nameTranslationKey: 'barcelona.name',
        timeZone: 'Europe/Madrid',
        isActive: true,
      }),
    ).resolves.toMatchObject({ id: COMMUNITY_ID });
  });

  it('should preserve a non-enumerable cause when the country and slug collide', async () => {
    const upstream = { code: 11000, message: 'Duplicate key' };
    createMock.mockRejectedValue(upstream);
    const creation = repository.create({
      countryIso: 'ES',
      slug: 'barcelona',
      nameTranslationKey: 'barcelona.name',
      timeZone: 'Europe/Madrid',
      isActive: true,
    });
    await expect(creation).rejects.toBeInstanceOf(CommunityRouteConflictError);
    await expect(creation).rejects.toHaveProperty('cause', upstream);
  });

  it('should include inactive records when reading all Communities', async () => {
    findMock.mockReturnValue({
      sort: () => ({
        lean: () => ({
          exec: () =>
            Promise.resolve([{ ...COMMUNITY_DOCUMENT, isActive: false }]),
        }),
      }),
    });
    await expect(repository.findAll()).resolves.toMatchObject([
      { isActive: false },
    ]);
    expect(findMock).toHaveBeenCalledWith({}, COMMUNITY_PROJECTION);
  });

  it('should update the existing record when a Community is edited', async () => {
    updateMock.mockReturnValue({
      lean: () => ({
        exec: () => Promise.resolve({ ...COMMUNITY_DOCUMENT, isActive: false }),
      }),
    });
    await expect(
      repository.update({
        id: COMMUNITY_ID,
        expected: COMMUNITY_DOCUMENT,
        data: {
          countryIso: 'ES',
          slug: 'barcelona',
          nameTranslationKey: 'barcelona.name',
          timeZone: 'Europe/Madrid',
          isActive: false,
        },
      }),
    ).resolves.toMatchObject({ isActive: false });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        nameTranslationKey: 'barcelona.name',
        isActive: true,
      }),
      expect.any(Object),
      expect.any(Object),
    );
  });

  it('should report a missing record when the Community disappears during an update', async () => {
    updateMock.mockReturnValue({
      lean: () => ({ exec: () => Promise.resolve(null) }),
    });
    await expect(
      repository.update({
        id: COMMUNITY_ID,
        expected: COMMUNITY_DOCUMENT,
        data: {
          countryIso: 'ES',
          slug: 'barcelona',
          nameTranslationKey: 'barcelona.name',
          timeZone: 'Europe/Madrid',
          isActive: false,
        },
      }),
    ).resolves.toBeNull();
  });

  it('should find a Community by id', async () => {
    const execMock = vi.fn().mockResolvedValue(COMMUNITY_DOCUMENT);
    const leanMock = vi.fn().mockReturnValue({ exec: execMock });
    findOneMock.mockReturnValue({ lean: leanMock });

    await expect(repository.findById(COMMUNITY_ID)).resolves.toEqual({
      id: COMMUNITY_ID,
      countryIso: 'ES',
      slug: 'barcelona',
      nameTranslationKey: 'barcelona.name',
      timeZone: 'Europe/Madrid',
      isActive: true,
    });

    expect(findOneMock).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(COMMUNITY_ID) },
      COMMUNITY_PROJECTION,
    );
  });

  it('should return null when a Community id does not exist', async () => {
    const execMock = vi.fn().mockResolvedValue(null);
    const leanMock = vi.fn().mockReturnValue({ exec: execMock });
    findOneMock.mockReturnValue({ lean: leanMock });

    await expect(repository.findById(COMMUNITY_ID)).resolves.toBeNull();
  });

  it('should reject an invalid Community id', async () => {
    await expect(repository.findById('invalid')).rejects.toThrow(
      'Community id must be a valid ObjectId',
    );
    expect(findOneMock).not.toHaveBeenCalled();
  });

  it('should find Communities by ids in stable route order', async () => {
    const execMock = vi.fn().mockResolvedValue([COMMUNITY_DOCUMENT]);
    const leanMock = vi.fn().mockReturnValue({ exec: execMock });
    const sortMock = vi.fn().mockReturnValue({ lean: leanMock });
    findMock.mockReturnValue({ sort: sortMock });

    await expect(
      repository.findByIds([COMMUNITY_ID, SECOND_COMMUNITY_ID]),
    ).resolves.toEqual([expect.objectContaining({ id: COMMUNITY_ID })]);

    expect(findMock).toHaveBeenCalledWith(
      {
        _id: {
          $in: [
            new Types.ObjectId(COMMUNITY_ID),
            new Types.ObjectId(SECOND_COMMUNITY_ID),
          ],
        },
      },
      COMMUNITY_PROJECTION,
    );
    expect(sortMock).toHaveBeenCalledWith({ countryIso: 1, slug: 1 });
  });

  it('should reject an invalid Community id in a batch', async () => {
    await expect(
      repository.findByIds([COMMUNITY_ID, 'invalid']),
    ).rejects.toThrow('Community id must be a valid ObjectId');
    expect(findMock).not.toHaveBeenCalled();
  });

  it('should find a Community by its route', async () => {
    const execMock = vi.fn().mockResolvedValue(COMMUNITY_DOCUMENT);
    const leanMock = vi.fn().mockReturnValue({ exec: execMock });
    findOneMock.mockReturnValue({ lean: leanMock });

    await expect(
      repository.findByRoute({
        countryIso: 'ES',
        communitySlug: 'barcelona',
      }),
    ).resolves.toEqual(expect.objectContaining({ id: COMMUNITY_ID }));

    expect(findOneMock).toHaveBeenCalledWith(
      { countryIso: 'ES', slug: 'barcelona' },
      COMMUNITY_PROJECTION,
    );
  });

  it('should return active Communities in stable route order', async () => {
    const execMock = vi.fn().mockResolvedValue([COMMUNITY_DOCUMENT]);
    const leanMock = vi.fn().mockReturnValue({ exec: execMock });
    const sortMock = vi.fn().mockReturnValue({ lean: leanMock });
    findMock.mockReturnValue({ sort: sortMock });

    await expect(repository.findActive()).resolves.toEqual([
      expect.objectContaining({ id: COMMUNITY_ID }),
    ]);

    expect(findMock).toHaveBeenCalledWith(
      { isActive: true },
      COMMUNITY_PROJECTION,
    );
    expect(sortMock).toHaveBeenCalledWith({ countryIso: 1, slug: 1 });
  });
});

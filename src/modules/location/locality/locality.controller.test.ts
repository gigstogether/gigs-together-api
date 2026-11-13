import { PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { LocalityController } from './locality.controller';
import { LocalityService } from './locality.service';

const LOCALITY = {
  id: '690a1fdb17f0a7771e9c1c32',
  countryIso: 'ES',
  name: 'San Pedro',
  qualifier: 'Albacete province',
  aliases: ['San Pedro de Albacete'],
  timeZone: 'Europe/Madrid',
};

describe('LocalityController', () => {
  let controller: LocalityController;
  const findLocalitiesMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LocalityController],
      providers: [
        {
          provide: LocalityService,
          useValue: { findLocalities: findLocalitiesMock },
        },
      ],
    }).compile();

    controller = module.get<LocalityController>(LocalityController);
  });

  it('should expose the Localities collection as a plural root resource', () => {
    expect(Reflect.getMetadata(PATH_METADATA, LocalityController)).toBe(
      'localities',
    );
  });

  it('should return Localities with qualifier and without search aliases', async () => {
    findLocalitiesMock.mockResolvedValue([LOCALITY]);

    await expect(
      controller.getLocalitiesV1({ countryIso: 'ES' }),
    ).resolves.toEqual({
      localities: [
        {
          id: LOCALITY.id,
          countryIso: 'ES',
          name: 'San Pedro',
          qualifier: 'Albacete province',
          timeZone: 'Europe/Madrid',
        },
      ],
    });
    expect(findLocalitiesMock).toHaveBeenCalledWith({
      countryIso: 'ES',
    });
  });
});

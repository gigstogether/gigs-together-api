import { HttpService } from '@nestjs/axios';
import { BadRequestException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { BucketService } from '../bucket/bucket.service';
import { GigPosterService } from './gig.poster.service';

describe('GigPosterService', () => {
  let gigPosterService: GigPosterService;

  const bucketService = {
    upload: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GigPosterService,
        { provide: BucketService, useValue: bucketService },
        { provide: HttpService, useValue: { get: vi.fn() } },
      ],
    }).compile();

    gigPosterService = module.get(GigPosterService);
    bucketService.upload.mockResolvedValue('gigs/2026/es/barcelona/gc-1');
  });

  afterEach(() => {
    bucketService.upload.mockReset();
  });

  it('should reject an SVG poster when its MIME type identifies SVG', async () => {
    const upload = gigPosterService.upload({
      file: {
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        mimetype: 'image/svg+xml',
      },
      context: {
        date: '2026-09-17',
        country: 'ES',
        city: 'Barcelona',
        publicId: 'gc-1',
      },
    });

    await expect(upload).rejects.toThrow(BadRequestException);
    await expect(upload).rejects.toThrow(/SVG poster files are not supported/);
    expect(bucketService.upload).not.toHaveBeenCalled();
  });

  it('should reject SVG markup when its MIME type is spoofed as a raster image', async () => {
    const upload = gigPosterService.upload({
      file: {
        buffer: Buffer.from(
          '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>',
        ),
        mimetype: 'image/png',
      },
      context: {
        date: '2026-09-17',
        country: 'ES',
        city: 'Barcelona',
        publicId: 'gc-1',
      },
    });

    await expect(upload).rejects.toThrow(/SVG poster files are not supported/);
    expect(bucketService.upload).not.toHaveBeenCalled();
  });

  it('should upload a raster poster', async () => {
    await expect(
      gigPosterService.upload({
        file: {
          buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
          mimetype: 'image/png',
        },
        context: {
          date: '2026-09-17',
          country: 'ES',
          city: 'Barcelona',
          publicId: 'gc-1',
        },
      }),
    ).resolves.toEqual({ bucketPath: 'gigs/2026/es/barcelona/gc-1' });
    expect(bucketService.upload).toHaveBeenCalledWith({
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      mimetype: 'image/png',
      key: 'gigs/2026/es/barcelona/gc-1',
    });
  });
});

import { BadRequestException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { BucketService } from '../bucket/bucket.service';
import {
  InvalidRemoteImageUrlError,
  RemoteImageContentTypeError,
  RemoteImageService,
} from '../remote-image/remote-image.service';
import { GigPosterService } from './gig.poster.service';

describe('GigPosterService', () => {
  let gigPosterService: GigPosterService;

  const bucketService = {
    upload: vi.fn(),
  };
  const remoteImageService = {
    download: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GigPosterService,
        { provide: BucketService, useValue: bucketService },
        { provide: RemoteImageService, useValue: remoteImageService },
      ],
    }).compile();

    gigPosterService = module.get(GigPosterService);
    bucketService.upload.mockResolvedValue('gigs/2026/es/barcelona/gc-1');
  });

  afterEach(() => {
    bucketService.upload.mockReset();
    remoteImageService.download.mockReset();
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
    ).resolves.toEqual({
      storedPoster: { bucketPath: 'gigs/2026/es/barcelona/gc-1' },
      posterFile: {
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        mimetype: 'image/png',
        filename: 'poster.png',
      },
    });
    expect(bucketService.upload).toHaveBeenCalledWith({
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      mimetype: 'image/png',
      key: 'gigs/2026/es/barcelona/gc-1',
    });
  });

  it('should return downloaded poster bytes after uploading an external URL', async () => {
    const posterBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]).buffer;
    remoteImageService.download.mockResolvedValue({
      buffer: Buffer.from(posterBytes),
      contentType: 'image/png',
    });

    await expect(
      gigPosterService.upload({
        url: 'https://images.example/download/poster',
        context: {
          date: '2026-09-17',
          country: 'ES',
          city: 'Barcelona',
          publicId: 'gc-1',
        },
      }),
    ).resolves.toEqual({
      storedPoster: {
        bucketPath: 'gigs/2026/es/barcelona/gc-1',
        externalUrl: 'https://images.example/download/poster',
      },
      posterFile: {
        buffer: Buffer.from(posterBytes),
        mimetype: 'image/png',
        filename: 'poster.png',
      },
    });
    expect(bucketService.upload).toHaveBeenCalledWith({
      buffer: Buffer.from(posterBytes),
      mimetype: 'image/png',
      key: 'gigs/2026/es/barcelona/gc-1',
    });
    expect(remoteImageService.download).toHaveBeenCalledWith(
      'https://images.example/download/poster',
    );
  });

  it('should preserve the poster URL validation error contract', async () => {
    remoteImageService.download.mockRejectedValue(
      new InvalidRemoteImageUrlError(),
    );

    await expect(
      gigPosterService.upload({
        url: 'invalid-url',
        context: {
          date: '2026-09-17',
          country: 'ES',
          city: 'Barcelona',
          publicId: 'gc-1',
        },
      }),
    ).rejects.toThrow('posterUrl must be a valid URL');
  });

  it('should preserve the non-image poster error contract', async () => {
    remoteImageService.download.mockRejectedValue(
      new RemoteImageContentTypeError('text/html'),
    );

    await expect(
      gigPosterService.upload({
        url: 'https://images.example/not-an-image',
        context: {
          date: '2026-09-17',
          country: 'ES',
          city: 'Barcelona',
          publicId: 'gc-1',
        },
      }),
    ).rejects.toThrow(
      'Failed to download poster: posterUrl must point to an image (content-type: "text/html")',
    );
  });
});

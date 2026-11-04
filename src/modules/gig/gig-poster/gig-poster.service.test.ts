import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { BucketService } from '../../bucket/bucket.service';
import {
  InvalidRemoteImageUrlError,
  RemoteImageContentTypeError,
  RemoteImageService,
} from '../../remote-image/remote-image.service';
import { GigPosterService } from './gig-poster.service';

const PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

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
        {
          provide: ConfigService,
          useValue: new ConfigService({ S3_POSTERS_PREFIX: 'gigs' }),
        },
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
          buffer: PNG_BUFFER,
          mimetype: 'application/octet-stream',
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
        buffer: PNG_BUFFER,
        mimetype: 'image/png',
        filename: 'poster.png',
      },
    });
    expect(bucketService.upload).toHaveBeenCalledWith({
      buffer: PNG_BUFFER,
      mimetype: 'image/png',
      key: 'gigs/2026/es/barcelona/gc-1',
    });
  });

  it('should preserve supported HEIC bytes without conversion', async () => {
    const heicBuffer = Buffer.from([
      0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31,
      0x00, 0x00, 0x00, 0x00, 0x68, 0x65, 0x69, 0x63,
    ]);

    await expect(
      gigPosterService.upload({
        file: {
          buffer: heicBuffer,
          mimetype: 'image/heif',
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
        buffer: heicBuffer,
        mimetype: 'image/heic',
        filename: 'poster.heic',
      },
    });
    expect(bucketService.upload).toHaveBeenCalledWith({
      buffer: heicBuffer,
      mimetype: 'image/heic',
      key: 'gigs/2026/es/barcelona/gc-1',
    });
  });

  it('should reject an unsupported raster image', async () => {
    const upload = gigPosterService.upload({
      file: {
        buffer: Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
        mimetype: 'image/gif',
      },
      context: {
        date: '2026-09-17',
        country: 'ES',
        city: 'Barcelona',
        publicId: 'gc-1',
      },
    });

    await expect(upload).rejects.toThrow(BadRequestException);
    await expect(upload).rejects.toThrow(
      'Poster file must be a JPEG, PNG, WebP, AVIF, or HEIC/HEIF image',
    );
    expect(bucketService.upload).not.toHaveBeenCalled();
  });

  it('should normalize the configured bucket prefix', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GigPosterService,
        { provide: BucketService, useValue: bucketService },
        { provide: RemoteImageService, useValue: remoteImageService },
        {
          provide: ConfigService,
          useValue: new ConfigService({ S3_POSTERS_PREFIX: '/posters/' }),
        },
      ],
    }).compile();
    const service = module.get(GigPosterService);

    await service.upload({
      file: {
        buffer: PNG_BUFFER,
        mimetype: 'image/png',
      },
      context: {
        date: '2026-09-17',
        country: 'ES',
        city: 'Barcelona',
        publicId: 'gc-1',
      },
    });

    expect(bucketService.upload).toHaveBeenCalledWith({
      buffer: PNG_BUFFER,
      mimetype: 'image/png',
      key: 'posters/2026/es/barcelona/gc-1',
    });
  });

  it('should reject an invalid configured bucket prefix', async () => {
    const module = Test.createTestingModule({
      providers: [
        GigPosterService,
        { provide: BucketService, useValue: bucketService },
        { provide: RemoteImageService, useValue: remoteImageService },
        {
          provide: ConfigService,
          useValue: new ConfigService({ S3_POSTERS_PREFIX: '../posters' }),
        },
      ],
    });

    await expect(module.compile()).rejects.toThrow(
      'S3_POSTERS_PREFIX is invalid.',
    );
  });

  it('should return downloaded poster bytes after uploading an external URL', async () => {
    remoteImageService.download.mockResolvedValue({
      buffer: PNG_BUFFER,
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
        buffer: PNG_BUFFER,
        mimetype: 'image/png',
        filename: 'poster.png',
      },
    });
    expect(bucketService.upload).toHaveBeenCalledWith({
      buffer: PNG_BUFFER,
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

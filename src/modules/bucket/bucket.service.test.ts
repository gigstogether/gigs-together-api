import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { BucketService } from './bucket.service';

describe('BucketService', () => {
  function createService(config: Record<string, unknown> = {}): BucketService {
    return new BucketService(new ConfigService(config));
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should build an encoded public file URL from configured base URL', () => {
    const service = createService({
      S3_PUBLIC_BASE_URL: 'cdn.example/posters',
    });

    expect(service.getPublicFileUrl('/gigs/a poster.jpg')).toBe(
      'https://cdn.example/posters/gigs/a%20poster.jpg',
    );
  });

  it('should return undefined when public base URL is not configured', () => {
    const service = createService();

    expect(service.getPublicFileUrl('/gigs/poster.jpg')).toBeUndefined();
  });

  it.each([
    {
      config: { S3_ACCESS_KEY_ID: 'access-key' },
      missingVariable: 'S3_SECRET_ACCESS_KEY',
    },
    {
      config: { S3_SECRET_ACCESS_KEY: 'secret-key' },
      missingVariable: 'S3_ACCESS_KEY_ID',
    },
  ])(
    'should reject credentials when $missingVariable is missing',
    ({ config }) => {
      expect(() => createService(config)).toThrow(
        'S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured together.',
      );
    },
  );

  it('should reject an invalid public base URL', () => {
    expect(() =>
      createService({ S3_PUBLIC_BASE_URL: 'https://[invalid' }),
    ).toThrow('S3_PUBLIC_BASE_URL must be a valid URL.');
  });

  it('should reject upload when bucket is not configured', async () => {
    const service = createService();
    const upload = service.upload({
      key: 'poster',
      buffer: Buffer.from('poster'),
    });

    await expect(upload).rejects.toThrow(BadRequestException);
    await expect(upload).rejects.toThrow('S3_BUCKET is not configured');
  });

  it('should upload an object to the configured bucket', async () => {
    const send = vi
      .spyOn(S3Client.prototype, 'send')
      .mockImplementation(() => undefined);
    const service = createService({ S3_BUCKET: ' posters ' });

    await expect(
      service.upload({
        key: 'gigs/poster',
        buffer: Buffer.from('poster'),
        mimetype: 'image/jpeg',
      }),
    ).resolves.toBe('/gigs/poster');
    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    if (!(command instanceof PutObjectCommand)) {
      throw new Error('Expected PutObjectCommand.');
    }
    expect(command.input).toEqual({
      Bucket: 'posters',
      Key: 'gigs/poster',
      Body: Buffer.from('poster'),
      ContentType: 'image/jpeg',
    });
  });
});

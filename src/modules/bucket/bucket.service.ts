import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { S3ClientConfig } from '@aws-sdk/client-s3';
import { getConfigBoolean, getConfigString } from '../../shared/utils/env';

export interface BucketUploadInput {
  key: string;
  buffer: Buffer;
  mimetype?: string;
}

@Injectable()
export class BucketService {
  private readonly s3: S3Client;
  private readonly bucket: string | undefined;
  private readonly publicBaseUrl: string | undefined;

  constructor(configService: ConfigService) {
    const accessKeyId = getConfigString(configService, 'S3_ACCESS_KEY_ID');
    const secretAccessKey = getConfigString(
      configService,
      'S3_SECRET_ACCESS_KEY',
    );
    if ((accessKeyId === undefined) !== (secretAccessKey === undefined)) {
      throw new Error(
        'S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured together.',
      );
    }

    const s3Config: S3ClientConfig = {
      // Cloudflare R2 uses region "auto" (AWS SDK still requires a value).
      region: getConfigString(configService, 'S3_REGION') ?? 'auto',
      forcePathStyle:
        getConfigBoolean(configService, 'S3_FORCE_PATH_STYLE') ?? false,
    };
    const endpoint = getConfigString(configService, 'S3_ENDPOINT');
    if (endpoint !== undefined) {
      s3Config.endpoint = endpoint;
    }
    if (accessKeyId !== undefined && secretAccessKey !== undefined) {
      s3Config.credentials = { accessKeyId, secretAccessKey };
    }

    this.s3 = new S3Client(s3Config);
    this.bucket = getConfigString(configService, 'S3_BUCKET');
    this.publicBaseUrl = this.normalizePublicBaseUrl(
      getConfigString(configService, 'S3_PUBLIC_BASE_URL'),
    );
  }

  async upload(input: BucketUploadInput): Promise<string> {
    if (this.bucket === undefined) {
      throw new BadRequestException('S3_BUCKET is not configured');
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      Body: input.buffer,
      ContentType: input.mimetype ?? 'application/octet-stream',
    });

    await this.s3.send(command);

    // Store only the bucket key path (relative), e.g. "/<prefix>/<uuid>-file.jpg".
    return `/${input.key}`;
  }

  private encodeS3KeyForPath(key: string): string {
    // Keep "/" separators but encode each segment.
    return key
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
  }

  getPublicFileUrl(bucketPath: string): string | undefined {
    const trimmed = bucketPath.trim();
    if (!trimmed) return undefined;

    const key = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
    if (this.publicBaseUrl === undefined) return undefined;
    const encoded = this.encodeS3KeyForPath(key);
    return new URL(
      encoded,
      `${this.publicBaseUrl.replace(/\/$/, '')}/`,
    ).toString();
  }

  private normalizePublicBaseUrl(
    value: string | undefined,
  ): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
      ? value
      : `https://${value}`;
    try {
      new URL(normalized);
    } catch {
      throw new Error('S3_PUBLIC_BASE_URL must be a valid URL.');
    }
    return normalized;
  }
}

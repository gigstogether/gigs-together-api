import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BucketService } from '../../bucket/bucket.service';
import { getConfigString } from '@shared/utils/env';
import {
  detectSupportedImageFileType,
  getSupportedImageExtension,
} from '@shared/utils/image-file';
import {
  InvalidRemoteImageUrlError,
  RemoteImageContentTypeError,
  RemoteImageService,
} from '../../remote-image/remote-image.service';
import type {
  GigPosterFile,
  PreparedGigPosterFile,
} from '../types/gig-poster.types';
import type { GigPoster } from '../types/gig.types';

interface UploadPosterPayload {
  url?: string;
  file?: GigPosterFile;
  context: {
    date: string | number | Date;
    country: string;
    city: string;
    publicId: string;
  };
}

export interface GigPosterUploadResult {
  storedPoster: GigPoster;
  posterFile: PreparedGigPosterFile;
}

const SVG_CONTENT_SNIFF_BYTES = 16 * 1024;
const SVG_POSTER_ERROR_MESSAGE =
  'SVG poster files are not supported; use a raster image instead';
const UNSUPPORTED_POSTER_ERROR_MESSAGE =
  'Poster file must be a JPEG, PNG, WebP, AVIF, or HEIC/HEIF image';

@Injectable()
export class GigPosterService {
  private readonly bucketPrefix: string;

  constructor(
    private readonly bucketService: BucketService,
    private readonly remoteImageService: RemoteImageService,
    configService: ConfigService,
  ) {
    this.bucketPrefix = this.parseBucketPrefix(
      getConfigString(configService, 'S3_POSTERS_PREFIX'),
    );
  }

  private async download(url: string): Promise<PreparedGigPosterFile> {
    let buffer: Buffer;
    try {
      const remoteImage = await this.remoteImageService.download(url);
      buffer = remoteImage.buffer;
    } catch (e) {
      if (e instanceof InvalidRemoteImageUrlError) {
        throw new BadRequestException('posterUrl must be a valid URL');
      }
      if (e instanceof RemoteImageContentTypeError) {
        throw new BadRequestException(
          `Failed to download poster: posterUrl must point to an image (content-type: "${e.contentType}")`,
        );
      }
      // Keep message user-friendly; don't leak internals.
      const msg = e instanceof Error ? e.message : 'unknown error';
      throw new BadRequestException(`Failed to download poster: ${msg}`);
    }

    return this.preparePosterFile({ buffer });
  }

  private parseBucketPrefix(value: string | undefined): string {
    if (value === undefined) {
      return 'gigs';
    }

    // Normalize: remove leading/trailing slashes so callers can safely do `${prefix}/...`.
    const normalized = value.replace(/^\/+/, '').replace(/\/+$/, '');
    // Hardening: prevent traversal-like or Windows-style path values.
    if (
      normalized === '' ||
      normalized.includes('..') ||
      normalized.includes('\\')
    ) {
      throw new Error('S3_POSTERS_PREFIX is invalid.');
    }
    return normalized;
  }

  private getUtcYear(date: string | number | Date | undefined): number {
    if (!date) return new Date().getUTCFullYear();
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getUTCFullYear();
    return Number.isFinite(year) ? year : new Date().getUTCFullYear();
  }

  private async uploadToBucket(
    input: PreparedGigPosterFile,
    context: UploadPosterPayload['context'],
  ): Promise<string> {
    const { buffer, mimetype } = input;
    const year = this.getUtcYear(context.date);
    // TODO
    const TEMP_BARCELONA = 'barcelona';
    const city =
      context.city.toLowerCase() === TEMP_BARCELONA
        ? TEMP_BARCELONA
        : 'unknown';
    // Last segment is publicId only (no file extension); Content-Type is set on upload.
    const key = [
      this.bucketPrefix,
      year,
      context.country.toLowerCase(),
      city,
      context.publicId,
    ].join('/');
    return this.bucketService.upload({
      buffer,
      mimetype,
      key,
    });
  }

  private assertGigPosterFileIsNotSvg(file: GigPosterFile): void {
    const fileStart = file.buffer
      .subarray(0, SVG_CONTENT_SNIFF_BYTES)
      .toString('utf8')
      .replace(/^\uFEFF/, '')
      .trimStart();
    const hasSvgMarkup =
      fileStart.startsWith('<') && /<svg(?:\s|>)/i.test(fileStart);

    if (hasSvgMarkup) {
      throw new BadRequestException(SVG_POSTER_ERROR_MESSAGE);
    }
  }

  private preparePosterFile(file: GigPosterFile): PreparedGigPosterFile {
    this.assertGigPosterFileIsNotSvg(file);

    const fileType = detectSupportedImageFileType(file.buffer);
    if (fileType === undefined) {
      throw new BadRequestException(UNSUPPORTED_POSTER_ERROR_MESSAGE);
    }

    return {
      buffer: file.buffer,
      filename: `poster.${getSupportedImageExtension(fileType.contentType)}`,
      mimetype: fileType.contentType,
    };
  }

  async upload(
    payload: UploadPosterPayload,
  ): Promise<GigPosterUploadResult | undefined> {
    const { url, file, context } = payload;

    if (file) {
      const preparedFile = this.preparePosterFile(file);
      const bucketPath = await this.uploadToBucket(preparedFile, context);

      return {
        storedPoster: { bucketPath },
        posterFile: preparedFile,
      };
    }

    if (!url) return;

    const downloaded = await this.download(url);
    const bucketPath = await this.uploadToBucket(downloaded, context);

    return {
      storedPoster: {
        bucketPath,
        externalUrl: url,
      },
      posterFile: downloaded,
    };
  }
}

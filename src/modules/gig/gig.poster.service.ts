import { BadRequestException, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { BucketService } from '../bucket/bucket.service';
import { HttpService } from '@nestjs/axios';
import type { GigPosterFile } from './types/gig-poster.types';
import type { GigPoster } from './types/gig.types';

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

const SVG_IMAGE_MIME_TYPE = 'image/svg+xml';
const SVG_CONTENT_SNIFF_BYTES = 16 * 1024;
const SVG_POSTER_ERROR_MESSAGE =
  'SVG poster files are not supported; use a raster image instead';

@Injectable()
export class GigPosterService {
  constructor(
    private readonly bucketService: BucketService,
    private readonly httpService: HttpService,
  ) {}

  private async download(url: string): Promise<GigPosterFile> {
    try {
      new URL(url);
    } catch {
      throw new BadRequestException('posterUrl must be a valid URL');
    }

    try {
      const res = await firstValueFrom(
        this.httpService.get<ArrayBuffer>(url, {
          responseType: 'arraybuffer',
          timeout: 15_000,
        }),
      );
      const raw = res.headers['content-type'] ?? res.headers['Content-Type'];
      const ct =
        typeof raw === 'string'
          ? raw
          : Array.isArray(raw) && typeof raw[0] === 'string'
            ? raw[0]
            : undefined;

      if (ct && !ct.toLowerCase().startsWith('image/')) {
        throw new BadRequestException(
          `posterUrl must point to an image (content-type: "${ct}")`,
        );
      }

      return {
        buffer: Buffer.from(res.data),
        mimetype: ct,
      };
    } catch (e) {
      // Keep message user-friendly; don't leak internals.
      const msg = String(e?.message ?? 'unknown error');
      throw new BadRequestException(`Failed to download poster: ${msg}`);
    }
  }

  private getBucketPrefix(): string {
    const raw = (process.env.S3_POSTERS_PREFIX ?? 'gigs').trim();
    // Normalize: remove leading/trailing slashes so callers can safely do `${prefix}/...`.
    const normalized = raw.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!normalized) return 'gigs';
    // Hardening: prevent weird traversal-ish values.
    if (normalized.includes('..') || normalized.includes('\\')) return 'gigs';
    return normalized;
  }

  private getUtcYear(date: string | number | Date | undefined): number {
    if (!date) return new Date().getUTCFullYear();
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getUTCFullYear();
    return Number.isFinite(year) ? year : new Date().getUTCFullYear();
  }

  private async uploadToBucket(
    input: GigPosterFile,
    context: UploadPosterPayload['context'],
  ): Promise<string> {
    this.assertGigPosterFileIsNotSvg(input);

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
      this.getBucketPrefix(),
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
    const normalizedMimeType = file.mimetype
      ?.split(';', 1)[0]
      .trim()
      .toLowerCase();
    const fileStart = file.buffer
      .subarray(0, SVG_CONTENT_SNIFF_BYTES)
      .toString('utf8')
      .replace(/^\uFEFF/, '')
      .trimStart();
    const hasSvgMarkup =
      fileStart.startsWith('<') && /<svg(?:\s|>)/i.test(fileStart);

    if (normalizedMimeType === SVG_IMAGE_MIME_TYPE || hasSvgMarkup) {
      throw new BadRequestException(SVG_POSTER_ERROR_MESSAGE);
    }
  }

  async upload(payload: UploadPosterPayload): Promise<GigPoster | undefined> {
    const { url, file, context } = payload;

    if (file) {
      const bucketPath = await this.uploadToBucket(
        {
          buffer: file.buffer,
          mimetype: file.mimetype,
        },
        context,
      );

      return { bucketPath };
    }

    if (!url) return;

    const downloaded = await this.download(url);
    return {
      bucketPath: await this.uploadToBucket(downloaded, context),
      externalUrl: url,
    };
  }
}

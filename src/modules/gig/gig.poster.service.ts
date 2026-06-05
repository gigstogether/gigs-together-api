import { BadRequestException, Injectable } from '@nestjs/common';
import { Gig, GigPoster } from './gig.schema';
import { firstValueFrom } from 'rxjs';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BucketService } from '../bucket/bucket.service';
import { HttpService } from '@nestjs/axios';

interface PosterFile {
  buffer: Buffer;
  mimetype?: string;
}

interface UploadPosterPayload {
  url?: string;
  file?: Express.Multer.File;
  context: {
    date: string | number | Date;
    country: string;
    city: string;
    publicId: string;
  };
}

@Injectable()
export class GigPosterService {
  constructor(
    @InjectModel(Gig.name) private gigModel: Model<Gig>,
    private readonly bucketService: BucketService,
    private readonly httpService: HttpService,
  ) {}

  private async download(url: string): Promise<PosterFile> {
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
    input: PosterFile,
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

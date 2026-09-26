import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS = 15_000; // 15 seconds
const REMOTE_IMAGE_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface DownloadedRemoteImage {
  buffer: Buffer;
  contentType?: string;
}

export class InvalidRemoteImageUrlError extends Error {
  constructor() {
    super('Remote image URL must be a valid HTTP or HTTPS URL');
    this.name = InvalidRemoteImageUrlError.name;
  }
}

export class RemoteImageContentTypeError extends Error {
  constructor(public contentType: string) {
    super(`Remote resource is not an image (content-type: "${contentType}")`);
    this.name = RemoteImageContentTypeError.name;
  }
}

@Injectable()
export class RemoteImageService {
  constructor(private readonly httpService: HttpService) {}

  async download(url: string): Promise<DownloadedRemoteImage> {
    this.assertHttpUrl(url);

    const response = await firstValueFrom(
      this.httpService.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS,
        maxContentLength: REMOTE_IMAGE_MAX_SIZE_BYTES,
      }),
    );
    const contentType = this.getContentType(response.headers);
    // If it is clearly not an image, do not pass its bytes to image consumers.
    if (
      contentType !== undefined &&
      !contentType.toLowerCase().startsWith('image/')
    ) {
      throw new RemoteImageContentTypeError(contentType);
    }

    const result: DownloadedRemoteImage = {
      buffer: Buffer.from(response.data),
    };
    if (contentType !== undefined) {
      result.contentType = contentType;
    }
    return result;
  }

  private assertHttpUrl(url: string): void {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        return;
      }
    } catch {
      // The caller owns the public error contract for invalid remote image URLs.
    }
    throw new InvalidRemoteImageUrlError();
  }

  private getContentType(headers: Record<string, unknown>): string | undefined {
    const rawContentType = headers['content-type'] ?? headers['Content-Type'];
    if (typeof rawContentType === 'string') {
      return rawContentType;
    }
    if (
      Array.isArray(rawContentType) &&
      typeof rawContentType[0] === 'string'
    ) {
      return rawContentType[0];
    }
    return;
  }
}

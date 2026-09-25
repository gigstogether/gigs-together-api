import { HttpService } from '@nestjs/axios';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

import {
  InvalidRemoteImageUrlError,
  RemoteImageContentTypeError,
  RemoteImageService,
} from './remote-image.service';

describe('RemoteImageService', () => {
  let remoteImageService: RemoteImageService;

  const httpGet = vi.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemoteImageService,
        { provide: HttpService, useValue: { get: httpGet } },
      ],
    }).compile();

    remoteImageService = module.get(RemoteImageService);
  });

  afterEach(() => {
    httpGet.mockReset();
  });

  it('should download an image with shared safety limits', async () => {
    const imageBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]).buffer;
    httpGet.mockReturnValue(
      of({
        data: imageBytes,
        headers: { 'content-type': 'image/png' },
      }),
    );

    await expect(
      remoteImageService.download('https://images.example/poster'),
    ).resolves.toEqual({
      buffer: Buffer.from(imageBytes),
      contentType: 'image/png',
    });
    expect(httpGet).toHaveBeenCalledWith('https://images.example/poster', {
      responseType: 'arraybuffer',
      timeout: 15_000,
      maxContentLength: 10 * 1024 * 1024,
    });
  });

  it('should reject a URL without an HTTP protocol', async () => {
    await expect(
      remoteImageService.download('file:///tmp/poster.jpg'),
    ).rejects.toBeInstanceOf(InvalidRemoteImageUrlError);
    expect(httpGet).not.toHaveBeenCalled();
  });

  it('should reject a response with a non-image content type', async () => {
    httpGet.mockReturnValue(
      of({
        data: new TextEncoder().encode('<html></html>').buffer,
        headers: { 'content-type': 'text/html' },
      }),
    );

    await expect(
      remoteImageService.download('https://images.example/poster'),
    ).rejects.toBeInstanceOf(RemoteImageContentTypeError);
  });

  it('should propagate a remote request failure to the caller', async () => {
    const requestError = new Error('Remote request failed');
    httpGet.mockReturnValue(throwError(() => requestError));

    await expect(
      remoteImageService.download('https://images.example/poster'),
    ).rejects.toBe(requestError);
  });
});

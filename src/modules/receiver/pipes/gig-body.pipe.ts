import type { PipeTransform } from '@nestjs/common';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { V1ReceiverCreateGigRequestBodyGig } from '../types/requests/v1-receiver-create-gig-request';

type AnyBodyWithGig = Record<string, unknown> & { gig?: unknown };

/**
 * Normalizes `body.gig` so that downstream handlers always receive an object.
 *
 * Needed because in multipart/form-data, nested objects are sent as strings.
 */
@Injectable()
export class GigBodyPipe implements PipeTransform<
  AnyBodyWithGig,
  AnyBodyWithGig & { gig: V1ReceiverCreateGigRequestBodyGig }
> {
  private parseGig(value: unknown): V1ReceiverCreateGigRequestBodyGig {
    // When using multipart/form-data (e.g. uploading a file), non-file fields
    // are strings. Nested objects must be provided as JSON strings by the client.
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        throw new BadRequestException('gig must be a JSON object');
      }
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new BadRequestException('gig must be a JSON object');
        }
        return parsed as V1ReceiverCreateGigRequestBodyGig;
      } catch {
        throw new BadRequestException('gig must be a valid JSON object');
      }
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('gig must be an object');
    }

    return value as V1ReceiverCreateGigRequestBodyGig;
  }

  transform(
    bodyRaw: AnyBodyWithGig,
  ): AnyBodyWithGig & { gig: V1ReceiverCreateGigRequestBodyGig } {
    const body =
      bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
        ? bodyRaw
        : null;
    if (!body) {
      throw new BadRequestException('Body must be an object');
    }

    const bodyWithGig = {
      ...body,
      gig: this.parseGig(body.gig),
    };

    if (body.expectedVersion === undefined) {
      return bodyWithGig;
    }

    const expectedVersion =
      typeof body.expectedVersion === 'string' &&
      body.expectedVersion.trim() !== ''
        ? Number(body.expectedVersion)
        : body.expectedVersion;
    if (
      typeof expectedVersion !== 'number' ||
      !Number.isInteger(expectedVersion) ||
      expectedVersion < 0
    ) {
      throw new BadRequestException(
        'expectedVersion must be a non-negative integer',
      );
    }

    return { ...bodyWithGig, expectedVersion };
  }
}

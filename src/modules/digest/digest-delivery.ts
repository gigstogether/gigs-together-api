import type { PlainGig } from '@modules/gig/types/gig.types';

export const DIGEST_DELIVERY = Symbol('DIGEST_DELIVERY');

export type DigestDeliveryProvider = 'telegram';

export interface DigestDeliveryResult {
  postUrl: string;
}

export interface DigestDelivery {
  sendWeeklyDigest(gigs: PlainGig[]): Promise<DigestDeliveryResult | undefined>;
}

export interface DigestDeliveryErrorParams {
  message: string;
  cause: unknown;
  provider: DigestDeliveryProvider;
  providerOperation: string;
  status?: number;
  code?: string | number;
  providerErrorCode?: string | number;
  providerDescription?: string;
  providerFailureCode?: string;
  failedItemPosition?: number;
  gigPublicId?: string;
  mediaUrl?: string;
}

/**
 * Provider-neutral delivery failure exposed to the digest application layer.
 */
export class DigestDeliveryError extends Error {
  cause: unknown;
  provider: DigestDeliveryProvider;
  providerOperation: string;
  status?: number;
  code?: string | number;
  providerErrorCode?: string | number;
  providerDescription?: string;
  providerFailureCode?: string;
  failedItemPosition?: number;
  gigPublicId?: string;
  mediaUrl?: string;

  constructor(params: DigestDeliveryErrorParams) {
    super(params.message);
    this.name = DigestDeliveryError.name;
    // Keep cause non-enumerable to prevent upstream details from leaking through serialization.
    Object.defineProperty(this, 'cause', {
      value: params.cause,
      configurable: true,
      enumerable: false,
      writable: true,
    });
    this.provider = params.provider;
    this.providerOperation = params.providerOperation;
    if (params.status !== undefined) {
      this.status = params.status;
    }
    if (params.code !== undefined) {
      this.code = params.code;
    }
    if (params.providerErrorCode !== undefined) {
      this.providerErrorCode = params.providerErrorCode;
    }
    if (params.providerDescription !== undefined) {
      this.providerDescription = params.providerDescription;
    }
    if (params.providerFailureCode !== undefined) {
      this.providerFailureCode = params.providerFailureCode;
    }
    if (params.failedItemPosition !== undefined) {
      this.failedItemPosition = params.failedItemPosition;
    }
    if (params.gigPublicId !== undefined) {
      this.gigPublicId = params.gigPublicId;
    }
    if (params.mediaUrl !== undefined) {
      this.mediaUrl = params.mediaUrl;
    }
  }
}

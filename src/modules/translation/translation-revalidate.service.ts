import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConfigString } from '../../shared/utils/env';
import { TranslationCacheService } from './translation-cache.service';

export interface RevalidateTranslationAfterWriteParams {
  readonly namespace: string;
}

interface PostFrontTranslationsRevalidateRequestParams {
  readonly url: string;
  readonly namespace: string;
}

@Injectable()
export class TranslationRevalidateService {
  private readonly logger = new Logger(TranslationRevalidateService.name);
  private readonly appBaseUrl: string | undefined;
  private readonly revalidationSecret: string | undefined;

  constructor(
    private readonly translationCacheService: TranslationCacheService,
    configService: ConfigService,
  ) {
    this.appBaseUrl = getConfigString(configService, 'APP_BASE_URL');
    this.revalidationSecret = getConfigString(
      configService,
      'TRANSLATIONS_REVALIDATE_SECRET',
    );
  }

  async revalidateAfterWrite(
    params: RevalidateTranslationAfterWriteParams,
  ): Promise<void> {
    await this.translationCacheService.revalidateNamespace({
      namespace: params.namespace,
    });

    await this.revalidateFrontCache(params.namespace);
  }

  async revalidateAll(): Promise<void> {
    await this.translationCacheService.revalidateAll();

    const namespaces = this.translationCacheService.listNamespaces();
    await Promise.all(
      namespaces.map((namespace) => this.revalidateFrontCache(namespace)),
    );
  }

  private revalidateFrontCache(namespace: string): Promise<void> {
    if (
      this.appBaseUrl === undefined ||
      this.revalidationSecret === undefined
    ) {
      return Promise.resolve();
    }

    if (!/^https?:\/\//i.test(this.appBaseUrl)) {
      this.logger.warn(
        `APP_BASE_URL must be an absolute http(s) URL for translation revalidation (got "${this.appBaseUrl}")`,
      );
      return Promise.resolve();
    }

    const url = new URL(
      '/api/revalidate/translations',
      this.appBaseUrl,
    ).toString();

    return this.postFrontTranslationsRevalidateRequest({
      url,
      namespace,
    });
  }

  private async postFrontTranslationsRevalidateRequest(
    params: PostFrontTranslationsRevalidateRequestParams,
  ): Promise<void> {
    if (!this.revalidationSecret) {
      this.logger.warn('TRANSLATIONS_REVALIDATE_SECRET is not set');
      return;
    }
    const { url, namespace } = params;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-translations-revalidate-secret': this.revalidationSecret,
        },
        body: JSON.stringify({ namespace }),
      });

      if (!res.ok) {
        let text = '';
        try {
          text = await res.text();
        } catch (e) {
          this.logger.warn(
            `Failed to read front translation revalidation error response: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        this.logger.warn(
          `Front translation cache revalidate failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`,
        );
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn(
        `Front translation cache revalidate request failed: ${message}`,
      );
    }
  }
}

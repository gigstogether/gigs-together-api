import { Injectable, Logger } from '@nestjs/common';
import { TranslationCacheService } from './translation-cache.service';

export interface RevalidateTranslationAfterWriteParams {
  readonly namespace: string;
}

interface PostFrontTranslationsRevalidateRequestParams {
  readonly url: string;
  readonly secret: string;
  readonly namespace: string;
}

@Injectable()
export class TranslationRevalidateService {
  private readonly logger = new Logger(TranslationRevalidateService.name);

  constructor(
    private readonly translationCacheService: TranslationCacheService,
  ) {}

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
    const baseUrl = (process.env.APP_BASE_URL ?? '').trim();
    const secret = (process.env.TRANSLATIONS_REVALIDATE_SECRET ?? '').trim();
    if (!baseUrl || !secret) {
      return Promise.resolve();
    }

    if (!/^https?:\/\//i.test(baseUrl)) {
      this.logger.warn(
        `APP_BASE_URL must be an absolute http(s) URL for translation revalidation (got "${baseUrl}")`,
      );
      return Promise.resolve();
    }

    const url = new URL('/api/revalidate/translations', baseUrl).toString();

    return this.postFrontTranslationsRevalidateRequest({
      url,
      secret,
      namespace,
    });
  }

  private async postFrontTranslationsRevalidateRequest(
    params: PostFrontTranslationsRevalidateRequestParams,
  ): Promise<void> {
    const { url, secret, namespace } = params;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-translations-revalidate-secret': secret,
        },
        body: JSON.stringify({ namespace }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(
          `Front translation cache revalidate failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Front translation cache revalidate request failed: ${message}`,
      );
    }
  }
}

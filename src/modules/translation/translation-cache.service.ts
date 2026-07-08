import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { Model } from 'mongoose';
import { Locale, LocaleDocument } from '../locale/locale.schema';
import {
  buildNamespaceLocaleRegistry,
  buildTranslationCacheIndex,
  TRANSLATION_CACHE_DEFAULT_LOCALE,
} from './translation-bundle.parser';
import { isValidTranslationNamespace } from './translation-identifiers';
import { TRANSLATION_REPOSITORY } from './repositories/translation.repository';
import type { TranslationRepository } from './repositories/translation.repository';
import type {
  GetNamespaceEntriesParams,
  GetTranslationCacheEntryParams,
  LocaleKeyRegistry,
  NamespaceLocaleRegistry,
  RevalidateTranslationNamespaceParams,
  TranslationCacheIndex,
} from './types/translation-cache.types';
import { TRANSLATION_CACHE_DEFAULT_TTL_MS } from './types/translation-cache.types';
import type { TranslationBundleEntry } from './types/translation.types';

@Injectable()
export class TranslationCacheService implements OnModuleInit, OnModuleDestroy {
  private static readonly TTL_INTERVAL_NAME = 'translation-cache-ttl';

  private readonly logger = new Logger(TranslationCacheService.name);

  private cache: TranslationCacheIndex = new Map();
  private activeLocales: ReadonlySet<string> = new Set([
    TRANSLATION_CACHE_DEFAULT_LOCALE,
  ]);
  private reloadInFlight: Promise<void> | undefined;
  private readonly cacheTtlMs: number;

  constructor(
    @Inject(TRANSLATION_REPOSITORY)
    private readonly translationRepository: TranslationRepository,
    @InjectModel(Locale.name)
    private readonly localeModel: Model<LocaleDocument>,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {
    const raw = this.configService.get<string>('TRANSLATION_CACHE_TTL_MS');
    const parsed = raw?.trim() ? Number.parseInt(raw.trim(), 10) : Number.NaN;
    // Default 3_600_000 ms (1 hour). Override TRANSLATION_CACHE_TTL_MS for shorter windows in dev.
    this.cacheTtlMs =
      Number.isFinite(parsed) && parsed > 0
        ? parsed
        : TRANSLATION_CACHE_DEFAULT_TTL_MS;
  }

  async onModuleInit(): Promise<void> {
    await this.executeReload(() => this.performFullReload());

    const interval = setInterval(() => {
      void this.executeReload(() => this.performFullReload());
    }, this.cacheTtlMs);

    this.schedulerRegistry.addInterval(
      TranslationCacheService.TTL_INTERVAL_NAME,
      interval,
    );
  }

  onModuleDestroy(): void {
    this.schedulerRegistry.deleteInterval(
      TranslationCacheService.TTL_INTERVAL_NAME,
    );
  }

  getNamespaceEntries(
    params: GetNamespaceEntriesParams & { readonly locale: string },
  ): LocaleKeyRegistry;
  getNamespaceEntries(
    params: GetNamespaceEntriesParams & { readonly locale?: undefined },
  ): NamespaceLocaleRegistry;
  getNamespaceEntries(
    params: GetNamespaceEntriesParams,
  ): NamespaceLocaleRegistry | LocaleKeyRegistry {
    const namespace = params.namespace.trim();
    const namespaceRegistry = this.cache.get(namespace);
    if (namespaceRegistry === undefined) {
      return new Map();
    }

    if (params.locale === undefined) {
      return namespaceRegistry;
    }

    const normalizedLocale = params.locale.trim().toLowerCase();
    const localeRegistry = namespaceRegistry.get(normalizedLocale);
    return localeRegistry ?? new Map();
  }

  getEntry(params: GetTranslationCacheEntryParams): TranslationBundleEntry {
    const namespace = params.namespace.trim();
    const normalizedLocale = params.locale.trim().toLowerCase();
    const entry = this.cache
      .get(namespace)
      ?.get(normalizedLocale)
      ?.get(params.key);

    if (entry === undefined) {
      throw new InternalServerErrorException(
        `Translation "${params.key}" is missing for namespace "${namespace}" and locale "${normalizedLocale}".`,
      );
    }

    return entry;
  }

  resolveLocale(acceptLanguageRaw?: string): string {
    const requested =
      TranslationCacheService.normalizeAcceptLanguage(acceptLanguageRaw);
    if (!requested) {
      return TRANSLATION_CACHE_DEFAULT_LOCALE;
    }

    return this.activeLocales.has(requested)
      ? requested
      : TRANSLATION_CACHE_DEFAULT_LOCALE;
  }

  listNamespaces(): readonly string[] {
    return [...this.cache.keys()].sort();
  }

  async revalidateNamespace(
    params: RevalidateTranslationNamespaceParams,
  ): Promise<void> {
    const namespace = params.namespace.trim();
    if (!isValidTranslationNamespace(namespace)) {
      throw new BadRequestException(
        `Invalid translation namespace "${namespace}".`,
      );
    }

    await this.executeReload(() => this.performNamespaceReload(namespace));
  }

  private static normalizeAcceptLanguage(value?: string): string | undefined {
    if (!value) return undefined;
    const first = value.split(',')[0]?.trim();
    if (!first || first === '*') return undefined;
    const withoutQ = first.split(';')[0]?.trim();
    const primary = withoutQ.split('-')[0]?.trim().toLowerCase();
    if (!primary) return undefined;
    return primary;
  }

  private async executeReload(operation: () => Promise<void>): Promise<void> {
    while (this.reloadInFlight !== undefined) {
      await this.reloadInFlight;
    }

    let resolve!: () => void;
    this.reloadInFlight = new Promise<void>((resolvePromise) => {
      resolve = resolvePromise;
    });

    try {
      await operation();
    } finally {
      resolve();
      this.reloadInFlight = undefined;
    }
  }

  private async performFullReload(): Promise<void> {
    try {
      const [records, activeLocales] = await Promise.all([
        this.translationRepository.findAllActiveRecords(),
        this.loadActiveLocales(),
      ]);

      this.cache = buildTranslationCacheIndex(records, this.logger);
      this.activeLocales = activeLocales;
      this.logger.log(
        `Translation cache refreshed: ${records.length} record(s), ${this.cache.size} namespace(s), ${activeLocales.size} active locale(s).`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Translation cache full reload failed; keeping stale cache. ${message}`,
      );
    }
  }

  private async performNamespaceReload(namespace: string): Promise<void> {
    try {
      const records = await this.translationRepository.findActiveByNamespace({
        namespace,
      });
      const namespaceRegistry = buildNamespaceLocaleRegistry(
        records,
        namespace,
        this.logger,
      );

      const nextCache = new Map(this.cache);
      nextCache.set(namespace, namespaceRegistry);
      this.cache = nextCache;

      this.logger.log(
        `Translation cache revalidated for namespace "${namespace}" (${records.length} record(s)).`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Translation cache namespace reload failed for "${namespace}"; keeping stale slice. ${message}`,
      );
    }
  }

  private async loadActiveLocales(): Promise<ReadonlySet<string>> {
    const locales = await this.localeModel
      .find({ isActive: true }, { _id: 0, iso: 1 })
      .lean<Array<{ readonly iso: string }>>()
      .exec();

    const normalized = locales
      .map((locale) => locale.iso.trim().toLowerCase())
      .filter((iso) => iso.length > 0);

    if (normalized.length === 0) {
      return new Set([TRANSLATION_CACHE_DEFAULT_LOCALE]);
    }

    return new Set(normalized);
  }
}

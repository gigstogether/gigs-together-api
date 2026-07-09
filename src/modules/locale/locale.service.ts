import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type {
  SupportedLocale,
  UpdateLocaleByIsoParams,
  UpdateLocalesOrderParams,
} from './types/locale.types';
import {
  LOCALE_ACTIVE_CACHE_DEFAULT_TTL_MS,
  LOCALE_DEFAULT_ISO,
} from './locale-cache.constants';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { LOCALE_REPOSITORY } from './repositories/locale.repository';
import type { LocaleRepository } from './repositories/locale.repository';

@Injectable()
export class LocaleService implements OnModuleInit, OnModuleDestroy {
  private static readonly ACTIVE_LOCALES_TTL_INTERVAL_NAME =
    'locale-active-cache-ttl';

  private readonly logger = new Logger(LocaleService.name);

  private activeLocales: readonly SupportedLocale[] = [
    {
      iso: LOCALE_DEFAULT_ISO,
      nativeName: 'English',
      isActive: true,
      order: 0,
    },
  ];
  private readonly cacheTtlMs: number;

  constructor(
    @Inject(LOCALE_REPOSITORY)
    private readonly localeRepository: LocaleRepository,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {
    const raw = this.configService.get<string>('LOCALE_ACTIVE_CACHE_TTL_MS');
    const parsed = raw?.trim() ? Number.parseInt(raw.trim(), 10) : Number.NaN;
    // Default 3_600_000 ms (1 hour). Override LOCALE_ACTIVE_CACHE_TTL_MS for shorter windows in dev.
    this.cacheTtlMs =
      Number.isFinite(parsed) && parsed > 0
        ? parsed
        : LOCALE_ACTIVE_CACHE_DEFAULT_TTL_MS;
  }

  async onModuleInit(): Promise<void> {
    await this.refreshActiveLocaleCacheFromMongo();

    const interval = setInterval(() => {
      void this.performScheduledActiveLocaleRefresh();
    }, this.cacheTtlMs);

    this.schedulerRegistry.addInterval(
      LocaleService.ACTIVE_LOCALES_TTL_INTERVAL_NAME,
      interval,
    );
  }

  onModuleDestroy(): void {
    this.schedulerRegistry.deleteInterval(
      LocaleService.ACTIVE_LOCALES_TTL_INTERVAL_NAME,
    );
  }

  getActiveLocaleIsos(): readonly string[] {
    if (this.activeLocales.length === 0) {
      return [LOCALE_DEFAULT_ISO];
    }

    return this.activeLocales.map((locale) => locale.iso);
  }

  resolveLocale(acceptLanguageRaw?: string): string {
    const requested = LocaleService.normalizeAcceptLanguage(acceptLanguageRaw);
    if (!requested) {
      return LOCALE_DEFAULT_ISO;
    }

    return this.getActiveLocaleIsos().includes(requested)
      ? requested
      : LOCALE_DEFAULT_ISO;
  }

  getLocalesV1(): readonly SupportedLocale[] {
    return this.activeLocales;
  }

  /**
   * Forces a DB reload of active locales (used by writes, TTL refresh, and POST /v1/internal/locales/revalidate).
   */
  revalidateActiveLocalesCache(): Promise<void> {
    return this.refreshActiveLocaleCacheFromMongo();
  }

  getAllLocalesOrdered(): Promise<readonly SupportedLocale[]> {
    return this.localeRepository.findAllLocalesOrdered();
  }

  async updateLocaleByIso(
    params: UpdateLocaleByIsoParams,
  ): Promise<SupportedLocale> {
    const iso = LocaleService.normalizeLocaleIsoParam(params.iso);
    const update: {
      nativeName?: string;
      isActive?: boolean;
      order?: number;
    } = {};

    if (params.nativeName !== undefined) {
      const trimmedNativeName = params.nativeName.trim();
      if (!trimmedNativeName) {
        throw new BadRequestException('nativeName must not be empty');
      }
      update.nativeName = trimmedNativeName;
    }

    if (params.isActive !== undefined) {
      update.isActive = params.isActive;
    }

    if (params.order !== undefined) {
      if (!Number.isInteger(params.order) || params.order < 0) {
        throw new BadRequestException('order must be a non-negative integer');
      }
      update.order = params.order;
    }

    if (Object.keys(update).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    if (params.isActive === false) {
      const otherActiveCount =
        await this.localeRepository.countOtherActiveLocales(iso);
      if (otherActiveCount === 0) {
        throw new BadRequestException(
          'Cannot deactivate the last active locale',
        );
      }
    }

    const updated = await this.localeRepository.updateLocaleByIso(iso, update);

    if (!updated) {
      throw new NotFoundException(`Locale "${iso}" not found`);
    }

    await this.revalidateActiveLocalesCache();

    return updated;
  }

  async updateLocalesOrder(
    params: UpdateLocalesOrderParams,
  ): Promise<readonly SupportedLocale[]> {
    const updates = params.locales;

    if (updates.length < 2) {
      throw new BadRequestException('At least two locales must be updated');
    }

    const normalizedUpdates = updates.map((update) => {
      const order = update.order;
      if (!Number.isInteger(order) || order < 0) {
        throw new BadRequestException('order must be a non-negative integer');
      }
      return {
        iso: LocaleService.normalizeLocaleIsoParam(update.iso),
        order,
      };
    });

    const isos = normalizedUpdates.map((update) => update.iso);
    if (new Set(isos).size !== isos.length) {
      throw new BadRequestException('Duplicate iso values in request');
    }

    const orders = normalizedUpdates.map((update) => update.order);
    if (new Set(orders).size !== orders.length) {
      throw new BadRequestException('Duplicate order values in request');
    }

    const existingIsos = await this.localeRepository.findIsosByIsoList(isos);

    if (existingIsos.length !== isos.length) {
      const existingIsoSet = new Set(existingIsos);
      const missingIsos = isos.filter((iso) => !existingIsoSet.has(iso));
      throw new NotFoundException(
        `Locale(s) not found: ${missingIsos.join(', ')}`,
      );
    }

    await this.localeRepository.bulkOrderUpdate(normalizedUpdates);

    await this.revalidateActiveLocalesCache();

    return this.getAllLocalesOrdered();
  }

  private static normalizeLocaleIsoParam(isoRaw: string): string {
    const iso = isoRaw.trim().toLowerCase();
    if (!/^[a-z]{2}(?:-[a-z]{2})?$/.test(iso)) {
      throw new BadRequestException('iso has invalid format');
    }
    return iso;
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

  private async performScheduledActiveLocaleRefresh(): Promise<void> {
    try {
      await this.refreshActiveLocaleCacheFromMongo();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Active locales cache refresh failed; keeping stale set. ${message}`,
      );
    }
  }

  private async refreshActiveLocaleCacheFromMongo(): Promise<void> {
    this.activeLocales = await this.localeRepository.findActiveLocalesOrdered();

    this.logger.log(
      `Active locales cache refreshed: ${this.activeLocales.length} active locale(s).`,
    );
  }
}

import { HttpService } from '@nestjs/axios';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { load } from 'cheerio';
import { firstValueFrom } from 'rxjs';

const COUNTRY_REFERENCE_URL =
  'https://unstats.un.org/unsd/methodology/m49/overview';
const COUNTRY_REFERENCE_TABLE_SELECTOR = '#downloadTableEN';
const COUNTRY_ISO_HEADER = 'ISO-alpha2 Code';
const COUNTRY_REFERENCE_CACHE_TTL_MS = 60 * 60 * 1_000; // 1 hour.
const COUNTRY_REFERENCE_REQUEST_TIMEOUT_MS = 10_000; // 10 seconds.
const MIN_EXPECTED_COUNTRY_COUNT = 200;
const COUNTRY_ISO_PATTERN = /^[A-Z]{2}$/;

export interface CountryReference {
  iso: string;
}

interface CountryReferenceCache {
  countries: CountryReference[];
  countryIsos: Set<string>;
  expiresAt: number;
}

@Injectable()
export class CountryReferenceService {
  private cache?: CountryReferenceCache;
  private cacheLoad?: Promise<CountryReferenceCache>;

  constructor(private readonly httpService: HttpService) {}

  async getCountries(): Promise<CountryReference[]> {
    const cache = await this.getCache();

    return cache.countries.map((country) => ({ ...country }));
  }

  async hasCountry(iso: string): Promise<boolean> {
    const cache = await this.getCache();

    return cache.countryIsos.has(iso);
  }

  private getCache(): Promise<CountryReferenceCache> {
    if (this.cache !== undefined && this.cache.expiresAt > Date.now()) {
      return Promise.resolve(this.cache);
    }

    this.cacheLoad ??= this.loadCache();

    return this.cacheLoad;
  }

  private async loadCache(): Promise<CountryReferenceCache> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<string>(COUNTRY_REFERENCE_URL, {
          responseType: 'text',
          timeout: COUNTRY_REFERENCE_REQUEST_TIMEOUT_MS,
        }),
      );
      const countries = parseCountryReferences(response.data);
      const cache: CountryReferenceCache = {
        countries,
        countryIsos: new Set(countries.map((country) => country.iso)),
        expiresAt: Date.now() + COUNTRY_REFERENCE_CACHE_TTL_MS,
      };

      this.cache = cache;

      return cache;
    } catch (e) {
      throw new ServiceUnavailableException(
        'The country reference catalog is temporarily unavailable',
        { cause: e },
      );
    } finally {
      this.cacheLoad = undefined;
    }
  }
}

export function parseCountryReferences(html: string): CountryReference[] {
  const document = load(html);
  const table = document(COUNTRY_REFERENCE_TABLE_SELECTOR);

  if (table.length !== 1) {
    throw new Error('UNSD English country table must exist exactly once');
  }

  const rows = table.find('tr');
  const headers = rows
    .first()
    .children('th,td')
    .map((_, cell) => document(cell).text().trim())
    .get();
  const isoIndex = headers.indexOf(COUNTRY_ISO_HEADER);

  if (isoIndex === -1) {
    throw new Error('UNSD country table must contain the ISO alpha-2 header');
  }

  const countries: CountryReference[] = [];
  const countryIsos = new Set<string>();

  rows.slice(1).each((_, row) => {
    const cells = document(row)
      .children('th,td')
      .map((__, cell) => document(cell).text().trim())
      .get();
    const iso = cells[isoIndex];

    if (iso === undefined || !COUNTRY_ISO_PATTERN.test(iso)) {
      throw new Error('UNSD country row must contain an ISO alpha-2 code');
    }
    if (countryIsos.has(iso)) {
      throw new Error('UNSD country ISO codes must be unique');
    }

    countryIsos.add(iso);
    countries.push({ iso });
  });

  if (countries.length < MIN_EXPECTED_COUNTRY_COUNT) {
    throw new Error('UNSD country table contains fewer rows than expected');
  }

  return countries.sort((left, right) => left.iso.localeCompare(right.iso));
}

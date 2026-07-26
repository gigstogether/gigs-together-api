import { Logger } from '@nestjs/common';
import {
  buildNamespaceLocaleRegistry,
  buildTranslationCacheIndex,
  parseTranslationBundleEntry,
  TELEGRAM_TEMPLATE_NAMESPACE,
  TRANSLATION_CACHE_DEFAULT_LOCALE,
} from './translation-bundle.parser';
import type { TranslationRecord } from './types/translation.types';

describe('parseTranslationBundleEntry', () => {
  it('should parse a valid translation record without namespace restriction', () => {
    expect(
      parseTranslationBundleEntry({
        namespace: 'about',
        key: 'title',
        value: 'About us',
        format: 'plain',
        kind: 'text',
        isActive: true,
      }),
    ).toEqual({
      namespace: 'about',
      key: 'title',
      value: 'About us',
      format: 'plain',
      kind: 'text',
      isActive: true,
    });
  });

  it('should throw when namespace is missing', () => {
    expect(() =>
      parseTranslationBundleEntry({
        key: 'title',
        value: 'About us',
        format: 'plain',
        kind: 'text',
        isActive: true,
      }),
    ).toThrow('namespace must be a non-empty string');
  });
});

describe('buildNamespaceLocaleRegistry', () => {
  const logger = new Logger('translation-bundle.parser.test');

  it('should skip invalid entries and index valid ones by locale', () => {
    const records: readonly TranslationRecord[] = [
      {
        locale: 'en',
        namespace: 'telegram',
        key: 'weeklyDigest.empty',
        value: 'No gigs this week.',
        format: 'plain',
        kind: 'text',
        isActive: true,
      },
      {
        locale: 'en',
        namespace: 'telegram',
        key: 'invalid_key',
        value: 'Broken',
        format: 'plain',
        kind: 'text',
        isActive: true,
      },
    ];

    const registry = buildNamespaceLocaleRegistry(records, 'telegram', logger);

    expect(registry.get('en')?.get('weeklyDigest.empty')).toEqual({
      namespace: 'telegram',
      key: 'weeklyDigest.empty',
      value: 'No gigs this week.',
      format: 'plain',
      kind: 'text',
      isActive: true,
    });
    expect(registry.get('en')?.has('invalid_key')).toBe(false);
  });

  it('should keep an empty registry when all entries are invalid', () => {
    const registry = buildNamespaceLocaleRegistry(
      [
        {
          locale: 'en',
          namespace: 'telegram',
          key: 'bad_key',
          value: 'Broken',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
      ],
      TELEGRAM_TEMPLATE_NAMESPACE,
      logger,
    );

    expect(registry.size).toBe(0);
  });
});

describe('buildTranslationCacheIndex', () => {
  const logger = new Logger('translation-bundle.parser.test');

  it('should group records by namespace and skip rows with empty namespace', () => {
    const index = buildTranslationCacheIndex(
      [
        {
          locale: 'en',
          namespace: 'about',
          key: 'title',
          value: 'About',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
        {
          locale: 'en',
          namespace: '',
          key: 'ignored',
          value: 'Ignored',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
      ],
      logger,
    );

    expect(index.has('about')).toBe(true);
    expect(index.get('about')?.get('en')?.get('title')?.value).toBe('About');
    expect(index.has('')).toBe(false);
  });

  it('should allow telegram default locale entries from any namespace builder path', () => {
    const index = buildTranslationCacheIndex(
      [
        {
          locale: TRANSLATION_CACHE_DEFAULT_LOCALE,
          namespace: TELEGRAM_TEMPLATE_NAMESPACE,
          key: 'weeklyDigest.empty',
          value: 'No gigs.',
          format: 'plain',
          kind: 'text',
          isActive: true,
        },
      ],
      logger,
    );

    expect(
      index
        .get(TELEGRAM_TEMPLATE_NAMESPACE)
        ?.get(TRANSLATION_CACHE_DEFAULT_LOCALE)
        ?.get('weeklyDigest.empty')?.value,
    ).toBe('No gigs.');
  });
});

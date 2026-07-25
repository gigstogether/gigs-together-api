import { InternalServerErrorException } from '@nestjs/common';
import { renderPlainTemplateString } from './plain-template.renderer';
import { TranslationTemplateService } from './translation-template.service';
import type { TranslationBundleEntry } from './types/translation.types';

describe('renderPlainTemplateString', () => {
  it('should replace placeholders with param values', () => {
    expect(
      renderPlainTemplateString('Hello {name}, count: {count}', {
        name: 'Ada',
        count: 3,
      }),
    ).toBe('Hello Ada, count: 3');
  });

  it('should leave placeholders unchanged when params are null or undefined', () => {
    expect(
      renderPlainTemplateString('{title} at {venue}', {
        title: null,
        venue: undefined,
      }),
    ).toBe('{title} at {venue}');
  });
});

describe('TranslationTemplateService', () => {
  const service = new TranslationTemplateService();

  const plainTemplateEntry: TranslationBundleEntry = {
    namespace: 'telegram',
    key: 'mainGig.withLink',
    value: '<a href="{url}">{title}</a>',
    format: 'plain',
    kind: 'template',
    isActive: true,
  };

  it('should render a plain template entry', () => {
    expect(
      service.render({
        entry: plainTemplateEntry,
        params: {
          url: 'https://example.com',
          title: 'Gig',
        },
      }),
    ).toBe('<a href="https://example.com">Gig</a>');
  });

  it('should throw when entry kind is text', () => {
    expect(() =>
      service.render({
        entry: {
          ...plainTemplateEntry,
          kind: 'text',
        },
        params: {},
      }),
    ).toThrow(InternalServerErrorException);
  });

  it('should throw when entry format is icu', () => {
    expect(() =>
      service.render({
        entry: {
          ...plainTemplateEntry,
          format: 'icu',
        },
        params: {},
      }),
    ).toThrow(/unsupported ICU format/);
  });
});

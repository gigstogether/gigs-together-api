import { describe, it, expect } from 'vitest';
import {
  isValidTranslationKey,
  isValidTranslationNamespace,
} from './translation-identifiers';

describe('isValidTranslationNamespace', () => {
  it('should accept camelCase namespace names', () => {
    expect(isValidTranslationNamespace('telegram')).toBe(true);
    expect(isValidTranslationNamespace('common')).toBe(true);
    expect(isValidTranslationNamespace('feedFilters')).toBe(true);
  });
  it('should reject snake_case namespace names', () => {
    expect(isValidTranslationNamespace('telegram_post')).toBe(false);
  });
});

describe('isValidTranslationKey', () => {
  it('should accept dot-separated camelCase keys', () => {
    expect(isValidTranslationKey('mainGig.withLink')).toBe(true);
    expect(isValidTranslationKey('weeklyDigest.gigLine.html')).toBe(true);
  });

  it('should reject snake_case keys', () => {
    expect(isValidTranslationKey('main_gig_post.with_link')).toBe(false);
  });
});

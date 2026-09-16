import {
  DIGEST_POST_STATE_COLLECTION,
  DigestPostStateSchema,
} from './digest-post-state.schema';

describe('DigestPostStateSchema', () => {
  it('should preserve the existing collection while requiring the renamed fields', () => {
    expect(DigestPostStateSchema.options.collection).toBe(
      DIGEST_POST_STATE_COLLECTION,
    );
    expect(DigestPostStateSchema.path('postedAt')?.isRequired).toBe(true);
    expect(DigestPostStateSchema.path('postUrl')?.isRequired).toBe(true);
  });
});

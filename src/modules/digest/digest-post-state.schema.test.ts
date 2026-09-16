import {
  DIGEST_POST_STATE_COLLECTION,
  DigestPostStateSchema,
} from './digest-post-state.schema';

describe('DigestPostStateSchema', () => {
  it('should use the digest post state collection with required fields', () => {
    expect(DIGEST_POST_STATE_COLLECTION).toBe('digestpoststates');
    expect(DigestPostStateSchema.options.collection).toBe('digestpoststates');
    expect(DigestPostStateSchema.path('postedAt')?.isRequired).toBe(true);
    expect(DigestPostStateSchema.path('postUrl')?.isRequired).toBe(true);
  });
});

import { DigestPostStateRepositoryMapper } from './digest-post-state.repository.mapper';

describe('DigestPostStateRepositoryMapper', () => {
  it('should map a stored digest post state to the domain model', () => {
    const postedAt = new Date('2026-09-21T10:00:00.000Z');

    expect(
      DigestPostStateRepositoryMapper.toDigestPostState({
        postedAt,
        postUrl: 'https://t.me/c/1/42',
      }),
    ).toEqual({
      postedAt,
      postUrl: 'https://t.me/c/1/42',
    });
  });

  it('should reject an invalid stored post date', () => {
    expect(() =>
      DigestPostStateRepositoryMapper.toDigestPostState({
        postedAt: new Date('invalid'),
        postUrl: 'https://t.me/c/1/42',
      }),
    ).toThrow('Digest post state postedAt must be a valid Date');
  });

  it('should reject an empty stored post URL', () => {
    expect(() =>
      DigestPostStateRepositoryMapper.toDigestPostState({
        postedAt: new Date('2026-09-21T10:00:00.000Z'),
        postUrl: ' ',
      }),
    ).toThrow('Digest post state postUrl must be a non-empty string');
  });
});

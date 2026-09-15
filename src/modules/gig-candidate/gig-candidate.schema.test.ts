import { GigCandidateSchema } from './gig-candidate.schema';

describe('GigCandidateSchema', () => {
  it('should keep source immutable at the persistence boundary', () => {
    expect(GigCandidateSchema.path('source').options.immutable).toBe(true);
  });

  it('should store source as one union value without nullable branch fields', () => {
    expect(GigCandidateSchema.path('source').instance).toBe('Mixed');
    expect(
      Object.prototype.hasOwnProperty.call(
        GigCandidateSchema.paths,
        'source.userId',
      ),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(
        GigCandidateSchema.paths,
        'source.provider',
      ),
    ).toBe(false);
  });

  it('should require optimistic versions to be integers', () => {
    const validate = GigCandidateSchema.path('version').options.validate;

    expect(validate(1)).toBe(true);
    expect(validate(1.5)).toBe(false);
  });

  it('should define only the implemented queue and Gig relationship indexes', () => {
    expect(GigCandidateSchema.indexes()).toEqual([
      [{ status: 1, createdAt: -1, _id: -1 }, {}],
      [{ gigId: 1 }, { unique: true, sparse: true }],
    ]);
  });

  it('should not define a provider unique index before provider persistence is enabled', () => {
    const hasProviderIndex = GigCandidateSchema.indexes().some(([fields]) =>
      Object.prototype.hasOwnProperty.call(
        fields,
        'source.provider.externalEventId',
      ),
    );

    expect(hasProviderIndex).toBe(false);
  });
});

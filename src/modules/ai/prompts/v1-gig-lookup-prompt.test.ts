import { buildV1FutureGigLookupPrompt } from './v1-gig-lookup-prompt';

describe('buildV1FutureGigLookupPrompt', () => {
  it('should build the structured gig lookup prompt', () => {
    const prompt = buildV1FutureGigLookupPrompt({
      name: 'Band',
      place: 'Barcelona',
    });

    expect({
      hasStructuredResult: prompt.includes(
        'Set `isFound` to true only if you find a plausible FUTURE concert',
      ),
      hasInput: prompt.includes('Name: Band\nPlace: Barcelona'),
      hasDeprecatedNullResult: prompt.includes('Return JSON null'),
    }).toEqual({
      hasStructuredResult: true,
      hasInput: true,
      hasDeprecatedNullResult: false,
    });
  });
});

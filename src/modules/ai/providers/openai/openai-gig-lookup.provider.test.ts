import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import { OpenAiGigLookupProvider } from './openai-gig-lookup.provider';

const openAiMocks = vi.hoisted(() => ({
  create: vi.fn(),
  constructor: vi.fn(),
}));

vi.mock('openai', () => {
  class MockApiError extends Error {
    status: number | undefined;
    error: unknown;

    constructor(
      status: number | undefined,
      error: unknown,
      message: string | undefined,
    ) {
      super(message);
      this.status = status;
      this.error = error;
    }
  }

  class MockOpenAI {
    static APIError = MockApiError;
    responses = { create: openAiMocks.create };

    constructor(options: unknown) {
      openAiMocks.constructor(options);
    }
  }

  return { default: MockOpenAI };
});

function createProvider(
  config: Record<string, unknown> = {},
): OpenAiGigLookupProvider {
  return new OpenAiGigLookupProvider(
    new ConfigService({
      AI_API_KEY: 'api-key',
      AI_MODEL: 'gpt-model',
      AI_URL: 'https://api.openai.example/v1',
      AI_LOOKUP_DEBUG: '',
      ...config,
    }),
  );
}

describe('OpenAiGigLookupProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openAiMocks.create.mockResolvedValue({
      output_text: JSON.stringify({
        isFound: true,
        title: 'Band',
        date: '2099-12-01T19:00:00.000Z',
        endDate: '',
        city: 'Barcelona',
        country: ' es ',
        venue: 'Venue',
        ticketsUrl: 'https://tickets.example',
        posterUrl: '',
      }),
    });
  });

  it('should look up a gig through the OpenAI Responses API', async () => {
    const provider = createProvider();

    await expect(
      provider.lookupGig({ name: 'Band', location: 'Barcelona' }),
    ).resolves.toEqual({
      title: 'Band',
      date: '2099-12-01T19:00:00.000Z',
      city: 'Barcelona',
      country: 'ES',
      venue: 'Venue',
      ticketsUrl: 'https://tickets.example',
    });
  });

  it('should configure the OpenAI client', async () => {
    const provider = createProvider();

    await provider.lookupGig({ name: 'Band', location: 'Barcelona' });

    expect(openAiMocks.constructor).toHaveBeenCalledWith({
      apiKey: 'api-key',
      baseURL: 'https://api.openai.example/v1',
    });
  });

  it('should send a structured gig lookup request', async () => {
    const provider = createProvider();

    await provider.lookupGig({ name: 'Band', location: 'Barcelona' });

    expect(openAiMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-model',
        tools: [{ type: 'web_search' }],
        text: {
          format: expect.objectContaining({
            type: 'json_schema',
            name: 'gig_lookup',
            strict: true,
          }),
        },
      }),
    );
  });

  it('should return null when OpenAI reports no matching gig', async () => {
    openAiMocks.create.mockResolvedValue({
      output_text: '{"isFound":false}',
    });
    const provider = createProvider();

    await expect(
      provider.lookupGig({ name: 'Band', location: 'Barcelona' }),
    ).resolves.toBeNull();
  });

  it('should return null when OpenAI returns a past gig', async () => {
    openAiMocks.create.mockResolvedValue({
      output_text: JSON.stringify({ date: '2020-01-01T00:00:00.000Z' }),
    });
    const provider = createProvider();

    await expect(
      provider.lookupGig({ name: 'Band', location: 'Barcelona' }),
    ).resolves.toBeNull();
  });

  it('should recover JSON wrapped in model text', async () => {
    openAiMocks.create.mockResolvedValue({
      output_text: 'Result: {"title":"Band","date":"2099-12-01"} done',
    });
    const provider = createProvider();

    await expect(
      provider.lookupGig({ name: 'Band', location: 'Barcelona' }),
    ).resolves.toMatchObject({ title: 'Band', date: '2099-12-01' });
  });

  it.each([
    [{ AI_API_KEY: '' }, 'AI_API_KEY is not set on the server'],
    [{ AI_MODEL: '' }, 'AI_MODEL is not set on the server'],
    [{ AI_URL: '' }, 'AI_URL is not set on the server'],
  ])(
    'should reject a lookup when configuration is missing',
    async (config, message) => {
      const provider = createProvider(config);

      await expect(
        provider.lookupGig({ name: 'Band', location: 'Barcelona' }),
      ).rejects.toThrow(message);
    },
  );

  it('should reject empty model content', async () => {
    openAiMocks.create.mockResolvedValue({ output_text: '' });
    const provider = createProvider();

    await expect(
      provider.lookupGig({ name: 'Band', location: 'Barcelona' }),
    ).rejects.toThrow('AI returned empty response');
  });

  it('should reject malformed model content', async () => {
    openAiMocks.create.mockResolvedValue({ output_text: 'not JSON' });
    const provider = createProvider();

    await expect(
      provider.lookupGig({ name: 'Band', location: 'Barcelona' }),
    ).rejects.toThrow('Model did not return valid JSON');
  });

  it('should translate OpenAI API errors', async () => {
    openAiMocks.create.mockRejectedValue(
      new OpenAI.APIError(
        429,
        { error: { message: 'Rate limit reached' } },
        'Request failed',
        new Headers(),
      ),
    );
    const provider = createProvider();

    await expect(
      provider.lookupGig({ name: 'Band', location: 'Barcelona' }),
    ).rejects.toThrow('AI request failed (HTTP 429): Rate limit reached');
  });

  it('should reject an invalid debug flag during initialization', () => {
    expect(() => createProvider({ AI_LOOKUP_DEBUG: 'sometimes' })).toThrow(
      'AI_LOOKUP_DEBUG must be a boolean.',
    );
  });
});

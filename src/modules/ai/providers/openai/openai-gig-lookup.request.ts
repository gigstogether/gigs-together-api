export const GIG_LOOKUP_OPENAI_JSON_SCHEMA = {
  type: 'object',
  properties: {
    isFound: {
      type: 'boolean',
      description:
        'True if a matching upcoming concert exists; false otherwise.',
    },
    title: { type: 'string' },
    date: { type: 'string' },
    endDate: { type: 'string' },
    city: { type: 'string' },
    country: { type: 'string' },
    venue: { type: 'string' },
    ticketsUrl: { type: 'string' },
    posterUrl: { type: 'string' },
  },
  required: [
    'isFound',
    'title',
    'date',
    'endDate',
    'city',
    'country',
    'venue',
    'ticketsUrl',
    'posterUrl',
  ],
  additionalProperties: false,
} as const;

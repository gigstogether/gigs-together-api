export type GigLookupPromptMode = 'plain-json' | 'structured';

export function buildV1FutureGigLookupPrompt(params: {
  name: string;
  place: string;
  mode?: GigLookupPromptMode;
}): string {
  const { name, place } = params;
  const mode: GigLookupPromptMode = params.mode ?? 'plain-json';

  const sharedRules = [
    '## Rules',
    '- Fill fields from what you find. Use "" for any value you cannot support.',
    '- `date` must be a string. Prefer ISO 8601, e.g. "2026-01-23T19:30:00+03:00". If the show time is unclear but the calendar date is known, use date-only ISO. If unknown, set "".',
    '- `endDate`: use "" unless the event lasts more than 1 day (e.g. a festival); then prefer ISO 8601 date, e.g. "2026-06-12".',
    '- We only care about FUTURE concerts (after "now" in the relevant timezone when known).',
    '- `ticketsUrl` (relaxed):',
    '  - Prefer links on: ticketmaster.<tld>, axs.com, livenation.com (incl. subdomains).',
    '  - If none of those apply, use another HTTPS URL that is clearly official or reputable: artist site, venue site, promoter, or a major local ticketing site for that region.',
    '  - Use "" only if you have no reasonable link.',
    '- `posterUrl` must be a URL string or "".',
    '- `city` must be a city name or "".',
    '- `country` must be an ISO 3166-1 alpha-2 code (uppercase), e.g. "ES", "US", or "".',
    '- `venue` should be the venue name (not the city and not the full street address). If unknown, set "".',
    '- Do not make up specific dates, venue names, or URLs. Use "" when unsure rather than inventing.',
  ];

  if (mode === 'structured') {
    return [
      'You are an assistant helping to create a gig draft for an app.',
      'Your task: find gig details for the query using current web search results.',
      'Prefer information that your search sources support. You may normalize artist/title spelling and obvious name variants when the query clearly refers to a known act.',
      '',
      'Set `isFound` to true only if you find a plausible FUTURE concert that matches the name and place.',
      'Set `isFound` to false if there is no upcoming match, you are unsure, or you only find past dates. When `isFound` is false, set every string field to "".',
      'When `isFound` is true, fill the object as completely as you can; use "" for unknown strings (never omit required keys).',
      '',
      '## Input',
      `Name: ${name}`,
      `Place: ${place}`,
      '',
      ...sharedRules,
    ].join('\n');
  }

  // Prompt for extracting a future gig draft (plain JSON body: object or null).
  // Deprecated
  return [
    'You are an assistant helping to create a gig draft for an app.',
    'Your task: find gig details for the query using current information (e.g. web search when available).',
    'Prefer information that your tools or sources support. You may normalize artist/title spelling and obvious name variants when the query clearly refers to a known act.',
    'If you find a plausible FUTURE concert that matches the query, return a JSON object even when some fields are unknown (use "" for missing strings).',
    'Return JSON null only when you are confident there is no upcoming concert that matches, or you only find past dates.',
    '',
    '## Input',
    `Name: ${name}`,
    `Place: ${place}`,
    '',
    '## Output format (STRICT)',
    '- Return ONLY valid JSON. No markdown, no code fences, no extra text.',
    '- If there is no matching FUTURE concert, return the JSON literal: null',
    '- Otherwise, return a single JSON object that matches this schema exactly:',
    '{',
    '  "title": string;',
    '  "date": string;',
    '  "endDate"?: string;',
    '  "city": string;',
    '  "country": string;',
    '  "venue": string;',
    '  "ticketsUrl": string;',
    '  "posterUrl"?: string;',
    '}',
    '',
    ...sharedRules,
  ].join('\n');
}

import { Readable } from 'node:stream';

import { Messenger } from '../../shared/types/messenger.enum';
import { GigCandidateStatus } from '../gig-candidate/types/gig-candidate-status.enum';
import type { AdminGigCandidateDetails } from './admin-gig-candidate.types';
import {
  mapV1AdminCreateGigCandidateRequest,
  mapV1AdminGigCandidateResponse,
  mapV1AdminGigCandidatesListResponse,
  mapV1AdminGigCandidatesQuery,
  mapV1AdminUpdateGigCandidateDraftRequest,
} from './admin-gig-candidate.mapper';

function buildGigCandidateDetails(): AdminGigCandidateDetails {
  return {
    id: '507f1f77bcf86cd799439099',
    source: {
      type: 'user',
      userId: '66a000000000000000000000042',
      origin: { type: 'form' },
    },
    gigDraft: {
      title: 'Band',
      date: Date.parse('2026-08-20T00:00:00.000Z'),
      city: 'Barcelona',
      country: 'ES',
    },
    version: 0,
    status: GigCandidateStatus.New,
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    updatedAt: new Date('2026-08-02T10:00:00.000Z'),
  };
}

describe('mapV1AdminGigCandidatesQuery', () => {
  it('should map the HTTP status and default limit to application params', () => {
    expect(mapV1AdminGigCandidatesQuery({ status: 'new' })).toEqual({
      status: GigCandidateStatus.New,
      limit: 100,
      sortBy: undefined,
      sortOrder: undefined,
    });
  });
});

describe('mapV1AdminGigCandidateResponse', () => {
  it('should serialize application dates for the HTTP response', () => {
    expect(
      mapV1AdminGigCandidateResponse({
        ...buildGigCandidateDetails(),
        intakePostUrl: 'https://t.me/c/123/77',
        intakePostDate: 1_700_000_000_000,
        moderationPostUrl: 'https://t.me/c/124/78',
        moderationPostDate: 1_700_000_001_000,
      }),
    ).toEqual(
      expect.objectContaining({
        gigDraft: expect.objectContaining({ date: '2026-08-20' }),
        intakePostUrl: 'https://t.me/c/123/77',
        intakePostDate: 1_700_000_000_000,
        moderationPostUrl: 'https://t.me/c/124/78',
        moderationPostDate: 1_700_000_001_000,
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-08-02T10:00:00.000Z',
      }),
    );
  });

  it('should serialize provider source dates at the HTTP boundary', () => {
    const response = mapV1AdminGigCandidateResponse({
      ...buildGigCandidateDetails(),
      source: {
        type: 'provider',
        provider: {
          name: 'setlistFm',
          externalEventId: 'event-1',
          sourceUrl: 'https://provider.example/event-1',
          fetchedAt: new Date('2026-08-01T00:00:00.000Z'),
          providerUpdatedAt: new Date('2026-07-31T00:00:00.000Z'),
        },
      },
    });

    expect(response.source).toEqual({
      type: 'provider',
      provider: {
        name: 'setlistFm',
        externalEventId: 'event-1',
        sourceUrl: 'https://provider.example/event-1',
        fetchedAt: '2026-08-01T00:00:00.000Z',
        providerUpdatedAt: '2026-07-31T00:00:00.000Z',
      },
    });
  });

  it('should serialize messenger origin with chatId', () => {
    const response = mapV1AdminGigCandidateResponse({
      ...buildGigCandidateDetails(),
      source: {
        type: 'user',
        userId: '66a000000000000000000000042',
        origin: {
          type: 'messenger',
          messenger: Messenger.Telegram,
          chatId: 'chat-1',
          messageId: 'message-1',
        },
      },
    });

    expect(response.source).toEqual({
      type: 'user',
      userId: '66a000000000000000000000042',
      origin: {
        type: 'messenger',
        messenger: Messenger.Telegram,
        chatId: 'chat-1',
        messageId: 'message-1',
      },
    });
  });
});

describe('mapV1AdminCreateGigCandidateRequest', () => {
  it('should map trimmed partial gigDraft and authenticated userId', () => {
    expect(
      mapV1AdminCreateGigCandidateRequest({
        userId: '507f1f77bcf86cd799439088',
        body: {
          gigDraft: {
            title: '  Band  ',
            date: '2026-09-20',
            country: 'es',
            ticketsUrl: ' https://tickets.example/gig ',
          },
        },
      }),
    ).toEqual({
      userId: '507f1f77bcf86cd799439088',
      gigDraft: {
        title: 'Band',
        date: Date.parse('2026-09-20T00:00:00.000Z'),
        country: 'ES',
        ticketsUrl: 'https://tickets.example/gig',
      },
      posterUrl: undefined,
      posterFile: undefined,
    });
  });

  it('should map the uploaded transport file to the application contract', () => {
    const buffer = Buffer.from('poster');
    const posterFile: Express.Multer.File = {
      fieldname: 'posterFile',
      originalname: 'poster.png',
      encoding: '7bit',
      buffer,
      mimetype: 'image/png',
      size: buffer.length,
      stream: Readable.from(buffer),
      destination: '',
      filename: '',
      path: '',
    };

    expect(
      mapV1AdminCreateGigCandidateRequest({
        userId: '507f1f77bcf86cd799439088',
        body: { gigDraft: {} },
        posterFile,
      }).posterFile,
    ).toEqual({ buffer, mimetype: 'image/png' });
  });
});

describe('mapV1AdminUpdateGigCandidateDraftRequest', () => {
  it('should preserve expectedVersion and map only gigDraft fields', () => {
    expect(
      mapV1AdminUpdateGigCandidateDraftRequest({
        gigCandidateId: '507f1f77bcf86cd799439099',
        body: {
          expectedVersion: 4,
          gigDraft: { city: ' Barcelona ', posterUrl: 'https://img.example/a' },
        },
      }),
    ).toEqual({
      gigCandidateId: '507f1f77bcf86cd799439099',
      expectedVersion: 4,
      gigDraft: { city: 'Barcelona' },
      posterUrl: 'https://img.example/a',
      posterFile: undefined,
    });
  });
});

describe('mapV1AdminGigCandidatesListResponse', () => {
  it('should wrap mapped candidates in the versioned response shape', () => {
    expect(
      mapV1AdminGigCandidatesListResponse([buildGigCandidateDetails()]),
    ).toEqual({
      gigCandidates: [
        expect.objectContaining({ id: '507f1f77bcf86cd799439099' }),
      ],
    });
  });
});

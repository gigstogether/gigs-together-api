import { Types } from 'mongoose';

import type { PlainGig } from '../gig/types/gig.types';
import {
  mapGigToFormData,
  mapV1AdminGigCandidateResponse,
  mapV1AdminGigCandidatesListResponse,
  mapV1AdminGigCandidatesQuery,
} from './admin-gig.mapper';
import { Messenger } from '../../shared/types/messenger.enum';
import { PostType } from '../gig/types/postType.enum';
import { Status } from '../gig/types/status.enum';
import { GigCandidateStatus } from '../gig-candidate/types/gig-candidate-status.enum';
import type { AdminGigCandidateDetails } from './admin-gig-candidate.types';

function buildGig(overrides: Partial<PlainGig> = {}): PlainGig {
  return {
    _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
    publicId: 'radiohead-barcelona-2026-06-12',
    title: 'Radiohead',
    date: new Date('2026-06-12T12:00:00.000Z').getTime(),
    city: 'barcelona',
    country: 'ES',
    venue: 'Palau Sant Jordi',
    ticketsUrl: 'https://example.com/tickets',
    status: Status.Pending,
    posts: [
      {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        chatId: -100123,
        id: 42,
        date: new Date('2026-05-30T14:22:00.000Z').getTime(),
      },
    ],
    suggestedBy: { userId: 9001, username: 'mod-user', name: 'Moderator' },
    ...overrides,
  };
}

describe('mapGigToFormDataByPublicId', () => {
  it('should map full gig form and admin preview fields', () => {
    const publishPostDate = new Date('2026-06-01T10:00:00.000Z').getTime();
    const moderationPostDate = new Date('2026-05-30T14:22:00.000Z').getTime();

    expect(
      mapGigToFormData({
        gig: buildGig(),
        posterUrl: 'https://cdn.example/poster.jpg',
        publishPostUrl: 'https://t.me/channel/1',
        publishPostDate,
        moderationPostUrl: 'https://t.me/c/123/42',
        moderationPostDate,
      }),
    ).toEqual({
      publicId: 'radiohead-barcelona-2026-06-12',
      title: 'Radiohead',
      status: Status.Pending,
      date: '2026-06-12',
      endDate: undefined,
      city: 'barcelona',
      country: 'ES',
      venue: 'Palau Sant Jordi',
      posterUrl: 'https://cdn.example/poster.jpg',
      suggestedBy: {
        userId: '9001',
        username: 'mod-user',
        name: 'Moderator',
      },
      ticketsUrl: 'https://example.com/tickets',
      publishPostUrl: 'https://t.me/channel/1',
      publishPostDate,
      moderationPostUrl: 'https://t.me/c/123/42',
      moderationPostDate,
    });
  });
});

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
    status: GigCandidateStatus.Pending,
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    updatedAt: new Date('2026-08-02T10:00:00.000Z'),
  };
}

describe('mapV1AdminGigCandidatesQuery', () => {
  it('should map the HTTP status and default limit to application params', () => {
    expect(mapV1AdminGigCandidatesQuery({ status: 'pending' })).toEqual({
      status: GigCandidateStatus.Pending,
      limit: 100,
      sortBy: undefined,
      sortOrder: undefined,
    });
  });
});

describe('mapV1AdminGigCandidateResponse', () => {
  it('should serialize application dates for the HTTP response', () => {
    expect(mapV1AdminGigCandidateResponse(buildGigCandidateDetails())).toEqual(
      expect.objectContaining({
        gigDraft: expect.objectContaining({ date: '2026-08-20' }),
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-08-02T10:00:00.000Z',
      }),
    );
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

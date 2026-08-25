import { Types } from 'mongoose';

import { Messenger } from '../../shared/types/messenger.enum';
import type { PlainGig } from '../gig/types/gig.types';
import { PostType } from '../gig/types/postType.enum';
import { Status } from '../gig/types/status.enum';
import { mapGigToFormData } from './admin-gig.mapper';

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

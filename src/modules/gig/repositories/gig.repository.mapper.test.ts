import { Types } from 'mongoose';

import { Messenger } from '../../../shared/types/messenger.enum';
import { PostType } from '../../../shared/types/post-type.enum';
import { GigRepositoryMapper } from './gig.repository.mapper';
import type { GigLeanDocument } from './gig.repository.mapper';

function buildDocument(
  overrides: Partial<GigLeanDocument> = {},
): GigLeanDocument {
  return {
    _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
    publicId: 'radiohead-barcelona-2026-06-12',
    title: 'Radiohead',
    date: Date.UTC(2026, 5, 12),
    city: 'barcelona',
    country: 'ES',
    venue: 'Palau Sant Jordi',
    ticketsUrl: 'https://tickets.example/radiohead',
    isVisible: true,
    version: 3,
    source: {
      type: 'user',
      userId: new Types.ObjectId('507f1f77bcf86cd799439012'),
      origin: { type: 'admin' },
    },
    posts: [
      {
        to: Messenger.Telegram,
        type: PostType.Moderation,
        date: Date.UTC(2026, 4, 30),
        id: 42,
        chatId: -100123,
      },
    ],
    createdAt: new Date('2026-05-30T14:22:00.000Z'),
    updatedAt: new Date('2026-05-30T14:22:00.000Z'),
    ...overrides,
  };
}

describe('GigRepositoryMapper', () => {
  describe('toGig', () => {
    it('should map Mongo identifiers to domain strings', () => {
      const gig = GigRepositoryMapper.toGig(buildDocument());

      expect(gig).toMatchObject({
        id: '507f1f77bcf86cd799439011',
        source: {
          type: 'user',
          userId: '507f1f77bcf86cd799439012',
          origin: { type: 'admin' },
        },
      });
    });

    it('should map a complete provider source', () => {
      const fetchedAt = new Date('2026-05-01T10:00:00.000Z');
      const providerUpdatedAt = new Date('2026-04-30T10:00:00.000Z');

      const gig = GigRepositoryMapper.toGig(
        buildDocument({
          source: {
            type: 'provider',
            provider: {
              name: 'provider',
              externalEventId: 'event-1',
              externalVersionId: 'version-2',
              sourceUrl: 'https://provider.example/events/1',
              fetchedAt,
              providerUpdatedAt,
            },
          },
        }),
      );

      expect(gig.source).toEqual({
        type: 'provider',
        provider: {
          name: 'provider',
          externalEventId: 'event-1',
          externalVersionId: 'version-2',
          sourceUrl: 'https://provider.example/events/1',
          fetchedAt,
          providerUpdatedAt,
        },
      });
    });

    it('should reject a malformed stored source', () => {
      expect(() =>
        GigRepositoryMapper.toGig(
          buildDocument({ source: { type: 'user', userId: 'missing-origin' } }),
        ),
      ).toThrow('Gig user source origin is missing or invalid.');
    });
  });
});

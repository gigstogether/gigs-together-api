import type { PlainGig } from '@modules/gig/types/gig.types';
import { GigSourceType } from '@modules/gig/types/gig-source-type.enum';
import { GigSourceUserOriginType } from '@modules/gig/types/gig-source-user-origin-type.enum';
import { Messenger } from '@shared/types/messenger.enum';
import { mapGigToFormData } from './admin-gig.mapper';

describe('mapGigToFormData', () => {
  const venueSelection = {
    locality: {
      id: '507f1f77bcf86cd799439014',
      countryIso: 'ES',
      name: 'Barcelona',
      aliases: [],
      timeZone: 'Europe/Madrid',
    },
    venues: [
      {
        id: '507f1f77bcf86cd799439013',
        localityId: '507f1f77bcf86cd799439014',
        name: 'Venue',
        aliases: [],
        isActive: true,
      },
    ],
  };

  it('should map required source for the admin response', () => {
    const userId = '507f1f77bcf86cd799439012';
    const gig: PlainGig = {
      id: '507f1f77bcf86cd799439011',
      communityIds: ['507f1f77bcf86cd799439011'],
      venueIds: ['507f1f77bcf86cd799439013'],
      publicId: 'test-gig-2026-09-17',
      title: 'Test',
      date: Date.UTC(2026, 8, 17),
      ticketsUrl: '',
      isVisible: true,
      version: 0,
      source: {
        type: GigSourceType.User,
        userId,
        origin: { type: GigSourceUserOriginType.Admin },
      },
      posts: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(
      mapGigToFormData({
        gig,
        venueSelection,
        userSourceProfile: {
          displayName: 'Test Admin',
          isCurrentlyAdmin: true,
          telegramUsername: 'test_admin',
        },
      }),
    ).toMatchObject({
      publicId: gig.publicId,
      source: {
        type: 'user',
        userId,
        displayName: 'Test Admin',
        isCurrentlyAdmin: true,
        telegramUsername: 'test_admin',
        origin: { type: GigSourceUserOriginType.Admin },
      },
      isVisible: true,
      version: 0,
    });
  });

  it('should map messenger provenance without a user profile', () => {
    const gig: PlainGig = {
      id: '507f1f77bcf86cd799439011',
      communityIds: ['507f1f77bcf86cd799439011'],
      venueIds: ['507f1f77bcf86cd799439013'],
      publicId: 'test-gig-2026-09-17',
      title: 'Test',
      date: Date.UTC(2026, 8, 17),
      ticketsUrl: '',
      isVisible: true,
      version: 0,
      source: {
        type: GigSourceType.User,
        origin: {
          type: GigSourceUserOriginType.Messenger,
          messenger: Messenger.Telegram,
        },
      },
      posts: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = mapGigToFormData({
      gig,
      venueSelection,
      userSourceProfile: { isCurrentlyAdmin: false },
    });

    expect(result.source).toEqual({
      type: 'user',
      origin: {
        type: 'messenger',
        messenger: Messenger.Telegram,
      },
      isCurrentlyAdmin: false,
    });
  });
});

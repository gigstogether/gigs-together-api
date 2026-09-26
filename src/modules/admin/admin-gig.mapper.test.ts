import type { PlainGig } from '../gig/types/gig.types';
import { mapGigToFormData } from './admin-gig.mapper';

describe('mapGigToFormData', () => {
  it('should map required source for the admin response', () => {
    const userId = '507f1f77bcf86cd799439012';
    const gig: PlainGig = {
      id: '507f1f77bcf86cd799439011',
      publicId: 'test-gig-2026-09-17',
      title: 'Test',
      date: Date.UTC(2026, 8, 17),
      city: 'barcelona',
      country: 'ES',
      venue: 'Venue',
      ticketsUrl: '',
      isVisible: true,
      version: 0,
      source: { type: 'user', userId, origin: { type: 'admin' } },
      posts: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(
      mapGigToFormData({
        gig,
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
        origin: { type: 'admin' },
      },
      isVisible: true,
      version: 0,
    });
  });
});

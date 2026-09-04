import { Types } from 'mongoose';

import type { PlainGig } from '../gig/types/gig.types';
import { mapGigToFormData } from './admin-gig.mapper';

describe('mapGigToFormData', () => {
  it('should map required source without reading legacy suggestedBy', () => {
    const userId = new Types.ObjectId();
    const gig: PlainGig = {
      _id: new Types.ObjectId(),
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

    expect(mapGigToFormData({ gig })).toMatchObject({
      publicId: gig.publicId,
      source: {
        type: 'user',
        userId: String(userId),
        origin: { type: 'admin' },
      },
      isVisible: true,
      version: 0,
    });
  });
});

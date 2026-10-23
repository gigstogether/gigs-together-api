import {
  mapV1GigAroundQuery,
  mapV1GigDatesQuery,
  mapV1GigGetQuery,
  mapVisibleGigDateByPublicIdResultToV1,
  mapVisibleGigDatesResultToV1,
  mapVisibleGigsAroundResultToV1,
  mapVisibleGigsResultToV1,
} from './gig-feed.mapper';
import type { GigFeedItem } from './gig-feed.service';

const gig: GigFeedItem = {
  id: 'radiohead-2026-06-12',
  title: 'Radiohead',
  date: 1_781_264_000_000,
  endDate: 1_781_350_400_000,
  city: 'barcelona',
  country: 'ES',
  venue: 'Palau Sant Jordi',
  ticketsUrl: 'https://tickets.example',
  calendarUrl: 'https://calendar.example',
  posterUrl: 'https://posters.example/radiohead',
  postUrl: 'https://t.me/gigs/1',
};

describe('gigFeedMapper', () => {
  it('should map v1 list query fields to application params', () => {
    expect(
      mapV1GigGetQuery({
        direction: 'prev',
        cursor: 'cursor',
        limit: 20,
        from: 10,
        to: 20,
        city: 'barcelona',
        country: 'ES',
      }),
    ).toEqual({
      direction: 'prev',
      cursor: 'cursor',
      limit: 20,
      from: 10,
      to: 20,
      city: 'barcelona',
      country: 'ES',
    });
  });

  it('should map list result dates and cursors to the v1 response', () => {
    expect(
      mapVisibleGigsResultToV1({
        gigs: [gig],
        prevCursor: 'prev',
        nextCursor: 'next',
      }),
    ).toEqual({
      gigs: [
        {
          ...gig,
          date: '1781264000000',
          endDate: '1781350400000',
        },
      ],
      prevCursor: 'prev',
      nextCursor: 'next',
    });
  });

  it('should map v1 around query and application result', () => {
    expect(
      mapV1GigAroundQuery({
        anchor: 10,
        beforeLimit: 5,
        afterLimit: 6,
        city: 'barcelona',
        country: 'ES',
      }),
    ).toEqual({
      anchor: 10,
      beforeLimit: 5,
      afterLimit: 6,
      city: 'barcelona',
      country: 'ES',
    });
    expect(
      mapVisibleGigsAroundResultToV1({
        before: [gig],
        after: [],
        prevCursor: 'prev',
      }),
    ).toEqual({
      before: [
        {
          ...gig,
          date: '1781264000000',
          endDate: '1781350400000',
        },
      ],
      after: [],
      prevCursor: 'prev',
    });
  });

  it('should map date query and results to the v1 response', () => {
    expect(
      mapV1GigDatesQuery({
        from: 10,
        to: 20,
        city: 'barcelona',
        country: 'ES',
      }),
    ).toEqual({
      from: 10,
      to: 20,
      city: 'barcelona',
      country: 'ES',
    });
    expect(mapVisibleGigDatesResultToV1({ dates: [10, 20] })).toEqual({
      dates: ['10', '20'],
    });
    expect(mapVisibleGigDateByPublicIdResultToV1({ date: 10 })).toEqual({
      date: '10',
    });
  });
});

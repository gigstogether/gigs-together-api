import { Messenger } from '../../shared/types/messenger.enum';
import {
  GigCandidateApprovalValidationError,
  projectGigCandidateSource,
  validateGigCandidateDraftForApproval,
} from './gig-candidate-approval';

describe('validateGigCandidateDraftForApproval', () => {
  it('should return complete normalized Gig data', () => {
    expect(
      validateGigCandidateDraftForApproval({
        title: 'Radiohead',
        date: Date.UTC(2026, 5, 12),
        city: 'Barcelona',
        country: 'ES',
        venue: 'Palau Sant Jordi',
        ticketsUrl: 'https://tickets.example/radiohead',
        poster: { bucketPath: 'posters/radiohead.jpg' },
      }),
    ).toEqual({
      title: 'Radiohead',
      date: Date.UTC(2026, 5, 12),
      city: 'Barcelona',
      country: 'ES',
      venue: 'Palau Sant Jordi',
      ticketsUrl: 'https://tickets.example/radiohead',
      poster: { bucketPath: 'posters/radiohead.jpg' },
    });
  });

  it('should return structured issues for incomplete and invalid fields', () => {
    expect(() =>
      validateGigCandidateDraftForApproval({
        title: '',
        date: Number.NaN,
        city: ' Barcelona ',
        country: 'es',
        ticketsUrl: 'ftp://tickets.example/gig',
        poster: { externalUrl: 'https://images.example/poster.jpg' },
      }),
    ).toThrowError(
      expect.objectContaining({
        name: GigCandidateApprovalValidationError.name,
        issues: expect.arrayContaining([
          expect.objectContaining({ field: 'title', code: 'required' }),
          expect.objectContaining({ field: 'date', code: 'invalid' }),
          expect.objectContaining({ field: 'city', code: 'invalid' }),
          expect.objectContaining({ field: 'country', code: 'invalid' }),
          expect.objectContaining({ field: 'venue', code: 'required' }),
          expect.objectContaining({ field: 'ticketsUrl', code: 'invalid' }),
          expect.objectContaining({ field: 'poster', code: 'invalid' }),
        ]),
      }),
    );
  });

  it('should reject approval when required venue or ticketsUrl is missing', () => {
    expect(() =>
      validateGigCandidateDraftForApproval({
        title: 'Radiohead',
        date: Date.UTC(2026, 5, 12),
        city: 'Barcelona',
        country: 'ES',
      }),
    ).toThrowError(
      expect.objectContaining({
        issues: expect.arrayContaining([
          expect.objectContaining({ field: 'venue', code: 'required' }),
          expect.objectContaining({ field: 'ticketsUrl', code: 'required' }),
        ]),
      }),
    );
  });
});

describe('projectGigCandidateSource', () => {
  it('should exclude messenger identifiers and original submission fields', () => {
    expect(
      projectGigCandidateSource({
        type: 'user',
        userId: '507f1f77bcf86cd799439088',
        origin: {
          type: 'messenger',
          messenger: Messenger.Telegram,
        },
        originalText: 'Private text',
        attachments: [{ bucketPath: 'private/source.png' }],
      }),
    ).toEqual({
      type: 'user',
      userId: '507f1f77bcf86cd799439088',
      origin: { type: 'messenger' },
    });
  });

  it('should keep only the provider reference allowed on Gig', () => {
    const fetchedAt = new Date('2026-08-30T10:00:00.000Z');

    expect(
      projectGigCandidateSource({
        type: 'provider',
        provider: {
          name: 'setlistFm',
          externalEventId: 'provider-event-42',
          sourceUrl: 'https://www.setlist.fm/setlist/example.html',
          fetchedAt,
          externalVersionId: 'revision-3',
        },
      }),
    ).toEqual({
      type: 'provider',
      provider: {
        name: 'setlistFm',
        externalEventId: 'provider-event-42',
        sourceUrl: 'https://www.setlist.fm/setlist/example.html',
        fetchedAt,
        externalVersionId: 'revision-3',
      },
    });
  });
});

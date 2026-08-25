import { BadRequestException } from '@nestjs/common';
import {
  AdminGigCandidateCreateBodyPipe,
  AdminGigCandidateDraftUpdateBodyPipe,
  AdminGigCandidateLookupBodyPipe,
  AdminGigCandidateRejectBodyPipe,
} from './admin-gig-candidate-body.pipe';

describe('AdminGigCandidateCreateBodyPipe', () => {
  it('should parse multipart gigDraft JSON', () => {
    const pipe = new AdminGigCandidateCreateBodyPipe();

    expect(
      pipe.transform({
        gigDraft: JSON.stringify({ title: 'Band', city: 'Barcelona' }),
      }),
    ).toEqual({
      gigDraft: { title: 'Band', city: 'Barcelona' },
    });
  });

  it('should accept an empty gigDraft object', () => {
    const pipe = new AdminGigCandidateCreateBodyPipe();

    expect(pipe.transform({ gigDraft: {} })).toEqual({ gigDraft: {} });
  });

  it('should reject nullable gigDraft fields', () => {
    const pipe = new AdminGigCandidateCreateBodyPipe();

    expect(() => pipe.transform({ gigDraft: { title: null } })).toThrowError(
      /title must be a string/,
    );
  });

  it('should reject source fields outside gigDraft', () => {
    const pipe = new AdminGigCandidateCreateBodyPipe();

    expect(() =>
      pipe.transform({
        gigDraft: {},
        source: { type: 'user' },
      }),
    ).toThrowError(BadRequestException);
  });
});

describe('AdminGigCandidateDraftUpdateBodyPipe', () => {
  it('should parse multipart expectedVersion and gigDraft', () => {
    const pipe = new AdminGigCandidateDraftUpdateBodyPipe();

    expect(
      pipe.transform({ expectedVersion: '2', gigDraft: '{"title":"Band"}' }),
    ).toEqual({ expectedVersion: 2, gigDraft: { title: 'Band' } });
  });

  it('should reject an invalid expectedVersion', () => {
    const pipe = new AdminGigCandidateDraftUpdateBodyPipe();

    expect(() =>
      pipe.transform({ expectedVersion: -1, gigDraft: {} }),
    ).toThrowError(/expectedVersion/);
  });
});

describe('AdminGigCandidateRejectBodyPipe', () => {
  it('should accept only expectedVersion', () => {
    const pipe = new AdminGigCandidateRejectBodyPipe();

    expect(pipe.transform({ expectedVersion: 3 })).toEqual({
      expectedVersion: 3,
    });
  });
});

describe('AdminGigCandidateLookupBodyPipe', () => {
  it('should trim the minimum lookup fields', () => {
    const pipe = new AdminGigCandidateLookupBodyPipe();

    expect(
      pipe.transform({ title: '  Band  ', location: ' Barcelona, ES ' }),
    ).toEqual({ title: 'Band', location: 'Barcelona, ES' });
  });

  it('should reject source data in lookup input', () => {
    const pipe = new AdminGigCandidateLookupBodyPipe();

    expect(() =>
      pipe.transform({
        title: 'Band',
        location: 'Barcelona, ES',
        originalText: 'private submission',
      }),
    ).toThrowError(/unsupported field/);
  });
});

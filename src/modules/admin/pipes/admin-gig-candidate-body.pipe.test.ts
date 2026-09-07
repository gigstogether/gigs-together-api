import { BadRequestException } from '@nestjs/common';
import {
  AdminGigCandidateApproveBodyPipe,
  AdminGigCandidateCreateBodyPipe,
  AdminGigCandidateDraftUpdateBodyPipe,
  AdminGigCandidateLookupBodyPipe,
  AdminGigCandidateRejectBodyPipe,
  AdminGigCandidateSendToModerationBodyPipe,
} from './admin-gig-candidate-body.pipe';

describe('AdminGigCandidateApproveBodyPipe', () => {
  it('should accept only expectedVersion', () => {
    const pipe = new AdminGigCandidateApproveBodyPipe();

    expect(pipe.transform({ expectedVersion: '3' })).toEqual({
      expectedVersion: 3,
    });
    expect(() =>
      pipe.transform({ expectedVersion: 3, status: 'Approved' }),
    ).toThrowError(/unsupported field/);
  });
});

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

describe('AdminGigCandidateSendToModerationBodyPipe', () => {
  it('should accept only expectedVersion', () => {
    const pipe = new AdminGigCandidateSendToModerationBodyPipe();

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

  it('should accept a 300-character title', () => {
    const pipe = new AdminGigCandidateLookupBodyPipe();
    const title = 'A'.repeat(300);

    expect(pipe.transform({ title, location: 'Barcelona, ES' })).toEqual({
      title,
      location: 'Barcelona, ES',
    });
  });

  it('should reject a title longer than 300 characters', () => {
    const pipe = new AdminGigCandidateLookupBodyPipe();

    expect(() =>
      pipe.transform({ title: 'A'.repeat(301), location: 'Barcelona, ES' }),
    ).toThrowError(/between 1 and 300 characters/);
  });
});

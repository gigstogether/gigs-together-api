import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { GigPosterService } from '../../gig/gig-poster/gig-poster.service';
import { GigCandidatePosterService } from './gig-candidate-poster.service';

describe('GigCandidatePosterService', () => {
  const gigPosterService = {
    upload: vi.fn(),
  };

  async function createService(
    defaultGigPosterUrl?: string,
  ): Promise<GigCandidatePosterService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GigCandidatePosterService,
        { provide: GigPosterService, useValue: gigPosterService },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            DEFAULT_GIG_POSTER_URL: defaultGigPosterUrl,
          }),
        },
      ],
    }).compile();

    return module.get(GigCandidatePosterService);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    gigPosterService.upload.mockResolvedValue(undefined);
  });

  it('should upload an explicit poster with GigCandidate storage context', async () => {
    const service = await createService();
    const posterFile = {
      buffer: Buffer.from('poster'),
      mimetype: 'image/jpeg',
    };
    const preparedPosterFile = {
      ...posterFile,
      filename: 'poster.jpg',
    };
    gigPosterService.upload.mockResolvedValue({
      storedPoster: { bucketPath: 'gigs/2026/es/barcelona/gc-candidate-id' },
      posterFile: preparedPosterFile,
    });

    const result = await service.prepareDraftPoster({
      gigCandidateId: 'candidate-id',
      gigDraft: {
        date: Date.UTC(2026, 5, 12),
        city: 'Barcelona',
        country: 'ES',
      },
      posterFile,
      shouldUseDefaultPoster: false,
    });

    expect(gigPosterService.upload).toHaveBeenCalledWith({
      url: undefined,
      file: posterFile,
      context: {
        date: Date.UTC(2026, 5, 12),
        city: 'Barcelona',
        country: 'ES',
        publicId: 'gc-candidate-id',
      },
    });
    expect(result).toEqual({
      gigDraft: {
        date: Date.UTC(2026, 5, 12),
        city: 'Barcelona',
        country: 'ES',
        poster: {
          bucketPath: 'gigs/2026/es/barcelona/gc-candidate-id',
        },
      },
      posterFile: preparedPosterFile,
    });
  });

  it('should preserve the existing poster when no replacement is provided', async () => {
    const service = await createService();
    const existingPoster = { bucketPath: 'gigs/existing-poster' };

    const result = await service.prepareDraftPoster({
      gigCandidateId: 'candidate-id',
      gigDraft: { title: 'Updated title' },
      existingPoster,
      shouldUseDefaultPoster: true,
    });

    expect(gigPosterService.upload).not.toHaveBeenCalled();
    expect(result).toEqual({
      gigDraft: {
        title: 'Updated title',
        poster: existingPoster,
      },
    });
  });

  it('should upload the default poster when moderation requires one', async () => {
    const service = await createService(
      'https://cdn.example/default-poster.jpg',
    );
    gigPosterService.upload.mockResolvedValue({
      storedPoster: { bucketPath: 'gigs/default-poster' },
      posterFile: {
        buffer: Buffer.from('default poster'),
        filename: 'poster.jpg',
        mimetype: 'image/jpeg',
      },
    });

    const result = await service.prepareDraftPoster({
      gigCandidateId: 'candidate-id',
      gigDraft: {},
      shouldUseDefaultPoster: true,
    });

    expect(gigPosterService.upload).toHaveBeenCalledWith({
      url: 'https://cdn.example/default-poster.jpg',
      file: undefined,
      context: {
        date: expect.any(Date),
        city: 'unknown',
        country: 'unknown',
        publicId: 'gc-candidate-id',
      },
    });
    expect(result.gigDraft.poster).toEqual({
      bucketPath: 'gigs/default-poster',
    });
  });

  it('should reject preparation when moderation requires an unavailable poster', async () => {
    const service = await createService();

    await expect(
      service.prepareDraftPoster({
        gigCandidateId: 'candidate-id',
        gigDraft: {},
        shouldUseDefaultPoster: true,
      }),
    ).rejects.toMatchObject({
      constructor: InternalServerErrorException,
      message:
        'Cannot prepare GigCandidate candidate-id for moderation without a poster.',
    });
  });
});

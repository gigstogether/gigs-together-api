import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConfigString } from '../../../shared/utils/env';
import { GigPosterService } from '../../gig/gig-poster/gig-poster.service';
import type {
  GigPosterFile,
  PreparedGigPosterFile,
} from '../../gig/types/gig-poster.types';
import type { GigData, GigPoster } from '../../gig/types/gig.types';

export interface PrepareGigCandidateDraftPosterParams {
  gigCandidateId: string;
  gigDraft: Partial<GigData>;
  posterUrl?: string;
  posterFile?: GigPosterFile;
  existingPoster?: GigPoster;
  shouldUseDefaultPoster: boolean;
}

export interface PreparedGigCandidateDraftPoster {
  gigDraft: Partial<GigData>;
  posterFile?: PreparedGigPosterFile;
}

@Injectable()
export class GigCandidatePosterService {
  private readonly defaultGigPosterUrl: string | undefined;

  constructor(
    private readonly gigPosterService: GigPosterService,
    configService: ConfigService,
  ) {
    this.defaultGigPosterUrl = getConfigString(
      configService,
      'DEFAULT_GIG_POSTER_URL',
    );
  }

  async prepareDraftPoster(
    params: PrepareGigCandidateDraftPosterParams,
  ): Promise<PreparedGigCandidateDraftPoster> {
    const gigDraft = { ...params.gigDraft };
    delete gigDraft.poster;

    const explicitPosterUrl = params.posterUrl?.trim() || undefined;
    let posterUrl = explicitPosterUrl;
    if (
      posterUrl === undefined &&
      params.posterFile === undefined &&
      params.existingPoster === undefined &&
      params.shouldUseDefaultPoster
    ) {
      posterUrl = this.defaultGigPosterUrl;
    }

    let poster = params.existingPoster;
    let preparedPosterFile: PreparedGigPosterFile | undefined;
    if (params.posterFile !== undefined || posterUrl !== undefined) {
      const posterUploadResult = await this.gigPosterService.upload({
        url: posterUrl,
        file: params.posterFile,
        context: {
          date: gigDraft.date ?? new Date(),
          city: gigDraft.city ?? 'unknown',
          country: gigDraft.country ?? 'unknown',
          publicId: `gc-${params.gigCandidateId}`,
        },
      });
      poster = posterUploadResult?.storedPoster;
      preparedPosterFile = posterUploadResult?.posterFile;
    }

    if (poster !== undefined) {
      gigDraft.poster = poster;
    }

    if (params.shouldUseDefaultPoster && gigDraft.poster === undefined) {
      throw new InternalServerErrorException(
        `Cannot prepare GigCandidate ${params.gigCandidateId} for moderation without a poster.`,
      );
    }

    const result: PreparedGigCandidateDraftPoster = { gigDraft };
    if (preparedPosterFile !== undefined) {
      result.posterFile = preparedPosterFile;
    }
    return result;
  }
}

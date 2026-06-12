import { Injectable } from '@nestjs/common';
import { GigService } from '../gig/gig.service';
import { mapGigToFormDataByPublicId } from './admin-gig.mapper';
import { Status } from '../gig/types/status.enum';
import { ADMIN_GIG_LIST_DEFAULT_LIMIT } from '../gig/types/admin-gig-list-sort.types';
import type {
  AdminGigListStatusQuery,
  V1AdminGigsGetQueryDto,
} from './types/requests/v1-admin-gigs-get-query';
import type {
  V1AdminGigListItem,
  V1AdminGigsListResponseBody,
} from './types/requests/v1-admin-gigs-list-response';
import type { GigFormDataByPublicId } from '../gig/types/gig.types';

const STATUS_BY_QUERY: Record<AdminGigListStatusQuery, Status> = {
  pending: Status.Pending,
  published: Status.Published,
  rejected: Status.Rejected,
};

@Injectable()
export class AdminGigService {
  constructor(private readonly gigService: GigService) {}

  async getGigsList(
    query: V1AdminGigsGetQueryDto,
  ): Promise<V1AdminGigsListResponseBody> {
    const status = STATUS_BY_QUERY[query.status];
    const plainGigs = await this.gigService.getGigsByStatus({
      status,
      limit: query.limit ?? ADMIN_GIG_LIST_DEFAULT_LIMIT,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    const gigs: V1AdminGigListItem[] = [];
    for (const plainGig of plainGigs) {
      const posterUrl = this.gigService.resolveGigPosterPublicUrl(
        plainGig.poster,
      );
      const publishPostUrl = await this.gigService.resolvePublishedPostUrl(
        plainGig.posts,
      );
      const formData = mapGigToFormDataByPublicId({
        gig: plainGig,
        posterUrl,
        publishPostUrl,
      });
      gigs.push(this.mapFormDataToListItem(formData));
    }

    return { gigs };
  }

  async getGigByPublicId(publicId: string): Promise<GigFormDataByPublicId> {
    const gig = await this.gigService.getGigByPublicId(publicId);
    const posterUrl = this.gigService.resolveGigPosterPublicUrl(gig.poster);
    const publishPostUrl = await this.gigService.resolvePublishedPostUrl(
      gig.posts,
    );

    return mapGigToFormDataByPublicId({
      gig,
      posterUrl,
      publishPostUrl,
    });
  }

  private mapFormDataToListItem(
    formData: GigFormDataByPublicId,
  ): V1AdminGigListItem {
    const ticketsUrl = formData.ticketsUrl.trim();

    return {
      publicId: formData.publicId,
      title: formData.title,
      status: formData.status,
      date: formData.date,
      endDate: formData.endDate,
      city: formData.city,
      country: formData.country,
      venue: formData.venue,
      posterUrl: formData.posterUrl,
      suggestedBy: formData.suggestedBy,
      ticketsUrl: ticketsUrl.length > 0 ? ticketsUrl : undefined,
      postUrl: formData.publishPostUrl,
      publishPostDate: formData.publishPostDate,
      moderationPostDate: formData.moderationPostDate,
    };
  }
}

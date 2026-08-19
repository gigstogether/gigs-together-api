import { Injectable } from '@nestjs/common';

import { GigCandidateService } from '../gig-candidate/gig-candidate.service';
import { GigCandidatePostType } from '../gig-candidate/types/gig-candidate-post-type.enum';
import type { GigCandidateRecord } from '../gig-candidate/types/gig-candidate.types';
import { GigService } from '../gig/gig.service';
import { Messenger } from '../gig/types/messenger.enum';
import { TelegramService } from '../telegram/telegram.service';
import type { V1AdminGigCandidatesGetQueryDto } from './types/requests/v1-admin-gig-candidates-get-query';
import { mapAdminGigCandidateStatusQuery } from './types/requests/v1-admin-gig-candidates-get-query';
import type {
  V1AdminGigCandidateResponseBody,
  V1AdminGigCandidatesListResponseBody,
} from './types/requests/v1-admin-gig-candidates-response';

@Injectable()
export class AdminGigCandidateService {
  constructor(
    private readonly gigCandidateService: GigCandidateService,
    private readonly gigService: GigService,
    private readonly telegramService: TelegramService,
  ) {}

  async getList(
    query: V1AdminGigCandidatesGetQueryDto,
  ): Promise<V1AdminGigCandidatesListResponseBody> {
    const records = await this.gigCandidateService.findMany({
      status: mapAdminGigCandidateStatusQuery(query.status),
      limit: query.limit ?? 100,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    const gigCandidates = await Promise.all(
      records.map((record) => this.resolve(record)),
    );

    return { gigCandidates };
  }

  async getById(id: string): Promise<V1AdminGigCandidateResponseBody> {
    const record = await this.gigCandidateService.getByIdOrThrow(id);
    return this.resolve(record);
  }

  private async resolve(
    record: GigCandidateRecord,
  ): Promise<V1AdminGigCandidateResponseBody> {
    const suggestionPost = record.posts.find(
      (post) =>
        post.to === Messenger.Telegram &&
        post.type === GigCandidatePostType.Suggestion,
    );
    const suggestionPostUrl = suggestionPost
      ? this.telegramService.getPostUrl({
          chatId: suggestionPost.chatId,
          messageId: suggestionPost.id,
        })
      : undefined;
    const linkedGig = record.gigId
      ? await this.gigService.getGigById(record.gigId)
      : undefined;

    return {
      id: record.id,
      source: record.source,
      title: record.title,
      date: this.formatDate(record.date),
      endDate:
        record.endDate !== undefined
          ? this.formatDate(record.endDate)
          : undefined,
      city: record.city,
      country: record.country,
      venue: record.venue,
      ticketsUrl: record.ticketsUrl,
      posterUrl: this.gigService.resolveGigPosterPublicUrl(record.poster),
      status: record.status,
      suggestedBy: record.suggestedBy,
      suggestionPostUrl,
      suggestionPostDate: suggestionPost?.date,
      linkedGigPublicId: linkedGig?.publicId,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private formatDate(value: number): string {
    return new Date(value).toISOString().slice(0, 10);
  }
}

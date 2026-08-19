import { Injectable } from '@nestjs/common';

import { GigCandidateService } from '../gig-candidate/gig-candidate.service';
import { GigCandidatePostType } from '../gig-candidate/types/gig-candidate-post-type.enum';
import type { GigCandidateRecord } from '../gig-candidate/types/gig-candidate.types';
import { GigService } from '../gig/gig.service';
import { Messenger } from '../gig/types/messenger.enum';
import { TelegramService } from '../telegram/telegram.service';
import type {
  AdminGigCandidateDetails,
  GetAdminGigCandidatesParams,
} from './admin-gig-candidate.types';

@Injectable()
export class AdminGigCandidateService {
  constructor(
    private readonly gigCandidateService: GigCandidateService,
    private readonly gigService: GigService,
    private readonly telegramService: TelegramService,
  ) {}

  async getList(
    params: GetAdminGigCandidatesParams,
  ): Promise<AdminGigCandidateDetails[]> {
    const records = await this.gigCandidateService.findMany({
      status: params.status,
      limit: params.limit,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
    });
    return Promise.all(records.map((record) => this.resolve(record)));
  }

  async getById(id: string): Promise<AdminGigCandidateDetails> {
    const record = await this.gigCandidateService.getByIdOrThrow(id);
    return this.resolve(record);
  }

  private async resolve(
    record: GigCandidateRecord,
  ): Promise<AdminGigCandidateDetails> {
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
      date: record.date,
      endDate: record.endDate,
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
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

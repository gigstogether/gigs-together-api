import { Injectable } from '@nestjs/common';

import { GigCandidateService } from '../gig-candidate/gig-candidate.service';
import { GigCandidatePostType } from '../gig-candidate/types/gig-candidate-post-type.enum';
import type { GigCandidate } from '../gig-candidate/types/gig-candidate.types';
import { GigService } from '../gig/gig.service';
import { Messenger } from '../../shared/types/messenger.enum';
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
    const gigCandidates = await this.gigCandidateService.findMany({
      status: params.status,
      limit: params.limit,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
    });
    return Promise.all(
      gigCandidates.map((gigCandidate) => this.resolve(gigCandidate)),
    );
  }

  async getById(gigCandidateId: string): Promise<AdminGigCandidateDetails> {
    const gigCandidate =
      await this.gigCandidateService.getByIdOrThrow(gigCandidateId);
    return this.resolve(gigCandidate);
  }

  private async resolve(
    gigCandidate: GigCandidate,
  ): Promise<AdminGigCandidateDetails> {
    const suggestionPost = gigCandidate.posts.find(
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
    const linkedGig = gigCandidate.gigId
      ? await this.gigService.getGigById(gigCandidate.gigId)
      : undefined;

    return {
      id: gigCandidate.id,
      source: gigCandidate.source,
      gigDraft: gigCandidate.gigDraft,
      version: gigCandidate.version,
      posterUrl: this.gigService.resolveGigPosterPublicUrl(
        gigCandidate.gigDraft.poster,
      ),
      status: gigCandidate.status,
      postUrl: suggestionPostUrl,
      postDate: suggestionPost?.date,
      linkedGigPublicId: linkedGig?.publicId,
      approvedAt: gigCandidate.approvedAt,
      approvedByUserId: gigCandidate.approvedByUserId,
      rejectedAt: gigCandidate.rejectedAt,
      rejectedByUserId: gigCandidate.rejectedByUserId,
      createdAt: gigCandidate.createdAt,
      updatedAt: gigCandidate.updatedAt,
    };
  }
}

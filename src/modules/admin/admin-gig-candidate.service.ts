import { Injectable } from '@nestjs/common';

import { Messenger } from '../../shared/types/messenger.enum';
import { GigCandidateService } from '../gig-candidate/gig-candidate.service';
import type { GigCandidate } from '../gig-candidate/types/gig-candidate.types';
import { GigService } from '../gig/gig.service';
import { PostType } from '../../shared/types/post-type.enum';
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
    const gigCandidates = await this.gigCandidateService.findMany(params);
    return Promise.all(
      gigCandidates.map((gigCandidate) =>
        this.resolveGigCandidate(gigCandidate),
      ),
    );
  }

  async getById(gigCandidateId: string): Promise<AdminGigCandidateDetails> {
    const gigCandidate =
      await this.gigCandidateService.getByIdOrThrow(gigCandidateId);
    return this.resolveGigCandidate(gigCandidate);
  }

  async resolveGigCandidate(
    gigCandidate: GigCandidate,
  ): Promise<AdminGigCandidateDetails> {
    const intakePost = gigCandidate.posts.find(
      (post) => post.to === Messenger.Telegram && post.type === PostType.Intake,
    );
    const moderationPost = gigCandidate.posts.find(
      (post) =>
        post.to === Messenger.Telegram && post.type === PostType.Moderation,
    );
    const intakePostUrl = intakePost
      ? this.telegramService.getPostUrl({
          chatId: intakePost.chatId,
          messageId: intakePost.id,
        })
      : undefined;
    const moderationPostUrl = moderationPost
      ? this.telegramService.getPostUrl({
          chatId: moderationPost.chatId,
          messageId: moderationPost.id,
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
      intakePostUrl,
      intakePostDate: intakePost?.date,
      moderationPostUrl,
      moderationPostDate: moderationPost?.date,
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

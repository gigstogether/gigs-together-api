import { Injectable } from '@nestjs/common';

import { Messenger } from '../../shared/types/messenger.enum';
import { GigCandidateService } from '../gig-candidate/gig-candidate.service';
import type { GigCandidate } from '../gig-candidate/types/gig-candidate.types';
import { GigService } from '../gig/gig.service';
import type { PlainGig } from '../gig/types/gig.types';
import { PostType } from '../../shared/types/post-type.enum';
import { TelegramService } from '../telegram/telegram.service';
import { UserService } from '../user/user.service';
import type { User } from '../user/types/user.types';
import { getUserSourceProfile } from './admin-user-source-profile';
import type {
  AdminGigCandidateDetails,
  GigCandidateSourceForAdminView,
  GetAdminGigCandidatesParams,
} from './admin-gig-candidate.types';

@Injectable()
export class AdminGigCandidateService {
  constructor(
    private readonly gigCandidateService: GigCandidateService,
    private readonly gigService: GigService,
    private readonly telegramService: TelegramService,
    private readonly userService: UserService,
  ) {}

  async getList(
    params: GetAdminGigCandidatesParams,
  ): Promise<AdminGigCandidateDetails[]> {
    const gigCandidates = await this.gigCandidateService.findMany(params);
    const [activeSourceUsersById, linkedGigsById] = await Promise.all([
      this.getActiveSourceUsersById(gigCandidates),
      this.getLinkedGigsById(gigCandidates),
    ]);
    return gigCandidates.map((gigCandidate) =>
      this.resolveGigCandidateWithUsers(
        gigCandidate,
        activeSourceUsersById,
        gigCandidate.gigId ? linkedGigsById.get(gigCandidate.gigId) : undefined,
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
    const [activeSourceUsersById, linkedGig] = await Promise.all([
      this.getActiveSourceUsersById([gigCandidate]),
      gigCandidate.gigId
        ? this.gigService.getGigById(gigCandidate.gigId)
        : Promise.resolve(undefined),
    ]);
    return this.resolveGigCandidateWithUsers(
      gigCandidate,
      activeSourceUsersById,
      linkedGig,
    );
  }

  private resolveGigCandidateWithUsers(
    gigCandidate: GigCandidate,
    activeSourceUsersById: ReadonlyMap<string, User>,
    linkedGig: PlainGig | undefined,
  ): AdminGigCandidateDetails {
    const intakePost = gigCandidate.posts.find(
      (post) => post.to === Messenger.Telegram && post.type === PostType.Intake,
    );
    const gigCandidateModerationPost = gigCandidate.posts.find(
      (post) =>
        post.to === Messenger.Telegram && post.type === PostType.Moderation,
    );
    const linkedGigModerationPost = linkedGig?.posts.find(
      (post) =>
        post.to === Messenger.Telegram && post.type === PostType.Moderation,
    );
    const moderationPost =
      gigCandidateModerationPost ?? linkedGigModerationPost;
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
    const source = this.resolveSource(gigCandidate, activeSourceUsersById);

    return {
      id: gigCandidate.id,
      source,
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

  private resolveSource(
    gigCandidate: GigCandidate,
    activeSourceUsersById: ReadonlyMap<string, User>,
  ): GigCandidateSourceForAdminView {
    if (gigCandidate.source.type === 'provider') {
      return gigCandidate.source;
    }

    return {
      ...gigCandidate.source,
      ...getUserSourceProfile(
        activeSourceUsersById.get(gigCandidate.source.userId),
      ),
    };
  }

  private async getActiveSourceUsersById(
    gigCandidates: readonly GigCandidate[],
  ): Promise<ReadonlyMap<string, User>> {
    const userIds = gigCandidates.flatMap((gigCandidate) =>
      gigCandidate.source.type === 'user' ? [gigCandidate.source.userId] : [],
    );
    const users = await this.userService.findActiveUsersByIds(userIds);
    return new Map(users.map((user) => [user.id, user]));
  }

  private async getLinkedGigsById(
    gigCandidates: readonly GigCandidate[],
  ): Promise<ReadonlyMap<string, PlainGig>> {
    const gigIds = [
      ...new Set(
        gigCandidates.flatMap((gigCandidate) =>
          gigCandidate.gigId ? [gigCandidate.gigId] : [],
        ),
      ),
    ];
    const gigs = await this.gigService.getGigsByIds(gigIds);
    return new Map(gigs.map((gig) => [gig._id.toString(), gig]));
  }
}

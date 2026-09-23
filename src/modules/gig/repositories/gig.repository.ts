import type { PostType } from '../../../shared/types/post-type.enum';
import type {
  AdminGigListSortBy,
  AdminGigListSortOrder,
} from '../types/admin-gig-list-sort.types';
import type { GigPost, GigPoster, PlainGig } from '../types/gig.types';

export const GIG_REPOSITORY = Symbol('GIG_REPOSITORY');

export interface IsGigPublicIdTakenParams {
  publicId: string;
  excludeGigId?: string;
}

export interface FindGigsParams {
  limit: number;
  sortBy?: AdminGigListSortBy;
  sortOrder?: AdminGigListSortOrder;
}

export interface UpdateGigByPublicIdRecordParams {
  publicId: string;
  expectedVersion: number;
  title: string;
  date: number;
  endDate?: number;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  poster?: GigPoster;
}

export interface UpdateGigVisibilityRecordParams {
  publicId: string;
  expectedVersion: number;
  isVisible: boolean;
}

export interface AppendGigMainPostRecordParams {
  gigId: string;
  expectedVersion: number;
  post: GigPost;
}

export interface UpdateGigTelegramPostFileIdRecordParams {
  gigId: string;
  expectedVersion: number;
  type: PostType;
  messageId: number;
  chatId: number;
  fileId: string;
}

export interface FindVisibleGigsInRangeParams {
  from: number;
  to?: number;
  city?: string;
  country?: string;
}

export interface GigPageCursor {
  date: number;
  gigId: string;
}

export type GigPageDirection = 'next' | 'prev';

export interface FindVisibleGigsPageParams extends FindVisibleGigsInRangeParams {
  limit: number;
  direction: GigPageDirection;
  cursor?: GigPageCursor;
}

export interface FindVisibleGigsPageResult {
  gigs: PlainGig[];
  hasMore: boolean;
}

export interface FindVisibleGigsAroundParams {
  anchor: number;
  todayStart: number;
  beforeLimit: number;
  afterLimit: number;
  city?: string;
  country?: string;
}

export interface FindVisibleGigsAroundResult {
  before: PlainGig[];
  after: PlainGig[];
  hasPrevious: boolean;
  hasNext: boolean;
}

export interface GigRepository {
  existsByPublicId(publicId: string): Promise<boolean>;
  isPublicIdTaken(params: IsGigPublicIdTakenParams): Promise<boolean>;
  countAll(): Promise<number>;
  countVisible(): Promise<number>;
  findMany(params: FindGigsParams): Promise<PlainGig[]>;
  findByPublicId(publicId: string): Promise<PlainGig | null>;
  findById(gigId: string): Promise<PlainGig | null>;
  findByIds(gigIds: string[]): Promise<PlainGig[]>;
  updateByPublicId(
    params: UpdateGigByPublicIdRecordParams,
  ): Promise<PlainGig | null>;
  updateVisibility(
    params: UpdateGigVisibilityRecordParams,
  ): Promise<PlainGig | null>;
  appendMainPost(
    params: AppendGigMainPostRecordParams,
  ): Promise<PlainGig | null>;
  updateTelegramPostFileId(
    params: UpdateGigTelegramPostFileIdRecordParams,
  ): Promise<PlainGig | null>;
  findVisibleInRange(params: FindVisibleGigsInRangeParams): Promise<PlainGig[]>;
  findVisiblePage(
    params: FindVisibleGigsPageParams,
  ): Promise<FindVisibleGigsPageResult>;
  findVisibleDateByPublicId(publicId: string): Promise<number | null>;
  findVisibleAround(
    params: FindVisibleGigsAroundParams,
  ): Promise<FindVisibleGigsAroundResult>;
  findVisibleDates(params: FindVisibleGigsInRangeParams): Promise<number[]>;
}

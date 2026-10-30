import type { Messenger } from '@shared/types/messenger.enum';
import type { PostType } from '@shared/types/post-type.enum';
import type { ProviderReference } from '@shared/types/provider-reference.types';
import type { GigSourceType } from './gig-source-type.enum';
import type { GigSourceUserOriginType } from './gig-source-user-origin-type.enum';

export type GigId = string;

export interface GigPost {
  to: Messenger;
  type: PostType;
  date: number;
  id: number;
  chatId: number;
  fileId?: string;
}

export interface GigPoster {
  bucketPath?: string;
  externalUrl?: string;
}

/** Domain Gig representation used outside the persistence layer. */
export interface PlainGig {
  id: GigId;
  publicId: string;
  title: string;
  date: number;
  endDate?: number;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  poster?: GigPoster;
  isVisible: boolean;
  version: number;
  source: GigSource;
  posts: GigPost[];
  createdAt: Date;
  updatedAt: Date;
}

export interface V1GetGigsResponseBodyGig {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  calendarUrl: string;
  posterUrl?: string;
  postUrl?: string;
}

interface GigPosterInput {
  bucketPath?: string;
  externalUrl?: string;
}

export interface GigData {
  title: string;
  date: number;
  endDate?: number;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  poster?: GigPosterInput;
}

interface GigSourceUserIdentifiedOrigin {
  type: GigSourceUserOriginType.Form | GigSourceUserOriginType.Admin;
}

interface GigSourceUserMessengerOrigin {
  type: GigSourceUserOriginType.Messenger;
  messenger: Messenger;
}

export interface GigSourceIdentifiedUser {
  type: GigSourceType.User;
  userId: string;
  origin: GigSourceUserIdentifiedOrigin;
}

export interface GigSourceMessengerUser {
  type: GigSourceType.User;
  userId?: string;
  origin: GigSourceUserMessengerOrigin;
}

type GigSourceUser = GigSourceIdentifiedUser | GigSourceMessengerUser;

export interface GigSourceProvider {
  type: GigSourceType.Provider;
  provider: ProviderReference;
}

export type GigSource = GigSourceUser | GigSourceProvider;

interface GigSourceUserProfile {
  displayName?: string;
  isCurrentlyAdmin: boolean;
  telegramUsername?: string;
}

type GigSourceUserWithProfile = GigSourceUser & GigSourceUserProfile;

export type GigSourceForAdminView =
  GigSourceUserWithProfile | GigSourceProvider;

export interface GigCalendarSource {
  title: string;
  date: number;
  endDate?: number;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
}

export interface GigFormInput {
  title: string;
  date: string;
  endDate?: string;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  posterUrl?: string;
}

export interface GigFormData {
  publicId: string;
  title: string;
  date: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  posterUrl?: string;
  isVisible: boolean;
  version: number;
  source: GigSourceForAdminView;
  mainPostUrl?: string;
  mainPostDate?: number;
  moderationPostUrl?: string;
  moderationPostDate?: number;
}

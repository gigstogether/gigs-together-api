import type { Types } from 'mongoose';
import type { GigPost, GigPoster, GigStoredSource } from '../gig.schema';
import type { ProviderReference } from '../../gig-candidate/types/gig-candidate.types';

export type GigId = string | Types.ObjectId;

/** Plain gig payload from MongoDB. */
export interface PlainGig {
  _id: Types.ObjectId;
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
  source: GigStoredSource;
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

export interface GigPosterInput {
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

export interface GigSourceUserOrigin {
  type: 'form' | 'admin' | 'messenger';
}

export interface GigSourceUser {
  type: 'user';
  userId: string;
  origin: GigSourceUserOrigin;
}

export interface GigSourceProvider {
  type: 'provider';
  provider: ProviderReference;
}

export type GigSource = GigSourceUser | GigSourceProvider;

export interface GigSourceUserWithProfile extends GigSourceUser {
  displayName?: string;
  isCurrentlyAdmin: boolean;
  telegramUsername?: string;
}

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

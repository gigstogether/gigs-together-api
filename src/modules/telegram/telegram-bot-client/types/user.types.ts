export interface TGUser {
  id: number;
  first_name: string;
  last_name?: string;
  is_bot?: boolean;
  username?: string;
  language_code?: string;
  /** Login Widget only; HTTPS URL when present. */
  photo_url?: string;

  [key: string]: unknown;
}

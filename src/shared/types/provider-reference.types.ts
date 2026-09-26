export interface ProviderReference {
  name: string;
  externalEventId: string;
  externalVersionId?: string;
  sourceUrl: string;
  fetchedAt: Date;
  providerUpdatedAt?: Date;
}

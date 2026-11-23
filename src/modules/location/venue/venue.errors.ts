export class VenueNameConflictError extends Error {
  cause?: unknown;

  constructor(cause?: unknown) {
    super('A Venue with this name already exists in the Locality');
    this.name = 'VenueNameConflictError';

    if (cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: cause,
        enumerable: false,
        configurable: true,
      });
    }
  }
}

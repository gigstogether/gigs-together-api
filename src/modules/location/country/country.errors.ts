export class CountryIsoConflictError extends Error {
  cause?: unknown;

  constructor(cause?: unknown) {
    super('A Country with this ISO code already exists');
    this.name = 'CountryIsoConflictError';

    if (cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: cause,
        enumerable: false,
        configurable: true,
      });
    }
  }
}

export class PlaceNameConflictError extends Error {
  cause?: unknown;

  constructor(cause?: unknown) {
    super('A Place with this name already exists in the Locality');
    this.name = 'PlaceNameConflictError';

    if (cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: cause,
        enumerable: false,
        configurable: true,
      });
    }
  }
}

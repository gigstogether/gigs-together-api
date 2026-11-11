export class LocalityNameConflictError extends Error {
  cause?: unknown;

  constructor(cause?: unknown) {
    super('A Locality with this name already exists in the Region');
    this.name = 'LocalityNameConflictError';

    if (cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: cause,
        enumerable: false,
        configurable: true,
      });
    }
  }
}

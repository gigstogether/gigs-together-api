export class LocalityNameConflictError extends Error {
  cause?: unknown;

  constructor(cause?: unknown) {
    super(
      'A Locality with this name and qualifier already exists in the Country',
    );
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

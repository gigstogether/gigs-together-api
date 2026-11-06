export class RegionNameConflictError extends Error {
  cause?: unknown;

  constructor(cause?: unknown) {
    super('A Region with this name already exists in the Country');
    this.name = 'RegionNameConflictError';

    if (cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: cause,
        enumerable: false,
        configurable: true,
      });
    }
  }
}

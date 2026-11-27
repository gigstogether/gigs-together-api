export class CommunityRouteConflictError extends Error {
  constructor(cause: unknown) {
    super('A Community with this country and slug already exists');
    this.name = CommunityRouteConflictError.name;
    Object.defineProperty(this, 'cause', { value: cause, enumerable: false });
  }
}

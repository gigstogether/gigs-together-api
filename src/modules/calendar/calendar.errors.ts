export interface CalendarEventCreationErrorParams {
  message: string;
  cause: unknown;
  provider: string;
  providerOperation: string;
  status?: number;
  code?: string | number;
  hint?: string;
}

export class CalendarEventCreationError extends Error {
  cause: unknown;
  provider: string;
  providerOperation: string;
  status?: number;
  code?: string | number;
  hint?: string;

  constructor(params: CalendarEventCreationErrorParams) {
    super(params.message);
    this.name = CalendarEventCreationError.name;
    // Keep cause non-enumerable to prevent upstream details from leaking through serialization.
    Object.defineProperty(this, 'cause', {
      value: params.cause,
      configurable: true,
      enumerable: false,
      writable: true,
    });
    this.provider = params.provider;
    this.providerOperation = params.providerOperation;
    if (params.status !== undefined) {
      this.status = params.status;
    }
    if (params.code !== undefined) {
      this.code = params.code;
    }
    if (params.hint !== undefined) {
      this.hint = params.hint;
    }
  }
}

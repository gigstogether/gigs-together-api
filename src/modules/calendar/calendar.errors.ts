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
    this.cause = params.cause;
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

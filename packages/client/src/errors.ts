export class ClientError extends Error {
  override readonly name: string = "ClientError";
}

export class HttpError extends ClientError {
  override readonly name = "HttpError";
  constructor(
    readonly status: number,
    readonly path: string,
    message: string,
    /** rh's `code`, or its share routes' `reason`. */
    readonly code?: string,
    /** The 1-based session numbers a receive refusal names. */
    readonly sessions?: number[],
    /** What a remote server answered rh, when a share refusal passes it on. */
    readonly upstreamStatus?: number,
  ) {
    super(`${status} ${path}: ${message}`);
  }
}

/** A sensitive route needs a login newer than `gateway.fresh_login_secs` (rivethub-runtime CONTRACT note 147). */
export class ReauthRequiredError extends ClientError {
  override readonly name = "ReauthRequiredError";
  constructor(readonly path: string) {
    super(`${path} needs a fresh sign-in`);
  }
}

export class RouteMissingError extends ClientError {
  override readonly name = "RouteMissingError";
  constructor(readonly path: string) {
    super(`the runtime does not serve ${path}`);
  }
}

export class NetworkError extends ClientError {
  override readonly name = "NetworkError";
  constructor(
    readonly path: string,
    cause: unknown,
  ) {
    super(`could not reach the runtime for ${path}`, { cause });
  }
}

export class MalformedResponseError extends ClientError {
  override readonly name = "MalformedResponseError";
  constructor(
    readonly path: string,
    readonly issues: string,
  ) {
    super(`malformed response from ${path}: ${issues}`);
  }
}

export class NotFoundError extends ClientError {
  override readonly name = "NotFoundError";
  constructor(what: string) {
    super(`${what} was not found`);
  }
}

export class UnreadableSummaryError extends ClientError {
  override readonly name = "UnreadableSummaryError";
  constructor() {
    super("This hub sent summaries this app can’t read.");
  }
}

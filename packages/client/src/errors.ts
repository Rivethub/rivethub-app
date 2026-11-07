export class ClientError extends Error {
  override readonly name: string = "ClientError";
}

export class HttpError extends ClientError {
  override readonly name = "HttpError";
  constructor(
    readonly status: number,
    readonly path: string,
    message: string,
    readonly code?: string,
  ) {
    super(`${status} ${path}: ${message}`);
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

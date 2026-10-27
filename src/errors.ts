/** Fields shared by all errors of this SDK. */
export interface AdLibErrorOptions {
  /** HTTP status code. Undefined for errors raised before or without a response. */
  status?: number;
  /** Machine-readable code from the API, e.g. not_found, rate_limited, quota_exceeded, unsupported. */
  code?: string;
  /** X-Request-Id of the failed call (from the body or the header). Quote it in support requests. */
  requestId?: string;
  /** Whether the call was billed. The API never bills errors, so this is false for API errors. */
  billed?: boolean;
  /** The platform that failed, for upstream errors. */
  platform?: string;
  /** Extra detail lines from the API (e.g. validation errors). */
  details?: string[];
  /** Parsed response body (JSON) or raw text. */
  body?: unknown;
  /** Response headers. */
  headers?: Headers;
  /** Underlying error, e.g. the network error from fetch. */
  cause?: unknown;
}

/** Base class for every error thrown by this SDK. */
export class AdLibError extends Error {
  readonly status: number | undefined;
  readonly code: string | undefined;
  readonly requestId: string | undefined;
  readonly billed: boolean | undefined;
  readonly platform: string | undefined;
  readonly details: string[] | undefined;
  readonly body: unknown;
  readonly headers: Headers | undefined;

  constructor(message: string, options: AdLibErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.billed = options.billed;
    this.platform = options.platform;
    this.details = options.details;
    this.body = options.body;
    this.headers = options.headers;
  }
}

/** The API answered with an error status. More specific subclasses exist for common cases. */
export class APIError extends AdLibError {}

/** 400 or 422: invalid parameters. Code `unsupported` means the platform cannot do this query or filter. Also thrown for invalid arguments caught before a request is sent. */
export class ValidationError extends APIError {}

/** 401: the API key is missing or wrong. Also thrown when no key is configured. */
export class AuthenticationError extends APIError {}

/**
 * 403: the key is disabled or not allowed to make this call. Code `history_limit` means the ad is
 * older than your plan's archive window (free 90 days, starter 365 days, growth and up unlimited).
 */
export class PermissionDeniedError extends APIError {}

/** 402: no credits left on the account. */
export class InsufficientCreditsError extends APIError {}

/** 404: unknown ad, advertiser, job, watchlist or delivery id. */
export class NotFoundError extends APIError {}

/** 429: too many requests (code rate_limited). `retryAfter` is the wait in seconds from Retry-After. */
export class RateLimitError extends APIError {
  readonly retryAfter: number | undefined;

  constructor(message: string, options: AdLibErrorOptions & { retryAfter?: number } = {}) {
    super(message, options);
    this.retryAfter = options.retryAfter;
  }
}

/** 429 with code quota_exceeded: the monthly credit quota of the plan is used up. Never retried. */
export class QuotaExceededError extends RateLimitError {}

/** 5xx. 502 and 503 usually mean an ad platform failed or is paused; retry later or use source: "history". */
export class ServerError extends APIError {}

/** The request never got a response: DNS, connection reset, TLS, etc. */
export class ConnectionError extends AdLibError {}

/** The request took longer than `timeoutMs`. */
export class TimeoutError extends ConnectionError {}

/** A webhook signature is missing, malformed, too old, or does not match. */
export class WebhookSignatureError extends AdLibError {}

/**
 * Parses a Retry-After header (seconds or an HTTP date) into seconds.
 * Returns undefined when the header is missing or unparseable.
 */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

interface ParsedError {
  code?: string;
  message?: string;
  requestId?: string;
  billed?: boolean;
  platform?: string;
  details?: string[];
}

/** Reads {"error":{code,message,request_id,billed,platform,details}}; tolerates {"error":"..."} and plain text. */
function parseErrorBody(body: unknown): ParsedError {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const err = (body as Record<string, unknown>).error;
    if (err && typeof err === "object" && !Array.isArray(err)) {
      const e = err as Record<string, unknown>;
      const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
      return {
        code: str(e.code),
        message: str(e.message),
        requestId: str(e.request_id),
        billed: typeof e.billed === "boolean" ? e.billed : undefined,
        platform: str(e.platform),
        details: Array.isArray(e.details) ? e.details.filter((d): d is string => typeof d === "string") : undefined,
      };
    }
    if (typeof err === "string" && err.trim()) return { message: err.trim() };
    const msg = (body as Record<string, unknown>).message;
    if (typeof msg === "string" && msg.trim()) return { message: msg.trim() };
    return {};
  }
  if (typeof body === "string" && body.trim()) {
    const t = body.trim();
    return { message: t.length > 500 ? `${t.slice(0, 500)}...` : t };
  }
  return {};
}

const DEFAULT_MESSAGES: Record<number, string> = {
  400: "Bad request",
  401: "Authentication failed: check your API key",
  402: "No credits left on this account",
  403: "Access denied: the key may be disabled",
  404: "Not found",
  422: "Invalid parameters",
  429: "Rate limit exceeded",
};

/** Maps an HTTP error response to the matching error class. */
export function errorFromResponse(status: number, body: unknown, headers?: Headers): APIError {
  const parsed = parseErrorBody(body);
  const fallback = DEFAULT_MESSAGES[status] ?? (status >= 500 ? "Server error" : "Request failed");
  const codePart = parsed.code ? ` (${parsed.code})` : "";
  const message = `${status}${codePart} ${parsed.message ?? fallback}`;
  const options: AdLibErrorOptions = {
    status,
    code: parsed.code,
    requestId: parsed.requestId ?? headers?.get("x-request-id") ?? undefined,
    billed: parsed.billed,
    platform: parsed.platform,
    details: parsed.details,
    body,
    headers,
  };

  if (status === 400 || status === 422) return new ValidationError(message, options);
  if (status === 401) return new AuthenticationError(message, options);
  if (status === 402) return new InsufficientCreditsError(message, options);
  if (status === 403) return new PermissionDeniedError(message, options);
  if (status === 404) return new NotFoundError(message, options);
  if (status === 429) {
    const retryAfter = parseRetryAfter(headers?.get("retry-after"));
    if (parsed.code === "quota_exceeded") return new QuotaExceededError(message, { ...options, retryAfter });
    return new RateLimitError(message, { ...options, retryAfter });
  }
  if (status >= 500) return new ServerError(message, options);
  return new APIError(message, options);
}

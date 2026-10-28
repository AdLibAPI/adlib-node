import {
  AdLibError,
  AuthenticationError,
  ConnectionError,
  QuotaExceededError,
  RateLimitError,
  TimeoutError,
  ValidationError,
  errorFromResponse,
} from "./errors.js";
import { paginate, paginateItems, type Page, type PageMethod, type PageParams, type PaginateOptions } from "./pagination.js";
import { Ads } from "./resources/ads.js";
import { Advertisers } from "./resources/advertisers.js";
import { Batch } from "./resources/batch.js";
import { Companies } from "./resources/companies.js";
import { Domains } from "./resources/domains.js";
import { Watchlists } from "./resources/watchlists.js";
import { Webhooks } from "./resources/webhooks.js";
import type {
  AdList,
  CoverageResponse,
  CursorPage,
  LibraryUrlResponse,
  PlatformsResponse,
  QueryValue,
  RequestOptions,
  StatusResponse,
  UsageResponse,
} from "./types.js";
import type { SearchParams } from "./resources/ads.js";
import { nonEmpty } from "./resources/shared.js";
import { VERSION } from "./version.js";

export const DEFAULT_BASE_URL = "https://api.adlibapi.com";
export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 8_000;
const MAX_RETRY_AFTER_MS = 60_000;
const RETRYABLE_STATUS = new Set([502, 503, 504]);

export type HTTPMethod = "GET" | "POST" | "PATCH" | "DELETE";

/** Billing and rate-limit headers of a successful response. */
export interface ResponseInfo {
  method: HTTPMethod;
  url: string;
  status: number;
  /** X-Request-Id */
  requestId: string | undefined;
  /** X-Billing-Credits: what this call cost. Empty results, cached results and platform errors are free. */
  billedCredits: number | undefined;
  /** X-RateLimit-Limit: requests per minute of your plan. */
  rateLimitLimit: number | undefined;
  /** X-RateLimit-Remaining: requests left in the current minute. */
  rateLimitRemaining: number | undefined;
  /** X-RateLimit-Reset: seconds until the window resets. */
  rateLimitReset: number | undefined;
  headers: Headers;
}

export interface ClientOptions {
  /** AdLib API key, sent as X-API-Key. Defaults to the ADLIB_API_KEY environment variable. */
  apiKey?: string;
  /**
   * API base URL. Defaults to ADLIB_BASE_URL, else https://api.adlibapi.com. A trailing /v1 is
   * ignored.
   */
  baseUrl?: string;
  /** Timeout per attempt in milliseconds. Default 120000 (live searches over all platforms can be slow). */
  timeoutMs?: number;
  /**
   * Retries for 429 rate_limited (honouring Retry-After) on every request, and for 502, 503, 504,
   * timeouts and network errors on GET, PATCH and DELETE. Default 2. POSTs are not retried after they may
   * have reached the API, and quota_exceeded is never retried.
   */
  maxRetries?: number;
  /** Base delay for exponential backoff in milliseconds. Default 500. */
  retryDelayMs?: number;
  /** Custom fetch implementation. Defaults to the global fetch (Node 18+). */
  fetch?: typeof fetch;
  /** Called after every successful response, e.g. to log `billedCredits`. */
  onResponse?: (info: ResponseInfo) => void;
}

/** A request against the API. */
export interface APIRequest {
  method?: HTTPMethod;
  /** Path with parameters already filled in, e.g. /v1/advertisers/meta%3A123 */
  path: string;
  query?: Record<string, QueryValue>;
  /** Sent as JSON. Undefined values are dropped. */
  body?: Record<string, unknown>;
}

function readEnv(name: string): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

function nonNegativeInt(name: string, value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 0) throw new ValidationError(`${name} must be a non-negative integer`);
  return value;
}

function positiveNumber(name: string, value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!(typeof value === "number" && value > 0)) throw new ValidationError(`${name} must be a positive number`);
  return value;
}

/** Strips trailing slashes and a trailing /v1. */
export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
}

/** Joins a base URL, a path and query parameters. Undefined, null and empty values are dropped. */
export function buildUrl(baseUrl: string, req: Pick<APIRequest, "path" | "query">): string {
  const path = req.path.startsWith("/") ? req.path : `/${req.path}`;
  const url = new URL(baseUrl + path);
  for (const [key, value] of Object.entries(req.query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function headerInt(headers: Headers, name: string): number | undefined {
  const raw = headers.get(name);
  if (raw == null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * AdLib API client.
 *
 * ```ts
 * import { AdLib } from "adlib-api";
 * const adlib = new AdLib({ apiKey: process.env.ADLIB_API_KEY });
 * const { data } = await adlib.advertisers.resolve({ domain: "nike.com" });
 * ```
 */
export class AdLib {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly retryDelayMs: number;

  readonly ads: Ads;
  readonly advertisers: Advertisers;
  readonly companies: Companies;
  readonly domains: Domains;
  readonly batch: Batch;
  readonly watchlists: Watchlists;
  readonly webhooks: Webhooks;

  readonly #apiKey: string;
  readonly #fetch: typeof fetch;
  readonly #onResponse: ((info: ResponseInfo) => void) | undefined;

  constructor(options: ClientOptions = {}) {
    const key = options.apiKey?.trim() || readEnv("ADLIB_API_KEY");
    if (!key) {
      throw new AuthenticationError("No API key found. Pass { apiKey } or set ADLIB_API_KEY.");
    }
    this.#apiKey = key;
    this.baseUrl = normalizeBaseUrl(options.baseUrl?.trim() || readEnv("ADLIB_BASE_URL") || DEFAULT_BASE_URL);
    this.timeoutMs = positiveNumber("timeoutMs", options.timeoutMs, DEFAULT_TIMEOUT_MS);
    this.maxRetries = nonNegativeInt("maxRetries", options.maxRetries, DEFAULT_MAX_RETRIES);
    this.retryDelayMs = nonNegativeInt("retryDelayMs", options.retryDelayMs, DEFAULT_RETRY_DELAY_MS);
    this.#onResponse = options.onResponse;

    const f = options.fetch ?? (globalThis.fetch as typeof fetch | undefined);
    if (typeof f !== "function") throw new AdLibError("No fetch implementation found. Use Node 18+ or pass { fetch }.");
    this.#fetch = f;

    this.ads = new Ads(this);
    this.advertisers = new Advertisers(this);
    this.companies = new Companies(this);
    this.domains = new Domains(this);
    this.batch = new Batch(this);
    this.watchlists = new Watchlists(this);
    this.webhooks = new Webhooks(this);
  }

  /** Searches ads. Same as `ads.search`. Paginated. */
  search(params: SearchParams, options?: RequestOptions): Promise<AdList> {
    return this.ads.search(params, options);
  }

  /** Your billed credits per day and endpoint. `days` 1 to 92, default 30. */
  usage(params: { days?: number } = {}, options?: RequestOptions): Promise<UsageResponse> {
    return this.request({ path: "/v1/usage", query: { days: params.days } }, options);
  }

  /** Health per platform (success rate, latency, last smoke test). No key needed, not billed. */
  status(options?: RequestOptions): Promise<StatusResponse> {
    return this.request({ path: "/v1/status" }, options);
  }

  /** Supported search modes and filters per platform. No key needed, not billed. */
  platforms(options?: RequestOptions): Promise<PlatformsResponse> {
    return this.request({ path: "/v1/platforms" }, options);
  }

  /**
   * Turns a link copied from the Meta Ad Library, Google Ads Transparency Center, TikTok Ad
   * Library, LinkedIn Ad Library, Pinterest Ads Repository or an X post into an AdLib id, with the
   * endpoint that fetches it. Free.
   */
  libraryUrl(url: string, options?: RequestOptions): Promise<LibraryUrlResponse> {
    return this.request({ path: "/v1/library-url", query: { url: nonEmpty("url", url) } }, options);
  }

  /** Archive size and freshness: ads, removed ads kept, media, crawls, per platform. Public, not billed. */
  coverage(options?: RequestOptions): Promise<CoverageResponse> {
    return this.request({ path: "/public/coverage" }, options);
  }

  /** Headers sent with every request. */
  buildHeaders(): Record<string, string> {
    return {
      Accept: "application/json",
      "User-Agent": `adlib-node/${VERSION}`,
      "X-API-Key": this.#apiKey,
    };
  }

  /**
   * Iterates over the pages of a paginated method by following `next_cursor`. Every page is a
   * billed call, so `maxPages` defaults to 10.
   *
   * ```ts
   * for await (const page of adlib.paginate(adlib.ads.search, { q: "running shoes" }, { maxPages: 3 })) {
   *   console.log(page.data.data?.length, page.nextCursor);
   * }
   * ```
   */
  paginate<P extends PageParams, T extends CursorPage>(
    method: PageMethod<P, T>,
    params: NoInfer<P>,
    options?: PaginateOptions,
  ): AsyncGenerator<Page<T>, void, undefined> {
    return paginate(method, params, options);
  }

  /**
   * Like {@link paginate}, but yields the items of each page one by one (`data` of list responses,
   * `items` of a batch job).
   *
   * ```ts
   * for await (const ad of adlib.paginateItems(adlib.advertisers.ads, { id: "meta:15087023444" })) {
   *   console.log(ad.id);
   * }
   * ```
   */
  paginateItems<P extends PageParams, T extends CursorPage>(
    method: PageMethod<P, T>,
    params: NoInfer<P>,
    options?: PaginateOptions,
  ) {
    return paginateItems(method, params, options);
  }

  /**
   * Sends a request and returns the parsed JSON (undefined for 204). Used by all resource methods;
   * also usable directly for endpoints this SDK does not wrap yet.
   */
  async request<T = unknown>(req: APIRequest, options: RequestOptions = {}): Promise<T> {
    const method = req.method ?? "GET";
    const url = buildUrl(this.baseUrl, req);
    const payload = req.body !== undefined ? JSON.stringify(req.body) : undefined;
    const maxRetries = nonNegativeInt("maxRetries", options.maxRetries, this.maxRetries);
    const timeoutMs = positiveNumber("timeoutMs", options.timeoutMs, this.timeoutMs);
    const idempotent = method !== "POST";
    const signal = options.signal;

    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw signal.reason;
      let error: AdLibError;
      try {
        return await this.#attempt<T>(method, url, payload, timeoutMs, signal);
      } catch (err) {
        if (!(err instanceof AdLibError)) throw err; // user abort or unexpected error
        error = err;
      }
      if (attempt >= maxRetries || !isRetryable(error, idempotent)) throw error;
      await sleep(this.#retryDelay(attempt, error), signal);
    }
  }

  #retryDelay(attempt: number, error: AdLibError): number {
    if (error instanceof RateLimitError && typeof error.retryAfter === "number") {
      return Math.min(error.retryAfter * 1000, MAX_RETRY_AFTER_MS);
    }
    const base = Math.min(this.retryDelayMs * 2 ** attempt, MAX_RETRY_DELAY_MS);
    return base * (0.75 + Math.random() * 0.25);
  }

  async #attempt<T>(
    method: HTTPMethod,
    url: string,
    payload: string | undefined,
    timeoutMs: number,
    signal: AbortSignal | undefined,
  ): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort(signal!.reason);
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      let res: Response;
      try {
        const headers = this.buildHeaders();
        if (payload !== undefined) headers["Content-Type"] = "application/json";
        res = await this.#fetch(url, { method, headers, body: payload, signal: controller.signal });
      } catch (err) {
        if (signal?.aborted) throw signal.reason;
        if (timedOut) throw new TimeoutError(`Request timed out after ${timeoutMs} ms`, { cause: err });
        const msg = err instanceof Error ? err.message : String(err);
        throw new ConnectionError(`Could not reach the AdLib API: ${msg}`, { cause: err });
      }

      let text: string;
      try {
        text = await res.text();
      } catch (err) {
        if (signal?.aborted) throw signal.reason;
        if (timedOut) throw new TimeoutError(`Request timed out after ${timeoutMs} ms`, { cause: err });
        throw new ConnectionError("Connection lost while reading the response", { cause: err });
      }

      let body: unknown = undefined;
      let parsed = true;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
          parsed = false;
        }
      }

      if (!res.ok) throw errorFromResponse(res.status, body, res.headers);
      if (!parsed) {
        throw new AdLibError(`${res.status} Response was not valid JSON`, {
          status: res.status,
          body,
          headers: res.headers,
          requestId: res.headers.get("x-request-id") ?? undefined,
        });
      }
      if (this.#onResponse) {
        this.#onResponse({
          method,
          url,
          status: res.status,
          requestId: res.headers.get("x-request-id") ?? undefined,
          billedCredits: headerInt(res.headers, "x-billing-credits"),
          rateLimitLimit: headerInt(res.headers, "x-ratelimit-limit"),
          rateLimitRemaining: headerInt(res.headers, "x-ratelimit-remaining"),
          rateLimitReset: headerInt(res.headers, "x-ratelimit-reset"),
          headers: res.headers,
        });
      }
      return body as T;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

/**
 * Whether a failed attempt may be retried. 429 rate_limited is rejected before the request is
 * handled, so it is safe for every method; quota_exceeded will not clear by waiting. 502/503/504,
 * timeouts and network errors are retried only for GET, PATCH and DELETE.
 */
export function isRetryable(error: AdLibError, idempotent: boolean): boolean {
  if (error instanceof QuotaExceededError) return false;
  if (error instanceof RateLimitError) return true;
  if (!idempotent) return false;
  if (error instanceof ConnectionError) return true;
  return error.status !== undefined && RETRYABLE_STATUS.has(error.status);
}

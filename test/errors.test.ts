import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AdLibError,
  APIError,
  AuthenticationError,
  ConnectionError,
  InsufficientCreditsError,
  NotFoundError,
  PermissionDeniedError,
  QuotaExceededError,
  RateLimitError,
  ServerError,
  TimeoutError,
  ValidationError,
  errorFromResponse,
  parseRetryAfter,
} from "../src/index.js";
import { apiError, json, makeClient } from "./helpers.js";

describe("errors", () => {
  it("parses the API error shape", async () => {
    const { client } = makeClient([apiError(404, "not_found", "advertiser meta:1 not found")]);
    const err = await client.advertisers.get("meta:1").catch((e) => e);
    assert.ok(err instanceof NotFoundError);
    assert.ok(err instanceof APIError);
    assert.ok(err instanceof AdLibError);
    assert.equal(err.status, 404);
    assert.equal(err.code, "not_found");
    assert.equal(err.requestId, "req-1");
    assert.equal(err.billed, false);
    assert.equal(err.message, "404 (not_found) advertiser meta:1 not found");
    assert.equal(err.name, "NotFoundError");
  });

  it("maps statuses to classes", () => {
    const cases: [number, string, new (...a: never[]) => Error][] = [
      [400, "bad_request", ValidationError],
      [422, "unsupported", ValidationError],
      [401, "unauthorized", AuthenticationError],
      [402, "payment_required", InsufficientCreditsError],
      [403, "forbidden", PermissionDeniedError],
      [403, "history_limit", PermissionDeniedError],
      [404, "not_found", NotFoundError],
      [429, "rate_limited", RateLimitError],
      [429, "quota_exceeded", QuotaExceededError],
      [500, "internal", ServerError],
      [502, "upstream_error", ServerError],
      [503, "platform_unavailable", ServerError],
      [418, "teapot", APIError],
    ];
    for (const [status, code, cls] of cases) {
      const err = errorFromResponse(status, { error: { code, message: "m", request_id: "r", billed: false } });
      assert.ok(err instanceof cls, `${status} ${code}`);
      assert.equal(err.code, code);
    }
    assert.ok(errorFromResponse(429, { error: { code: "rate_limited", message: "m" } }) instanceof RateLimitError);
    assert.ok(!(errorFromResponse(429, { error: { code: "rate_limited", message: "m" } }) instanceof QuotaExceededError));
  });

  it("keeps platform and details; falls back to X-Request-Id", () => {
    const err = errorFromResponse(
      502,
      { error: { code: "upstream_error", message: "meta failed", platform: "meta", details: ["a"], billed: false } },
      new Headers({ "x-request-id": "hdr-id" }),
    );
    assert.equal(err.platform, "meta");
    assert.deepEqual(err.details, ["a"]);
    assert.equal(err.requestId, "hdr-id");
  });

  it("handles non-JSON and empty error bodies", async () => {
    const { client } = makeClient([new Response("Bad Gateway", { status: 400 })]);
    const err = await client.status().catch((e) => e);
    assert.ok(err instanceof ValidationError);
    assert.equal(err.message, "400 Bad Gateway");
    assert.equal(errorFromResponse(401, undefined).message, "401 Authentication failed: check your API key");
  });

  it("reads Retry-After on 429", () => {
    const err = errorFromResponse(429, { error: { code: "rate_limited", message: "m" } }, new Headers({ "retry-after": "7" }));
    assert.equal((err as RateLimitError).retryAfter, 7);
  });

  it("parseRetryAfter supports seconds and HTTP dates", () => {
    assert.equal(parseRetryAfter("3"), 3);
    assert.equal(parseRetryAfter("1.5"), 1.5);
    assert.equal(parseRetryAfter(new Date(10_000).toUTCString(), 0), 10);
    assert.equal(parseRetryAfter("nonsense"), undefined);
    assert.equal(parseRetryAfter(null), undefined);
  });

  it("wraps network errors and timeouts", async () => {
    const { client } = makeClient([new TypeError("fetch failed")], { maxRetries: 0 });
    const err = await client.status().catch((e) => e);
    assert.ok(err instanceof ConnectionError);
    assert.ok(!(err instanceof APIError));

    const fetchHang = async (_: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    const c2 = makeClient([], { maxRetries: 0, timeoutMs: 20, fetch: fetchHang as typeof fetch }).client;
    const t = await c2.status().catch((e) => e);
    assert.ok(t instanceof TimeoutError);
    assert.ok(t instanceof ConnectionError);
  });

  it("rejects a 200 with an invalid JSON body", async () => {
    const { client } = makeClient([new Response("<html>", { status: 200 })]);
    const err = await client.status().catch((e) => e);
    assert.ok(err instanceof AdLibError);
    assert.match(err.message, /not valid JSON/);
  });

  it("validates arguments before sending", async () => {
    const { client, calls } = makeClient([json({})]);
    assert.throws(() => client.ads.get("1234"), ValidationError);
    assert.throws(() => client.search({}), ValidationError);
    assert.throws(() => client.search({ q: "a", domain: "b.com" }), ValidationError);
    assert.throws(() => client.ads.search({ q: "a", limit: 101 }), ValidationError);
    assert.throws(() => client.advertisers.resolve({ domain: "" }), ValidationError);
    assert.throws(() => client.watchlists.create({ advertisers: [] }), ValidationError);
    assert.throws(() => client.watchlists.create({ advertisers: ["nike"] }), ValidationError);
    assert.throws(() => client.batch.create({ type: "ads", items: [] }), ValidationError);
    assert.throws(() => client.webhooks.delivery("abc"), ValidationError);
    assert.throws(() => client.search({ q: "x", status: "nope" as never }), ValidationError);
    assert.throws(() => client.companies.get(""), ValidationError);
    assert.throws(() => client.companies.get({ domain: "audi.de", minScore: 1.5 }), ValidationError);
    assert.throws(() => client.companies.get({ domain: "audi.de", maxPerPlatform: 11 }), ValidationError);
    assert.throws(() => client.advertisers.reportMatch({ domain: "audi.de", kind: "wrong_match" }), ValidationError);
    assert.throws(() => client.advertisers.reportMatch({ domain: "audi.de", kind: "nope" as never }), ValidationError);
    assert.throws(() => client.advertisers.reportMatch({ domain: "audi.de", kind: "missing_match", advertiserId: "audi" }), ValidationError);
    assert.throws(
      () => client.advertisers.reportMatch({ domain: "audi.de", kind: "missing_match", note: "x".repeat(1001) }),
      ValidationError,
    );
    assert.equal(calls.length, 0);
  });
});

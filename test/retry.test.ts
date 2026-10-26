import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConnectionError, QuotaExceededError, RateLimitError, ServerError, ValidationError } from "../src/index.js";
import { apiError, json, makeClient } from "./helpers.js";

const ok = () => json({ status: "operational" });

describe("retries", () => {
  it("retries 429 rate_limited and honours Retry-After", async () => {
    const { client, calls } = makeClient([apiError(429, "rate_limited", "slow down", { "retry-after": "0" }), ok()]);
    assert.deepEqual(await client.status(), { status: "operational" });
    assert.equal(calls.length, 2);
  });

  it("waits Retry-After seconds", async () => {
    const { client } = makeClient([apiError(429, "rate_limited", "x", { "retry-after": "0.05" }), ok()]);
    const start = Date.now();
    await client.status();
    assert.ok(Date.now() - start >= 45, "should wait about 50 ms");
  });

  for (const status of [502, 503, 504]) {
    it(`retries ${status} on GET`, async () => {
      const { client, calls } = makeClient([apiError(status, "upstream"), ok()]);
      await client.status();
      assert.equal(calls.length, 2);
    });
  }

  it("does not retry 500", async () => {
    const { client, calls } = makeClient([apiError(500, "internal"), ok()]);
    await assert.rejects(client.status(), ServerError);
    assert.equal(calls.length, 1);
  });

  it("gives up after maxRetries", async () => {
    const { client, calls } = makeClient([apiError(503, "unavailable")], { maxRetries: 3 });
    await assert.rejects(client.status(), ServerError);
    assert.equal(calls.length, 4);
  });

  it("maxRetries per call wins", async () => {
    const { client, calls } = makeClient([apiError(503, "unavailable")]);
    await assert.rejects(client.status({ maxRetries: 0 }), ServerError);
    assert.equal(calls.length, 1);
  });

  it("never retries quota_exceeded", async () => {
    const { client, calls } = makeClient([apiError(429, "quota_exceeded", "monthly quota used up"), ok()]);
    const err = await client.status().catch((e) => e);
    assert.ok(err instanceof QuotaExceededError);
    assert.ok(err instanceof RateLimitError);
    assert.equal(calls.length, 1);
  });

  it("does not retry other 4xx", async () => {
    const { client, calls } = makeClient([apiError(422, "unsupported"), ok()]);
    await assert.rejects(client.status(), ValidationError);
    assert.equal(calls.length, 1);
  });

  it("retries network errors on GET", async () => {
    const { client, calls } = makeClient([new TypeError("fetch failed"), ok()]);
    await client.status();
    assert.equal(calls.length, 2);
  });

  it("POST: retries 429 rate_limited but not 5xx or network errors", async () => {
    const r1 = makeClient([apiError(429, "rate_limited", "x", { "retry-after": "0" }), json({ data: { job_id: "j" } }, 202)]);
    await r1.client.batch.create({ type: "domains", items: ["nike.com"] });
    assert.equal(r1.calls.length, 2);

    const r2 = makeClient([apiError(503, "unavailable"), json({})]);
    await assert.rejects(r2.client.watchlists.create({ advertisers: ["meta:1"] }), ServerError);
    assert.equal(r2.calls.length, 1);

    const r3 = makeClient([new TypeError("socket hang up"), json({})]);
    await assert.rejects(r3.client.webhooks.rotateSecret(), ConnectionError);
    assert.equal(r3.calls.length, 1);
  });

  it("DELETE is retried like GET", async () => {
    const { client, calls } = makeClient([apiError(502, "bad_gateway"), new Response(null, { status: 204 })]);
    await client.watchlists.removeAdvertiser("wl", "meta:1");
    assert.equal(calls.length, 2);
  });
});

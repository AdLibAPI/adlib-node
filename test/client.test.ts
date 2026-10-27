import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { inspect } from "node:util";
import { AdLib, AuthenticationError, DEFAULT_BASE_URL, VERSION, ValidationError, buildUrl, type ResponseInfo } from "../src/index.js";
import { json, makeClient, mockFetch } from "./helpers.js";

const ENV_KEYS = ["ADLIB_API_KEY", "ADLIB_BASE_URL"] as const;

describe("AdLib client configuration", () => {
  let saved: Record<string, string | undefined>;
  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("sends X-API-Key, Accept and User-Agent to the default base URL", async () => {
    const { client, calls } = makeClient([json({ status: "operational" })], { apiKey: "abc" });
    assert.equal(client.baseUrl, DEFAULT_BASE_URL);
    assert.deepEqual(await client.status(), { status: "operational" });
    assert.equal(calls[0]!.url.toString(), "https://api.adlibapi.com/v1/status");
    assert.equal(calls[0]!.method, "GET");
    assert.equal(calls[0]!.headers["x-api-key"], "abc");
    assert.equal(calls[0]!.headers["accept"], "application/json");
    assert.equal(calls[0]!.headers["user-agent"], `adlib-node/${VERSION}`);
    assert.equal(calls[0]!.headers["content-type"], undefined);
  });

  it("reads ADLIB_API_KEY and ADLIB_BASE_URL from the environment; options win", async () => {
    process.env.ADLIB_API_KEY = "env-key";
    process.env.ADLIB_BASE_URL = "http://localhost:8080";
    const mock = mockFetch(json({}));
    const client = new AdLib({ fetch: mock.fetch });
    await client.platforms();
    assert.equal(mock.calls[0]!.url.toString(), "http://localhost:8080/v1/platforms");
    assert.equal(mock.calls[0]!.headers["x-api-key"], "env-key");

    const m2 = mockFetch(json({}));
    await new AdLib({ apiKey: "opt", baseUrl: "http://other.test", fetch: m2.fetch }).platforms();
    assert.equal(m2.calls[0]!.headers["x-api-key"], "opt");
    assert.equal(m2.calls[0]!.url.origin, "http://other.test");
  });

  it("throws AuthenticationError without a key", () => {
    assert.throws(() => new AdLib({ fetch: mockFetch().fetch }), AuthenticationError);
    assert.throws(() => new AdLib({ apiKey: "  ", fetch: mockFetch().fetch }), AuthenticationError);
  });

  it("ignores trailing slashes and a trailing /v1 in the base URL", () => {
    for (const baseUrl of ["https://h.test/", "https://h.test/v1", "https://h.test/v1/", " https://h.test// "]) {
      assert.equal(new AdLib({ apiKey: "k", baseUrl, fetch: mockFetch().fetch }).baseUrl, "https://h.test", baseUrl);
    }
  });

  it("validates numeric options", () => {
    const f = mockFetch().fetch;
    assert.throws(() => new AdLib({ apiKey: "k", fetch: f, maxRetries: -1 }), ValidationError);
    assert.throws(() => new AdLib({ apiKey: "k", fetch: f, timeoutMs: 0 }), ValidationError);
  });

  it("does not expose the key when printed", () => {
    const { client } = makeClient([], { apiKey: "secret-key-123" });
    assert.ok(!inspect(client, { depth: 1 }).includes("secret-key-123"));
    assert.ok(!Object.values(client).some((v) => v === "secret-key-123"));
  });

  it("buildUrl drops empty values", () => {
    assert.equal(
      buildUrl("https://h.test", { path: "/v1/search", query: { q: "a b", x: undefined, y: null, z: "", n: 0, b: false } }),
      "https://h.test/v1/search?q=a+b&n=0&b=false",
    );
  });

  it("reports billing and rate-limit headers through onResponse", async () => {
    const infos: ResponseInfo[] = [];
    const { client } = makeClient(
      [
        json({ data: [], next_cursor: null, meta: {} }, 200, {
          "x-billing-credits": "5",
          "x-request-id": "rid-9",
          "x-ratelimit-limit": "120",
          "x-ratelimit-remaining": "119",
          "x-ratelimit-reset": "42",
        }),
      ],
      { onResponse: (i) => infos.push(i) },
    );
    await client.search({ q: "shoes" });
    assert.equal(infos.length, 1);
    assert.equal(infos[0]!.billedCredits, 5);
    assert.equal(infos[0]!.requestId, "rid-9");
    assert.equal(infos[0]!.rateLimitLimit, 120);
    assert.equal(infos[0]!.rateLimitRemaining, 119);
    assert.equal(infos[0]!.rateLimitReset, 42);
    assert.equal(infos[0]!.status, 200);
  });

  it("returns undefined for 204 responses", async () => {
    const { client, calls } = makeClient([new Response(null, { status: 204 })]);
    assert.equal(await client.watchlists.delete("wl-1"), undefined);
    assert.equal(calls[0]!.method, "DELETE");
  });

  it("supports an AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort(new Error("stop"));
    const { client, calls } = makeClient([json({})]);
    await assert.rejects(client.status({ signal: controller.signal }), /stop/);
    assert.equal(calls.length, 0);
  });

  it("VERSION matches package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    assert.equal(VERSION, pkg.version);
  });
});

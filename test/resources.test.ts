import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { json, makeClient, noContent } from "./helpers.js";

function q(url: URL) {
  return Object.fromEntries(url.searchParams);
}

describe("endpoints", () => {
  it("search sends every filter", async () => {
    const { client, calls } = makeClient([json({ data: [], next_cursor: null, meta: {} })]);
    await client.search({
      q: " running shoes ",
      platform: ["meta", "google"],
      country: "DE",
      status: "active",
      from: "2026-01-01",
      to: "2026-02-01",
      format: "video",
      political: false,
      source: "history",
      sort: "days_running",
      cursor: "c",
      limit: 50,
    });
    assert.equal(calls[0]!.url.pathname, "/v1/search");
    assert.deepEqual(q(calls[0]!.url), {
      q: "running shoes",
      platform: "meta,google",
      country: "DE",
      status: "active",
      from: "2026-01-01",
      to: "2026-02-01",
      format: "video",
      political: "false",
      source: "history",
      sort: "days_running",
      cursor: "c",
      limit: "50",
    });
    await client.ads.search({ advertiser: "meta:15087023444" });
    assert.deepEqual(q(calls[1]!.url), { advertiser: "meta:15087023444" });
  });

  it("ads", async () => {
    const { client, calls } = makeClient([json({})]);
    await client.ads.get("meta:1234567890");
    await client.ads.get({ id: "google:CR1", maxAge: 0 });
    await client.ads.history("meta:1");
    assert.equal(calls[0]!.url.pathname, "/v1/ads/meta:1234567890");
    assert.equal(calls[1]!.url.pathname, "/v1/ads/google:CR1");
    assert.equal(calls[1]!.url.searchParams.get("max_age"), "0");
    assert.equal(calls[2]!.url.pathname, "/v1/ads/meta:1/history");
  });

  it("encodes path segments but keeps colons", async () => {
    const { client, calls } = makeClient([json({})]);
    await client.advertisers.get("x:a/b#c");
    assert.equal(calls[0]!.url.pathname, "/v1/advertisers/x:a%2Fb%23c");
    // Pinterest advertiser ids are names and may contain spaces and dots.
    await client.advertisers.stats("pinterest:Nike S.r.l.");
    assert.equal(calls[1]!.url.pathname, "/v1/advertisers/pinterest:Nike%20S.r.l./stats");
  });

  it("advertisers", async () => {
    const { client, calls } = makeClient([json({})]);
    await client.advertisers.resolve("nike.com");
    await client.advertisers.resolve({ domain: "nike.com", platform: "meta,tiktok", maxPerPlatform: 5 });
    await client.advertisers.get({ id: "meta:15087023444", refresh: true });
    await client.advertisers.ads({ id: "meta:15087023444", status: "inactive", source: "history", sort: "days_running", limit: 100, cursor: "c" });
    await client.advertisers.changes({ id: "meta:1", since: "2026-10-01", types: ["started", "discovered"], limit: 200 });
    await client.advertisers.changes({ id: "meta:1", since: new Date("2026-10-01T00:00:00Z") });
    await client.advertisers.stats("meta:1");
    await client.advertisers.timeline({ id: "meta:1", from: "2026-01-01", to: "2026-02-01", cursor: "c", limit: 10 });

    assert.equal(calls[0]!.url.pathname, "/v1/advertisers/resolve");
    assert.deepEqual(q(calls[0]!.url), { domain: "nike.com" });
    assert.deepEqual(q(calls[1]!.url), { domain: "nike.com", platform: "meta,tiktok", max_per_platform: "5" });
    assert.equal(calls[2]!.url.pathname, "/v1/advertisers/meta:15087023444");
    assert.deepEqual(q(calls[2]!.url), { refresh: "true" });
    assert.equal(calls[3]!.url.pathname, "/v1/advertisers/meta:15087023444/ads");
    assert.deepEqual(q(calls[3]!.url), { status: "inactive", source: "history", sort: "days_running", limit: "100", cursor: "c" });
    assert.equal(calls[4]!.url.pathname, "/v1/advertisers/meta:1/changes");
    assert.deepEqual(q(calls[4]!.url), { since: "2026-10-01", types: "started,discovered", limit: "200" });
    assert.equal(calls[5]!.url.searchParams.get("since"), "2026-10-01T00:00:00.000Z");
    assert.equal(calls[6]!.url.pathname, "/v1/advertisers/meta:1/stats");
    assert.equal(calls[7]!.url.pathname, "/v1/advertisers/meta:1/timeline");
    assert.deepEqual(q(calls[7]!.url), { from: "2026-01-01", to: "2026-02-01", cursor: "c", limit: "10" });
  });

  it("advertisers resolve reports", async () => {
    const { client, calls } = makeClient([
      json({ data: { id: 7, kind: "wrong_match", status: "open" } }, 201),
      json({ data: { id: 8 } }, 201),
      json({ data: [] }),
    ]);
    const created = await client.advertisers.reportMatch({
      domain: "audi.de",
      kind: "wrong_match",
      advertiserId: "google:AR01700036858500612097",
      note: "agency account, not the brand",
    });
    assert.equal(created.data.id, 7);
    await client.advertisers.reportMatch({ domain: "audi.de", kind: "missing_match" });
    await client.advertisers.listReports();
    assert.deepEqual(
      calls.map((c) => `${c.method} ${c.url.pathname}`),
      ["POST /v1/advertisers/resolve/reports", "POST /v1/advertisers/resolve/reports", "GET /v1/advertisers/resolve/reports"],
    );
    assert.deepEqual(JSON.parse(calls[0]!.body!), {
      domain: "audi.de",
      kind: "wrong_match",
      advertiser_id: "google:AR01700036858500612097",
      note: "agency account, not the brand",
    });
    assert.deepEqual(JSON.parse(calls[1]!.body!), { domain: "audi.de", kind: "missing_match" });
  });

  it("companies.get", async () => {
    const { client, calls } = makeClient([json({ data: { domain: "audi.de" } })]);
    const res = await client.companies.get("audi.de");
    assert.equal(res.data.domain, "audi.de");
    await client.companies.get({ domain: "audi.de", platform: ["meta", "google"], minScore: 0.5, maxPerPlatform: 10 });
    await client.companies.get({ domain: "audi.de", minScore: 0 });
    assert.equal(calls[0]!.url.pathname, "/v1/companies/audi.de");
    assert.deepEqual(q(calls[0]!.url), {});
    assert.deepEqual(q(calls[1]!.url), { platform: "meta,google", min_score: "0.5", max_per_platform: "10" });
    assert.deepEqual(q(calls[2]!.url), { min_score: "0" });
  });

  it("domains.check", async () => {
    const { client, calls } = makeClient([json({})]);
    await client.domains.check("nike.com");
    await client.domains.check({ domain: "nike.com", platform: ["linkedin"] });
    assert.equal(calls[0]!.url.pathname, "/v1/domains/nike.com/check");
    assert.equal(calls[1]!.url.searchParams.get("platform"), "linkedin");
  });

  it("batch", async () => {
    const { client, calls } = makeClient([json({ data: { job_id: "j1" } }, 202)]);
    const created = await client.batch.create({
      type: "domains",
      items: ["nike.com", "adidas.com"],
      options: { include_ads: true, platforms: ["meta"] },
      webhookUrl: "https://hooks.test/adlib",
    });
    assert.equal(created.data.job_id, "j1");
    assert.equal(calls[0]!.method, "POST");
    assert.equal(calls[0]!.url.pathname, "/v1/batch");
    assert.equal(calls[0]!.headers["content-type"], "application/json");
    assert.deepEqual(JSON.parse(calls[0]!.body!), {
      type: "domains",
      items: ["nike.com", "adidas.com"],
      options: { include_ads: true, platforms: ["meta"] },
      webhook_url: "https://hooks.test/adlib",
    });
    await client.batch.get({ jobId: "8d3c-uuid" });
    await client.batch.get({ jobId: "8d3c-uuid", cursor: "c", limit: 5 });
    assert.equal(calls[1]!.url.pathname, "/v1/batch/8d3c-uuid");
    assert.deepEqual(q(calls[2]!.url), { cursor: "c", limit: "5" });
  });

  it("watchlists", async () => {
    const { client, calls } = makeClient([json({ data: {} }), json({ data: {} }), json({ data: [] }), json({ data: {} }), json({ data: {} }), noContent(), noContent()]);
    await client.watchlists.create({ advertisers: ["meta:15087023444"] });
    await client.watchlists.create({
      advertisers: ["meta:1", "tiktok:2"],
      name: "Competitors",
      webhookUrl: "https://hooks.test/w",
      intervalHours: 12,
      archiveVideos: false,
    });
    await client.watchlists.list();
    await client.watchlists.get("wl-1");
    await client.watchlists.addAdvertisers("wl-1", ["google:AR1"]);
    await client.watchlists.removeAdvertiser("wl-1", "google:AR1");
    await client.watchlists.delete("wl-1");

    assert.deepEqual(JSON.parse(calls[0]!.body!), { advertisers: ["meta:15087023444"] });
    assert.deepEqual(JSON.parse(calls[1]!.body!), {
      advertisers: ["meta:1", "tiktok:2"],
      name: "Competitors",
      webhook_url: "https://hooks.test/w",
      interval_hours: 12,
      archive_videos: false,
    });
    assert.deepEqual(
      calls.map((c) => `${c.method} ${c.url.pathname}`),
      [
        "POST /v1/watchlists",
        "POST /v1/watchlists",
        "GET /v1/watchlists",
        "GET /v1/watchlists/wl-1",
        "POST /v1/watchlists/wl-1/advertisers",
        "DELETE /v1/watchlists/wl-1/advertisers/google:AR1",
        "DELETE /v1/watchlists/wl-1",
      ],
    );
    assert.deepEqual(JSON.parse(calls[4]!.body!), { advertisers: ["google:AR1"] });
  });

  it("webhooks", async () => {
    const { client, calls } = makeClient([json({})]);
    await client.webhooks.deliveries();
    await client.webhooks.deliveries({ status: "failed", limit: 10, cursor: "c" });
    await client.webhooks.delivery(42);
    await client.webhooks.redeliver("42");
    await client.webhooks.test("https://hooks.test/x");
    await client.webhooks.secret();
    await client.webhooks.rotateSecret();
    assert.deepEqual(
      calls.map((c) => `${c.method} ${c.url.pathname}`),
      [
        "GET /v1/webhooks/deliveries",
        "GET /v1/webhooks/deliveries",
        "GET /v1/webhooks/deliveries/42",
        "POST /v1/webhooks/deliveries/42/redeliver",
        "POST /v1/webhooks/test",
        "GET /v1/webhooks/secret",
        "POST /v1/webhooks/secret/rotate",
      ],
    );
    assert.deepEqual(q(calls[1]!.url), { status: "failed", limit: "10", cursor: "c" });
    assert.deepEqual(JSON.parse(calls[4]!.body!), { url: "https://hooks.test/x" });
    assert.equal(calls[3]!.body, undefined);
  });

  it("usage, status, platforms", async () => {
    const { client, calls } = makeClient([json({})]);
    await client.usage();
    await client.usage({ days: 7 });
    await client.status();
    await client.platforms();
    assert.deepEqual(
      calls.map((c) => c.url.pathname + c.url.search),
      ["/v1/usage", "/v1/usage?days=7", "/v1/status", "/v1/platforms"],
    );
  });
});

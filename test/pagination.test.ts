import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paginate, type Ad } from "../src/index.js";
import { adPage, json, makeClient } from "./helpers.js";

describe("pagination", () => {
  it("follows next_cursor until null", async () => {
    const { client, calls } = makeClient([json(adPage(["a", "b"], "c1")), json(adPage(["c"], "c2")), json(adPage(["d"], null))]);
    const pages = [];
    for await (const page of client.paginate(client.ads.search, { q: "shoes", limit: 2 })) pages.push(page);
    assert.equal(pages.length, 3);
    assert.deepEqual(pages.map((p) => p.cursor), [undefined, "c1", "c2"]);
    assert.deepEqual(pages.map((p) => p.nextCursor), ["c1", "c2", undefined]);
    assert.deepEqual(pages.map((p) => p.pageNumber), [1, 2, 3]);
    assert.equal(calls[0]!.url.searchParams.get("cursor"), null);
    assert.equal(calls[1]!.url.searchParams.get("cursor"), "c1");
    assert.equal(calls[2]!.url.searchParams.get("cursor"), "c2");
    assert.equal(calls[2]!.url.searchParams.get("q"), "shoes");
    assert.equal(calls[2]!.url.searchParams.get("limit"), "2");
  });

  it("stops at maxPages (default 10)", async () => {
    let n = 0;
    const { client, calls } = makeClient([() => json(adPage([String(n)], `c${++n}`))]);
    let count = 0;
    for await (const _ of client.paginate(client.ads.search, { q: "x" })) count++;
    assert.equal(count, 10);
    assert.equal(calls.length, 10);

    const r2 = makeClient([() => json(adPage(["x"], `c${++n}`))]);
    count = 0;
    for await (const _ of paginate(r2.client.ads.search, { q: "x" }, { maxPages: 2 })) count++;
    assert.equal(count, 2);
  });

  it("stops when the cursor repeats", async () => {
    const { client, calls } = makeClient([json(adPage(["a"], "same"))]);
    let count = 0;
    for await (const _ of client.paginate(client.ads.search, { q: "x", cursor: "start" }, { maxPages: Infinity })) count++;
    assert.equal(count, 2);
    assert.equal(calls[0]!.url.searchParams.get("cursor"), "start");
    assert.equal(calls.length, 2);
  });

  it("paginateItems yields the ads of every page", async () => {
    const { client } = makeClient([json(adPage(["a", "b"], "c1")), json(adPage(["c"], null))]);
    const ids: string[] = [];
    for await (const ad of client.paginateItems(client.advertisers.ads, { id: "meta:1", source: "history" })) {
      const typed: Ad = ad;
      ids.push(typed.id);
    }
    assert.deepEqual(ids, ["a", "b", "c"]);
  });

  it("paginateItems yields batch items", async () => {
    const { client, calls } = makeClient([
      json({ data: { job_id: "j" }, items: [{ input: "nike.com" }], next_cursor: "n" }),
      json({ data: { job_id: "j" }, items: [{ input: "adidas.com" }], next_cursor: null }),
    ]);
    const inputs: string[] = [];
    for await (const item of client.paginateItems(client.batch.get, { jobId: "j" })) inputs.push(item.input);
    assert.deepEqual(inputs, ["nike.com", "adidas.com"]);
    assert.equal(calls[1]!.url.pathname, "/v1/batch/j");
  });

  it("works with webhook deliveries and changes", async () => {
    const { client } = makeClient([json({ data: [{ id: 1 }], next_cursor: null })]);
    const ids: number[] = [];
    for await (const d of client.paginateItems(client.webhooks.deliveries, { status: "failed" })) ids.push(d.id);
    assert.deepEqual(ids, [1]);
  });

  it("rejects an invalid maxPages", async () => {
    const { client } = makeClient();
    await assert.rejects(async () => {
      for await (const _ of client.paginate(client.ads.search, { q: "x" }, { maxPages: 0 })) void _;
    }, RangeError);
  });
});

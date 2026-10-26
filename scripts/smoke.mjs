// Checks that the built ESM entry loads through the package's own "exports" map.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AdLib, AdLibError, RateLimitError, VERSION, signWebhookPayload, verifyWebhookSignature } from "adlib-api";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
assert.equal(typeof AdLib, "function");
assert.ok(new RateLimitError("x", { status: 429 }) instanceof AdLibError);
assert.equal(VERSION, pkg.version);
const client = new AdLib({ apiKey: "test" });
assert.equal(typeof client.advertisers.resolve, "function");
assert.equal(verifyWebhookSignature({ payload: "{}", signature: signWebhookPayload("s", "{}"), secret: "s" }), true);
console.log("ESM smoke test passed");

// Checks that the built CommonJS entry loads through the package's own "exports" map.
const assert = require("node:assert/strict");
const { AdLib, AdLibError, RateLimitError, VERSION, signWebhookPayload, verifyWebhookSignature } = require("adlib-api");
const pkg = require("../package.json");

assert.equal(typeof AdLib, "function");
assert.ok(new RateLimitError("x", { status: 429 }) instanceof AdLibError);
assert.equal(VERSION, pkg.version);
const client = new AdLib({ apiKey: "test" });
assert.equal(typeof client.advertisers.resolve, "function");
assert.equal(verifyWebhookSignature({ payload: "{}", signature: signWebhookPayload("s", "{}"), secret: "s" }), true);
console.log("CJS smoke test passed");

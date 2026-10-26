import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import {
  WebhookSignatureError,
  constructWebhookEvent,
  signWebhookPayload,
  verifyWebhookSignature,
  type WebhookEvent,
} from "../src/index.js";

const secret = "whsec_0123456789abcdef0123456789abcdef0123456789abcdef";
const body = JSON.stringify({ event: "webhook.ping", sent_at: "2026-10-26T10:00:00Z", message: "hi" });
const t = 1_800_000_000;

function goSign(key: string, payload: string, ts: number) {
  // Same construction as the API's worker.Sign: HMAC-SHA256(key, "<t>." + body), hex.
  return `t=${ts},v1=${createHmac("sha256", key).update(`${ts}.${payload}`).digest("hex")}`;
}

describe("webhook signatures", () => {
  it("signWebhookPayload matches the API's construction", () => {
    assert.equal(signWebhookPayload(secret, body, t), goSign(secret, body, t));
  });

  it("accepts a valid signature (string or Buffer body)", () => {
    const sig = goSign(secret, body, t);
    assert.equal(verifyWebhookSignature({ payload: body, signature: sig, secret, now: t + 10 }), true);
    assert.equal(verifyWebhookSignature({ payload: Buffer.from(body), signature: sig, secret, now: t }), true);
    assert.equal(verifyWebhookSignature({ payload: new TextEncoder().encode(body), signature: sig, secret, now: t }), true);
  });

  it("accepts any of several v1 signatures and tolerates spaces and case", () => {
    const good = goSign(secret, body, t).split("v1=")[1]!;
    const sig = `t=${t}, v1=${"0".repeat(64)}, v1=${good.toUpperCase()}`;
    assert.equal(verifyWebhookSignature({ payload: body, signature: sig, secret, now: t }), true);
  });

  it("rejects a wrong secret, a modified body or a modified timestamp", () => {
    const sig = goSign(secret, body, t);
    assert.throws(() => verifyWebhookSignature({ payload: body, signature: sig, secret: "whsec_other", now: t }), WebhookSignatureError);
    assert.throws(() => verifyWebhookSignature({ payload: body + " ", signature: sig, secret, now: t }), WebhookSignatureError);
    const v1 = sig.split(",")[1];
    assert.throws(
      () => verifyWebhookSignature({ payload: body, signature: `t=${t + 1},${v1}`, secret, now: t }),
      /does not match/,
    );
  });

  it("enforces the 5 minute tolerance", () => {
    const sig = goSign(secret, body, t);
    assert.equal(verifyWebhookSignature({ payload: body, signature: sig, secret, now: t + 300 }), true);
    assert.throws(() => verifyWebhookSignature({ payload: body, signature: sig, secret, now: t + 301 }), /tolerance/);
    assert.throws(() => verifyWebhookSignature({ payload: body, signature: sig, secret, now: t - 301 }), /tolerance/);
    assert.equal(verifyWebhookSignature({ payload: body, signature: sig, secret, now: t + 1000, toleranceSeconds: 2000 }), true);
  });

  it("uses the current time by default", () => {
    const now = Math.floor(Date.now() / 1000);
    assert.equal(verifyWebhookSignature({ payload: body, signature: signWebhookPayload(secret, body), secret }), true);
    assert.throws(() => verifyWebhookSignature({ payload: body, signature: goSign(secret, body, now - 600), secret }), WebhookSignatureError);
  });

  it("rejects missing and malformed headers", () => {
    for (const signature of [undefined, null, "", "garbage", `t=${t}`, "v1=abc", `t=abc,v1=${"0".repeat(64)}`, `t=${t},v1=xyz`]) {
      assert.throws(() => verifyWebhookSignature({ payload: body, signature, secret, now: t }), WebhookSignatureError, String(signature));
    }
    assert.throws(() => verifyWebhookSignature({ payload: body, signature: goSign(secret, body, t), secret: "", now: t }), WebhookSignatureError);
  });

  it("rejects parsed JSON as payload", () => {
    assert.throws(
      () => verifyWebhookSignature({ payload: JSON.parse(body), signature: goSign(secret, body, t), secret, now: t }),
      /raw request body/,
    );
  });

  it("constructWebhookEvent verifies and parses", () => {
    const event = constructWebhookEvent<WebhookEvent>({ payload: body, signature: goSign(secret, body, t), secret, now: t });
    assert.equal(event.event, "webhook.ping");
    if (event.event === "webhook.ping") assert.equal(event.message, "hi");
  });
});

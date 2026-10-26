import { createHmac, timingSafeEqual } from "node:crypto";
import { WebhookSignatureError } from "./errors.js";
import type { WebhookEvent } from "./types.js";

/** Header the API signs deliveries with: `t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`. */
export const SIGNATURE_HEADER = "X-AdLib-Signature";
/** Deliveries older than this are rejected (replay protection). */
export const DEFAULT_TOLERANCE_SECONDS = 300;

export interface VerifyWebhookOptions {
  /** The raw request body, exactly as received (not re-serialized JSON). */
  payload: string | Uint8Array;
  /** Value of the X-AdLib-Signature header. */
  signature: string | null | undefined;
  /** Your webhook secret (whsec_...), from adlib.webhooks.secret(). */
  secret: string;
  /** Maximum age of the timestamp in seconds. Default 300 (5 minutes). */
  toleranceSeconds?: number;
  /** Current time in Unix seconds, for tests. */
  now?: number;
}

function toBuffer(payload: string | Uint8Array): Buffer {
  if (typeof payload === "string") return Buffer.from(payload, "utf8");
  if (payload instanceof Uint8Array) return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
  throw new WebhookSignatureError(
    "payload must be the raw request body (string or Buffer), not parsed JSON: re-serializing changes the bytes",
  );
}

/** Computes the X-AdLib-Signature value for a body. Useful for tests of your own webhook handler. */
export function signWebhookPayload(secret: string, payload: string | Uint8Array, timestamp: number = Math.floor(Date.now() / 1000)): string {
  const t = String(Math.floor(timestamp));
  const mac = createHmac("sha256", secret).update(`${t}.`).update(toBuffer(payload)).digest("hex");
  return `t=${t},v1=${mac}`;
}

/** Parses `t=<unix>,v1=<hex>[,v1=<hex>...]`. */
function parseSignature(header: string): { timestamp: number; signatures: string[] } {
  let timestamp: number | undefined;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === "t" && /^\d+$/.test(value)) timestamp = Number(value);
    else if (key === "v1" && /^[0-9a-fA-F]{64}$/.test(value)) signatures.push(value.toLowerCase());
  }
  if (timestamp === undefined || signatures.length === 0) {
    throw new WebhookSignatureError(`Malformed ${SIGNATURE_HEADER} header: expected t=<unix>,v1=<hex>`);
  }
  return { timestamp, signatures };
}

/**
 * Verifies the X-AdLib-Signature of a webhook delivery: HMAC-SHA256 of `"<t>.<raw body>"` with your
 * secret, compared in constant time, and a timestamp no more than 5 minutes off. Throws
 * {@link WebhookSignatureError} when the check fails; returns true otherwise.
 */
export function verifyWebhookSignature(options: VerifyWebhookOptions): true {
  const { payload, signature, secret } = options;
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (!secret) throw new WebhookSignatureError("secret is required");
  if (!signature) throw new WebhookSignatureError(`Missing ${SIGNATURE_HEADER} header`);
  const { timestamp, signatures } = parseSignature(signature);
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (tolerance > 0 && Math.abs(now - timestamp) > tolerance) {
    throw new WebhookSignatureError(`Signature timestamp is outside the tolerance of ${tolerance} s`);
  }
  const expected = Buffer.from(
    createHmac("sha256", secret).update(`${timestamp}.`).update(toBuffer(payload)).digest("hex"),
    "utf8",
  );
  const ok = signatures.some((sig) => {
    const given = Buffer.from(sig, "utf8");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!ok) throw new WebhookSignatureError("Signature does not match");
  return true;
}

/** Verifies the signature (see {@link verifyWebhookSignature}) and returns the parsed event. */
export function constructWebhookEvent<T = WebhookEvent>(options: VerifyWebhookOptions): T {
  verifyWebhookSignature(options);
  const text = typeof options.payload === "string" ? options.payload : toBuffer(options.payload).toString("utf8");
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new WebhookSignatureError("Webhook body is not valid JSON", { cause: err });
  }
}

import type { AdLib } from "../client.js";
import { ValidationError } from "../errors.js";
import { PLATFORMS, type PlatformFilter } from "../types.js";

/** Base class for resource namespaces (adlib.ads, adlib.advertisers, ...). */
export abstract class APIResource {
  protected readonly client: AdLib;

  constructor(client: AdLib) {
    this.client = client;
  }
}

/** Encodes a path segment. Colons stay as they are: ids look like meta:1234567890. */
export function enc(value: string): string {
  return encodeURIComponent(value).replace(/%3A/gi, ":");
}

export function nonEmpty(name: string, value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string" || !value.trim()) throw new ValidationError(`${name} must be a non-empty string`);
  return value.trim();
}

/** Ids use the ten libraries (YouTube and Play ads are google: ids). */
const PREFIXED_ID = new RegExp(`^(${PLATFORMS.join("|")}):\\S.*$`);

/** Validates an ad or advertiser id of the form <platform>:<platform_id>. */
export function prefixedId(name: string, value: unknown): string {
  const s = nonEmpty(name, value);
  if (!PREFIXED_ID.test(s)) {
    throw new ValidationError(
      `${name} must look like <platform>:<id>, e.g. meta:1234567890, with platform one of ${PLATFORMS.join(", ")} (got ${JSON.stringify(s)})`,
    );
  }
  return s;
}

/** Joins a platform list with commas. */
export function platforms(value: PlatformFilter | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  return value.length ? value.join(",") : undefined;
}

/** Joins a string list with commas. */
export function csv(value: string | readonly string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : value.join(",");
}

export function intInRange(name: string, value: number | undefined, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

export function numberInRange(name: string, value: number | undefined, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be a number from ${min} to ${max}`);
  }
  return value;
}

export function oneOf<T extends string>(name: string, value: T | undefined, allowed: readonly T[]): T | undefined {
  if (value === undefined) return undefined;
  if (!allowed.includes(value)) throw new ValidationError(`${name} must be one of ${allowed.join(", ")}`);
  return value;
}

/** Accepts a Date or a string (YYYY-MM-DD or RFC 3339). Dates are sent as RFC 3339. */
export function dateParam(value: string | Date | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

/** Drops undefined values from a request body. */
export function compact(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
}

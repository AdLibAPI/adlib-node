import type { CursorPage, RequestOptions } from "./types.js";

/** Params of a paginated method. Methods whose params are optional accept undefined. */
export type PageParams = { cursor?: string } | undefined;

/** A paginated method: takes params with an optional `cursor` and returns a page with `next_cursor`. */
export type PageMethod<P extends PageParams, T extends CursorPage> = (
  params: P,
  options?: RequestOptions,
) => Promise<T>;

/** One page yielded by {@link paginate}. */
export interface Page<T> {
  /** The response of this page. */
  data: T;
  /** 1-based page number within this iteration. */
  pageNumber: number;
  /** Cursor used to request this page (undefined for the first page unless one was passed in). */
  cursor: string | undefined;
  /** `next_cursor` of this page, or undefined on the last page. */
  nextCursor: string | undefined;
}

export interface PaginateOptions extends RequestOptions {
  /**
   * Maximum number of pages to fetch. Every page is a billed call, so this defaults to 10.
   * Pass `Infinity` to keep going until `next_cursor` is null.
   */
  maxPages?: number;
}

export const DEFAULT_MAX_PAGES = 10;

/** The item type of a page: `data` of list responses, `items` of a batch job. */
export type PageItem<T> = T extends { items: (infer I)[] | null }
  ? I
  : T extends { data: (infer I)[] | null }
    ? I
    : never;

function nextCursorOf(page: unknown): string | undefined {
  if (page && typeof page === "object") {
    const c = (page as { next_cursor?: unknown }).next_cursor;
    if (typeof c === "string" && c) return c;
  }
  return undefined;
}

/**
 * Calls a paginated method repeatedly, following `next_cursor`, and yields each page. Stops when
 * `next_cursor` is null, when it repeats, or after `maxPages` pages.
 */
export async function* paginate<P extends PageParams, T extends CursorPage>(
  method: PageMethod<P, T>,
  params: NoInfer<P>,
  options: PaginateOptions = {},
): AsyncGenerator<Page<T>, void, undefined> {
  const { maxPages = DEFAULT_MAX_PAGES, ...requestOptions } = options;
  if (!(maxPages === Infinity || (Number.isInteger(maxPages) && maxPages >= 1))) {
    throw new RangeError("maxPages must be a positive integer or Infinity");
  }
  let cursor = params?.cursor || undefined;
  const seen = new Set<string>();
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
    const data = await method({ ...params, cursor } as P, requestOptions);
    const nextCursor = nextCursorOf(data);
    yield { data, pageNumber, cursor, nextCursor };
    if (!nextCursor || seen.has(nextCursor) || nextCursor === cursor) return;
    seen.add(nextCursor);
    cursor = nextCursor;
  }
}

/** Like {@link paginate}, but yields the items of every page (`items` for batch jobs, else `data`). */
export async function* paginateItems<P extends PageParams, T extends CursorPage>(
  method: PageMethod<P, T>,
  params: NoInfer<P>,
  options: PaginateOptions = {},
): AsyncGenerator<PageItem<T>, void, undefined> {
  for await (const page of paginate(method, params, options)) {
    const body = page.data as unknown as { items?: unknown; data?: unknown };
    const list = Array.isArray(body.items) ? body.items : Array.isArray(body.data) ? body.data : [];
    for (const item of list) yield item as PageItem<T>;
  }
}

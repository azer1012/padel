/** An error with an HTTP status that the error handler turns into `{ error, code }`. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * A JSON request body before validation: every field is unknown until a parser has
 * checked it. Route input parsers take this instead of `any`.
 */
export type Body = Record<string, unknown> | null | undefined;

/** Postgres SQLSTATE of a driver error (drizzle sometimes wraps it in `cause`). */
export function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code ?? e?.cause?.code;
}

/** Postgres HINT of a driver error (our triggers use it as a machine-readable reason). */
export function pgHint(err: unknown): string | undefined {
  const e = err as { hint?: string; cause?: { hint?: string } } | null;
  return e?.hint ?? e?.cause?.hint;
}

/** Positive integer from a path/query/body value, or null. */
export function toId(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isInteger(n) && n > 0 && n <= 2_147_483_647 ? n : null;
}

export function requireId(value: unknown, what = "id"): number {
  const id = toId(value);
  if (id === null) throw new HttpError(400, `Invalid ${what}`, "VALIDATION_ERROR");
  return id;
}

/** Trimmed string limited to `max` chars; empty → null. */
export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v.slice(0, max) : null;
}

/** Amount of money: a finite number in [0, max], rounded to cents; null when invalid. */
export function toMoney(value: unknown, max: number): number | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim() || NaN);
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : null;
}

/**
 * Image address saved by an admin form: https, or a file of the site itself ("/photo.webp").
 * Empty → null. Anything else (http:, javascript:, data:) is refused.
 */
export function cleanImageUrl(value: unknown, max = 500): string | null {
  const url = cleanText(value, max);
  const ownFile = url?.startsWith("/") && !url.startsWith("//");
  if (url && !url.startsWith("https://") && !ownFile)
    throw new HttpError(400, "Image URL must start with https://", "VALIDATION_ERROR");
  return url;
}

/** page/limit query params with sane bounds. */
export function paging(query: Record<string, unknown>, defLimit = 20, maxLimit = 200) {
  const page = Math.max(1, Math.min(10_000, Number.parseInt(String(query.page ?? "1"), 10) || 1));
  const limit = Math.max(
    1,
    Math.min(maxLimit, Number.parseInt(String(query.limit ?? defLimit), 10) || defLimit),
  );
  return { page, limit, offset: (page - 1) * limit };
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

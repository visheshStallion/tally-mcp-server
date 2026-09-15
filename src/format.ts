import { TallyError } from "./tally-client.js";

export function toJsonContent(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

export function toTextError(err: unknown) {
  const message = err instanceof TallyError ? err.message : err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

/** Normalizes a value that fast-xml-parser may return as a single object or an array. */
export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Tally XML elements that carry a TYPE attribute (DATE, AMOUNT, NARRATION,
 * PARTYLEDGERNAME, and most other field tags) parse to
 * `{ "#text": value, "@_TYPE": "..." }` instead of a plain value, because
 * the client's XMLParser has `ignoreAttributes: false`. A field with no
 * text content (an empty/self-closed tag) parses to `{ "@_TYPE": "..." }`
 * with no "#text" at all. This unwraps both shapes down to a plain
 * value (empty string for the latter case), leaving already-plain values
 * (or arrays/objects without a TYPE attribute) untouched.
 */
export function unwrapValue(v: unknown): any {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    const obj = v as Record<string, unknown>;
    if ("#text" in obj) return obj["#text"];
    if ("@_TYPE" in obj) return "";
  }
  return v;
}

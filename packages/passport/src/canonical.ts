/** Sort by UTF-16 code units, independently of locale and insertion order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${Array.from(value, v => v === undefined ? "null" : canonicalJson(v)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  const result = JSON.stringify(value);
  if (result === undefined) throw new TypeError("Expected a JSON value.");
  return result;
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, "0")).join("");
}

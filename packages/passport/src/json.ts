import { PassportError } from "./errors.js";
import type { Limits } from "./types.js";

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject { [key: string]: JsonValue }
export function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function ownJsonValue(value: JsonValue | undefined, key: string): JsonValue | undefined {
  if (Array.isArray(value) || typeof value === "string") {
    if (key === "length") return value.length;
    if (/^(0|[1-9]\d*)$/.test(key)) {
      if (typeof value === "string") return value[Number(key)];
      if (Object.hasOwn(value, key)) return value[Number(key)];
    }
    return undefined;
  }
  return isObject(value) && Object.hasOwn(value, key) ? value[key] : undefined;
}

/** RFC 8259 parser. Objects have no prototype, including at nested levels. */
export function parseStrictJson(text: string, limits: Pick<Limits, "maxDepth" | "maxKeys">): JsonValue {
  let at = 0;
  let keys = 0;
  const fail = (detail: string): never => { throw new PassportError("NOT_JSON", `${detail} at offset ${at}.`); };
  const space = () => { while (/[\x20\t\r\n]/.test(text[at] ?? "x")) at++; };
  const string = (): string => {
    at++;
    let out = "";
    while (at < text.length) {
      const c = text[at++];
      if (c === '"') return out;
      if (c === "\\") {
        const escaped = text[at++];
        const escapes: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
        if (escaped === "u") {
          const hex = text.slice(at, at + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("Invalid Unicode escape");
          out += String.fromCharCode(Number.parseInt(hex, 16));
          at += 4;
        } else if (escaped !== undefined && Object.hasOwn(escapes, escaped)) out += escapes[escaped];
        else fail("Invalid escape");
      } else {
        if (c === undefined || c.charCodeAt(0) < 32) fail("Unescaped control character");
        out += c;
      }
    }
    return fail("Unterminated string");
  };
  const value = (depth: number, path: string): JsonValue => {
    space();
    const c = text[at];
    if (c === "{" || c === "[") {
      if (depth >= limits.maxDepth) throw new PassportError("TOO_DEEP", `JSON exceeds depth ${limits.maxDepth} at ${path}.`);
      at++;
      space();
      if (c === "[") {
        const out: JsonValue[] = [];
        if (text[at] === "]") { at++; return out; }
        while (true) {
          out.push(value(depth + 1, `${path}[${out.length}]`));
          space();
          if (text[at] === "]") { at++; return out; }
          if (text[at++] !== ",") fail("Expected comma or closing bracket");
        }
      }
      const out: JsonObject = Object.create(null);
      if (text[at] === "}") { at++; return out; }
      while (true) {
        space();
        if (text[at] !== '"') fail("Expected object key");
        const key = string();
        const keyPath = `${path}[${JSON.stringify(key)}]`;
        if (Object.hasOwn(out, key)) throw new PassportError("DUPLICATE_KEY", `Duplicate key at ${keyPath}.`);
        if (++keys > limits.maxKeys) throw new PassportError("TOO_MANY_KEYS", `JSON exceeds ${limits.maxKeys} keys at ${keyPath}.`);
        space();
        if (text[at++] !== ":") fail("Expected colon");
        out[key] = value(depth + 1, keyPath);
        space();
        if (text[at] === "}") { at++; return out; }
        if (text[at++] !== ",") fail("Expected comma or closing brace");
      }
    }
    if (c === '"') return string();
    for (const [literal, result] of [["true", true], ["false", false], ["null", null]] satisfies [string, JsonValue][]) {
      if (text.startsWith(literal, at)) { at += literal.length; return result; }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(at));
    if (number) { at += number[0].length; return Number(number[0]); }
    return fail("Expected JSON value");
  };
  const result = value(0, "$");
  space();
  if (at !== text.length) fail("Unexpected trailing data");
  return result;
}

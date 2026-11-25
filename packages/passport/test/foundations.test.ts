import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Hex } from "../src/canonical.js";
import { DEFAULT_LIMITS } from "../src/limits.js";
import { parsePeerUrl, resolveUrl } from "../src/url.js";
import { parseStrictJson } from "../src/json.js";

describe("peer URLs", () => {
  it("normalizes URLs and derives a nested site base", () => {
    expect(parsePeerUrl("https://PEER.example:443/agents/transit")).toEqual({ networkUrl: "https://peer.example/agents/transit", siteBase: "https://peer.example/agents", origin: "https://peer.example", networkName: "transit" });
    expect(parsePeerUrl("https://peer.example/transit").siteBase).toBe("https://peer.example");
    expect(parsePeerUrl("https://peer.example/a/%74ransit").networkName).toBe("%74ransit");
  });
  it.each(["ftp://peer.example/transit", "not a url", "https://peer.example", "https://peer.example/a/", "https://peer.example/transit?", "https://peer.example/transit#", "https://peer.example/transit?q=1", "https://peer.example/transit#x"])("refuses invalid URL %s", url => expect(() => parsePeerUrl(url)).toThrow(expect.objectContaining({ code: "URL_INVALID" })));
  it("refuses credentials", () => expect(() => parsePeerUrl("https://a:b@peer.example/transit")).toThrow(expect.objectContaining({ code: "CREDENTIALS_IN_URL" })));
  it.each(["localhost", "127.0.0.1", "127.10.20.30", "[::1]"])("allows only loopback HTTP %s", host => {
    expect(parsePeerUrl(`http://${host}:8080/transit`).networkName).toBe("transit");
    expect(() => parsePeerUrl(`http://${host}/transit`, { allowLoopbackHttp: false })).toThrow(expect.objectContaining({ code: "HTTPS_REQUIRED" }));
  });
  it.each(["peer.example", "localhost.evil.example", "128.0.0.1", "[::2]"])("requires HTTPS for %s", host => expect(() => parsePeerUrl(`http://${host}/transit`)).toThrow(expect.objectContaining({ code: "HTTPS_REQUIRED" })));
  it("mirrors runtime path concatenation", () => {
    expect(resolveUrl("https://peer.example/agents", "/definition.json")).toBe("https://peer.example/agents/definition.json");
    expect(resolveUrl("https://peer.example/agents/", "../definition.json")).toBe("https://peer.example/definition.json");
    expect(resolveUrl("https://peer.example/agents", "https://other.example/a")).toBe("https://other.example/a");
  });
});

describe("strict JSON and canonical hashes", () => {
  const parse = (text: string) => parseStrictJson(text, DEFAULT_LIMITS);
  it.each(['null', 'true', 'false', '-1.23e+4', '-0', '"a\\n\\t\\b\\f\\r\\\\\\/\\"\\uD83D\\uDE00"', '{"x":[1,false,null,{"a":"b"}]}', ' \r\n [ ]\t '])("matches JSON.parse for %s", text => expect(parse(text)).toEqual(JSON.parse(text)));
  it.each(['', '[1,]', '{"a":1,}', '01', '+1', '1.', '1e', 'NaN', 'true false', '"\\x00"', '"\n"', '"\\uZZZZ"', '\uFEFF{}', '{a:1}', '[', '1e400', '-1e400', '"\\uD800"', '{"a" 1}', '"unterminated'])('rejects malformed JSON %s', text => expect(() => parse(text)).toThrow(expect.objectContaining({ code: "NOT_JSON" })));
  it("detects duplicate decoded keys at depth with a path", () => expect(() => parse('{"a":[{"name":1,"na\\u006de":2}]}')).toThrow(expect.objectContaining({ code: "DUPLICATE_KEY", message: expect.stringContaining('$["a"][0]["name"]') })));
  it("counts object keys and container depth exactly", () => {
    expect(parseStrictJson('{"a":1}', { maxDepth: 1, maxKeys: 1 })).toEqual({ a: 1 });
    expect(() => parseStrictJson('{"a":{}}', { maxDepth: 1, maxKeys: 2 })).toThrow(expect.objectContaining({ code: "TOO_DEEP" }));
    expect(() => parseStrictJson('{"a":{},"b":1}', { maxDepth: 2, maxKeys: 1 })).toThrow(expect.objectContaining({ code: "TOO_MANY_KEYS" }));
  });
  it("keeps prototype-related keys as plain data", () => {
    const value = parse('{"__proto__":{"polluted":true},"constructor":{"prototype":1},"prototype":2}');
    expect(value).toEqual(JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":1},"prototype":2}'));
    expect(Object.getPrototypeOf(value)).toBeNull();
    expect(Object.prototype).not.toHaveProperty("polluted");
  });
  it("canonicalizes by UTF-16 order, including numeric-looking keys", async () => {
    expect(canonicalJson({ "2": 2, "10": 10, "\uE000": 1, "😀": 2 })).toBe('{"10":10,"2":2,"😀":2,"\uE000":1}');
    expect(canonicalJson({ z: -0, a: ["\n", 2, true, null] })).toBe('{"a":["\\n",2,true,null],"z":0}');
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(await sha256Hex("abc"));
  });
});

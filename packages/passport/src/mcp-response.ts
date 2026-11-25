/** Adapt peer-controlled JSON-RPC responses before the reference runtime reads them. */
export function mcpResponseTransform(expectId: string | number, contentType: string): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const sse = /text\/event-stream/i.test(contentType);
  let text = "";
  let line = "";
  let block: string[] = [];
  let afterCr = false;

  const matches = (payload: string): boolean => {
    let rpc: unknown;
    try { rpc = JSON.parse(payload); } catch { return false; }
    if (!rpc || typeof rpc !== "object" || Array.isArray(rpc)) return false;
    if (!("result" in rpc) && !("error" in rpc)) return true; // notification
    return "id" in rpc && rpc.id === expectId;
  };
  const event = (controller: TransformStreamDefaultController<Uint8Array>) => {
    const payload = block.filter(l => l.trimStart().startsWith("data:")).map(l => l.slice(l.indexOf(":") + 1).trimStart()).join("\n");
    if (matches(payload)) controller.enqueue(encoder.encode(block.join("\n") + "\n\n"));
    block = [];
  };
  const lines = (chunk: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    // Treat CR as a terminator immediately, and swallow its optional following LF,
    // even in a later chunk. Lone CR blank lines need no further data to dispatch.
    for (const char of chunk) {
      if (afterCr && char === "\n") { afterCr = false; continue; }
      afterCr = char === "\r";
      if (char === "\r" || char === "\n") {
        if (line) block.push(line);
        else event(controller);
        line = "";
      } else line += char;
    }
  };
  return new TransformStream({
    transform(chunk, controller) {
      const decoded = decoder.decode(chunk, { stream: true });
      if (sse) lines(decoded, controller);
      else text += decoded;
    },
    flush(controller) {
      if (sse) {
        lines(decoder.decode(), controller);
        if (line) block.push(line);
        if (block.length) event(controller);
      } else {
        text += decoder.decode();
        if (text.trimStart().startsWith("{")) {
          const rpc: unknown = JSON.parse(text);
          if (!rpc || typeof rpc !== "object" || !("id" in rpc) || rpc.id !== expectId || (!("result" in rpc) && !("error" in rpc))) {
            throw new Error("Agent Passport: MCP response has no matching request ID.");
          }
          controller.enqueue(encoder.encode(text));
        } else {
          lines(text, controller);
          if (line) block.push(line);
          if (block.length) event(controller);
        }
      }
    },
  });
}

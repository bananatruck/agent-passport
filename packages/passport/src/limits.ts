import type { Limits } from "./types.js";

export const DEFAULT_LIMITS: Limits = {
  manifestBytes: 262144,
  definitionBytes: 1048576,
  linksBytes: 65536,
  timeoutMs: 8000,
  maxDepth: 64,
  maxKeys: 20000,
};

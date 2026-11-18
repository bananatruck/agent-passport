import type { PassportCode } from "./types.js";

export class PassportError extends Error {
  constructor(public readonly code: PassportCode, message: string) {
    super(message);
    this.name = "PassportError";
  }
}

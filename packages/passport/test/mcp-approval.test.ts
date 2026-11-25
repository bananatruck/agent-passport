// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { requestMcpApproval } from "../../../apps/site/src/mcp-approval.js";

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });
it.each(["Send", "Decline", "cancel"])("shows every argument as text and handles %s", async decision => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute("open"); } });
  const args = { request: "Help", note: "x".repeat(200), customer: "<img src=x onerror=alert(1)>" };
  const pending = requestMcpApproval({ url: "https://mcp.example/mcp", tool: "send", arguments: args });
  const dialog = document.querySelector("dialog");
  expect(JSON.parse(dialog!.querySelector("pre")!.textContent!)).toEqual({ tool: "send", arguments: args });
  expect(dialog!.querySelector("img")).toBeNull();
  if (decision === "cancel") dialog!.dispatchEvent(new Event("cancel", { cancelable: true }));
  else [...dialog!.querySelectorAll("button")].find(b => b.textContent === decision)!.click();
  expect(await pending).toBe(decision === "Send");
  expect(document.querySelector("dialog")).toBeNull();
});

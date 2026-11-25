import type { GuardOptions } from "agent-passport/guard";

type McpPreview = Parameters<NonNullable<GuardOptions["approveMcpCall"]>>[0];

/** Keep the complete payload visible and scrollable until the visitor decides. */
export function requestMcpApproval(preview: McpPreview): Promise<boolean> {
  return new Promise(resolve => {
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-label", "Approve MCP tool call");
    dialog.style.cssText = "max-width: min(90vw, 48rem); padding: 1.5rem; border-radius: 1rem;";
    const heading = document.createElement("h2");
    heading.textContent = "Send this tool call?";
    const destination = document.createElement("p");
    destination.textContent = preview.url;
    const payload = document.createElement("pre");
    payload.style.cssText = "max-height: 55vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere;";
    payload.textContent = JSON.stringify({ tool: preview.tool, arguments: preview.arguments }, null, 2);
    const decline = document.createElement("button");
    decline.textContent = "Decline";
    const send = document.createElement("button");
    send.textContent = "Send";
    const finish = (approved: boolean) => {
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(approved);
    };
    decline.addEventListener("click", () => finish(false));
    send.addEventListener("click", () => finish(true));
    dialog.addEventListener("cancel", event => { event.preventDefault(); finish(false); });
    dialog.append(heading, destination, payload, decline, send);
    document.body.append(dialog);
    try { dialog.showModal(); decline.focus(); }
    catch { finish(false); }
  });
}

// Registers the Tidewater Trip Desk page's operations with the agent runtime.
// agent-manifest.json loads this module through "actions.module"; the names listed in
// "actions.agentTools" become the model tools website_get_partner_passports and
// website_open_passport.
//
// The page (src/desk.ts) publishes a small read-only facade on globalThis.tidewaterDesk
// before it boots the runtime. These actions only read Agent Passport's results and
// move the page's focus; they never change a verdict, a pin or a consent decision.

const PARTNERS = ["harbor_ferry", "tidewhistle_rooms", "gull_deals"];

function desk() {
  const facade = globalThis.tidewaterDesk;
  if (!facade) throw new Error("The Trip Desk page is not ready.");
  return facade;
}

class SiteActions {
  static registerActions(actions) {
    actions.register({
      name: "get_partner_passports",
      description:
        "Read what Agent Passport found for each partner network this session: verdict (verified, unreviewed, changed, refused), " +
        "a one-sentence summary, failed checks, warnings and the changes since the pinned review. Partners not contacted yet show verdict null.",
      effect: "read",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: () => desk().getPassports(),
    });
    actions.register({
      name: "open_passport",
      description:
        "Scroll the page to one partner's passport and highlight it, so the visitor can read every check. " +
        "Without a partner, opens the most recently checked one. Changes nothing else.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          partner: { type: "string", enum: PARTNERS, description: "Partner network name." },
        },
      },
      execute: (args) => desk().openPassport(args.partner ?? null),
    });
  }
}

export const registerActions = SiteActions.registerActions;

import type { PassportReport, Verdict } from "../../../packages/passport/src/types";

export interface PeerPreset {
  id: "harbor_ferry" | "tidewhistle_rooms" | "gull_deals";
  label: string;
  url: string;
  expected: Verdict;
}

export const PEERS: readonly PeerPreset[] = [
  {
    id: "harbor_ferry",
    label: "Harbor Ferry",
    url: "http://127.0.0.1:4101/ferry_schedule",
    expected: "verified",
  },
  {
    id: "tidewhistle_rooms",
    label: "Tidewhistle Rooms",
    url: "http://127.0.0.1:4102/rooms_booking",
    expected: "changed",
  },
  {
    id: "gull_deals",
    label: "Gull Deals",
    url: "http://127.0.0.1:4103/weekend_deals",
    expected: "refused",
  },
] as const;

export async function inspect(_url: string): Promise<PassportReport> {
  return Promise.reject(new Error("not wired yet"));
}

/** Services the admin can switch off and on (Admin → Services on/off). Ids match the dashboard tiles. */
export const SWITCHES = [
  { id: "boost", label: "Boost Account", hint: "Followers, likes, views (website and reseller API)" },
  { id: "verify", label: "Get Verification Code", hint: "US numbers for SMS codes" },
  { id: "esim_us", label: "eSIMs: US phone line", hint: "The US plans you deliver by hand" },
  { id: "esim_travel", label: "eSIMs: Travel data", hint: "Instant travel data eSIMs" },
  { id: "giftcards", label: "Gift Cards & Subscriptions", hint: "Buying gift cards" },
  { id: "airtime", label: "Airtime & Data", hint: "MTN, Airtel, Glo, 9mobile top-ups" },
  { id: "sell", label: "Sell Gift Cards & Crypto", hint: "Customers selling to you" },
  { id: "ship", label: "Send/Receive a Package", hint: "Courier pickup and delivery" },
  { id: "docs", label: "Business Documents", hint: "Invoices, receipts, CVs" },
  { id: "invite", label: "Invite Friends & Earn", hint: "Hides the tile (bonus amounts are set in Invite friends)" },
  { id: "p2p", label: "P2P marketplace", hint: "Hides the P2P tab and stops new ads and purchases; open trades carry on" },
] as const;
export type SwitchId = (typeof SWITCHES)[number]["id"];
export const isSwitchId = (id: string): id is SwitchId => SWITCHES.some((s) => s.id === id);

/** Which dashboard tile a switch hides (the eSIM tile goes only when both eSIM kinds are off). */
export function hiddenTiles(off: readonly string[]): Set<string> {
  const set = new Set(off.filter((id) => !id.startsWith("esim_")));
  if (off.includes("esim_us") && off.includes("esim_travel")) set.add("esim");
  return set;
}

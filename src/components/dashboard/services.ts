/**
 * The services shown on the dashboard home. To add one: add an entry here.
 * "live" services open their screen (view id must be handled in DashboardApp);
 * "soon" ones show as Coming soon.
 */
export type HubService = {
  id: string;
  title: string;
  description: string;
  /** SVG path (24x24, stroked) */
  icon: string;
  status: "live" | "soon";
};

export const HUB_SERVICES: HubService[] = [
  {
    id: "boost",
    title: "Boost Account",
    description: "Followers, likes, views and more for Instagram, TikTok, YouTube and 30+ platforms.",
    icon: "M13 2 3 14h7l-1 8 10-12h-7l1-8z",
    status: "live",
  },
  {
    id: "esim",
    title: "eSIMs",
    description: "Travel data eSIMs for 190+ countries, delivered instantly. Or a US phone line: talk, text and data.",
    icon: "M7 2h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM9 12h6v6H9z",
    status: "live",
  },
  {
    id: "giftcards",
    title: "Gift Cards & Subscriptions",
    description: "Official gift cards and subscription vouchers: Amazon, Apple, PlayStation, Steam and more. Delivered instantly.",
    icon: "M3 8h18v4H3zM5 12h14v9H5zM12 8v13M12 8c-2-4-6-4-6-1s4 1 6 1c2 0 6 2 6-1s-4-3-6 1",
    status: "live",
  },
  {
    id: "airtime",
    title: "Airtime & Data",
    description: "Recharge MTN, Airtel, Glo and 9mobile: airtime and data bundles, sent instantly.",
    icon: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2M13 6l-3 5h4l-3 5",
    status: "live",
  },
  {
    id: "verify",
    title: "Get Verification Code",
    description: "Receive one-time SMS codes on a virtual number.",
    icon: "M5 4h14v16H5zM9 9h6M9 13h6M9 17h3",
    status: "live",
  },
];

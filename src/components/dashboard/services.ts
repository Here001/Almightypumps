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
    description: "Mobile data for travel. Buy online, scan the QR code, connect in minutes.",
    icon: "M7 2h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM9 12h6v6H9z",
    status: "soon",
  },
  {
    id: "verify",
    title: "Get Verification Code",
    description: "Receive one-time SMS codes on a virtual number.",
    icon: "M5 4h14v16H5zM9 9h6M9 13h6M9 17h3",
    status: "soon",
  },
];

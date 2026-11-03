/** Small stroked 24x24 icons for shop categories (keys match SHOP_ICONS in src/server/shop.ts). */
export const SHOP_ICON_PATHS: Record<string, string> = {
  bag: "M6 7h12l1 13H5zM9 7a3 3 0 0 1 6 0",
  sim: "M7 2h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM9 12h6v6H9z",
  gift: "M3 8h18v4H3zM5 12h14v9H5zM12 8v13M12 8c-2-4-6-4-6-1s4 1 6 1c2 0 6 2 6-1s-4-3-6 1",
  phone: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
  tv: "M3 6h18v12H3zM8 21h8M12 18v3",
  game: "M6 9h12a4 4 0 0 1 0 8c-2 0-3-2-6-2s-4 2-6 2a4 4 0 0 1 0-8zM8 11v4M6 13h4M16 12h.01M18 14h.01",
  wifi: "M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01",
  music: "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z",
  bolt: "M13 2 3 14h7l-1 8 10-12h-7l1-8z",
  card: "M3 6h18v12H3zM3 10h18M7 15h4",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
};
export const SHOP_ICON_NAMES = Object.keys(SHOP_ICON_PATHS);

"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { formatMoney, formatNaira, formatUsd, type DisplayCurrency } from "@/core/currency";

type Ctx = {
  currency: DisplayCurrency;
  setCurrency: (c: DisplayCurrency) => void;
  canSwitch: boolean;
  /** A price in the customer's chosen currency. */
  money: (kobo: number) => string;
  /** An amount we will actually charge: always Naira, with the dollar figure alongside in dollar mode. */
  charge: (kobo: number) => string;
};

const CurrencyContext = createContext<Ctx>({
  currency: "NGN", setCurrency: () => {}, canSwitch: false, money: formatNaira, charge: formatNaira,
});

const KEY = "ap_currency";

export function CurrencyProvider({ usdRateKobo, children }: { usdRateKobo: number; children: React.ReactNode }) {
  const canSwitch = usdRateKobo > 0;
  const [currency, setState] = useState<DisplayCurrency>("NGN");

  // Remember the choice on this device (a convenience only; failures are harmless).
  useEffect(() => {
    try {
      if (canSwitch && window.localStorage.getItem(KEY) === "USD") setState("USD");
    } catch { /* private mode etc. */ }
  }, [canSwitch]);

  const setCurrency = (c: DisplayCurrency) => {
    setState(c);
    try { window.localStorage.setItem(KEY, c); } catch { /* ignore */ }
  };

  const active: DisplayCurrency = canSwitch ? currency : "NGN";
  const value: Ctx = {
    currency: active,
    setCurrency,
    canSwitch,
    money: (kobo) => formatMoney(kobo, active, usdRateKobo),
    charge: (kobo) => (active === "USD" ? `${formatNaira(kobo)} (≈ ${formatUsd(kobo, usdRateKobo)})` : formatNaira(kobo)),
  };
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export const useCurrency = () => useContext(CurrencyContext);

/** ₦ / $ segmented switch. Renders nothing until the admin sets a dollar rate. */
export function CurrencySwitch() {
  const { currency, setCurrency, canSwitch } = useCurrency();
  if (!canSwitch) return null;
  return (
    <div className="ap-cur" role="group" aria-label="Show prices in">
      {(["NGN", "USD"] as const).map((c) => (
        <button key={c} type="button" aria-pressed={currency === c} onClick={() => setCurrency(c)} title={c === "NGN" ? "Naira" : "US Dollars"}>
          {c === "NGN" ? "₦" : "$"}
        </button>
      ))}
    </div>
  );
}

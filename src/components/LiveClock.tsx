"use client";

import { useEffect, useState } from "react";

const fmt = (n: number) => String(n).padStart(2, "0");

/** Relógio ao vivo da topbar — espelha o "São José/SC · dd/mm/yyyy · hh:mm:ss"
 *  do mockup, fixado em São Paulo. Hidrata client-side para evitar mismatch. */
export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) {
    return <span style={{ color: "var(--txt3)" }}>São Paulo · —</span>;
  }
  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      São Paulo · {fmt(now.getDate())}/{fmt(now.getMonth() + 1)}/{now.getFullYear()} ·{" "}
      {fmt(now.getHours())}:{fmt(now.getMinutes())}:{fmt(now.getSeconds())}
    </span>
  );
}

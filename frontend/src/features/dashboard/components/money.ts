import { formatMoney } from "@/lib/format";

// Big figures stay readable on small cards: exact below 10 million, compact above it.
export function bigMoney(cents: number, currency: string) {
  const exact = formatMoney(cents, currency);
  if (Math.abs(cents) < 1_000_000_000) return { text: exact, exact };
  const text = new Intl.NumberFormat(currency === "PKR" ? "en-PK" : "en", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(cents / 100);
  return { text, exact };
}

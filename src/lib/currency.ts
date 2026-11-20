// ============================================================================
// StockFlow Global Custom Currency System
// ISO 4217 Currency Definitions, Symbols, Formatting, and Multi-Currency Helpers
// ============================================================================

export type CurrencyInfo = {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
};

export const COMMON_CURRENCIES: CurrencyInfo[] = [
  { code: "EUR", name: "Euro", symbol: "€", decimals: 2 },
  { code: "USD", name: "US Dollar", symbol: "$", decimals: 2 },
  { code: "GBP", name: "British Pound", symbol: "£", decimals: 2 },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", decimals: 2 },
  { code: "PKR", name: "Pakistani Rupee", symbol: "₨", decimals: 2 },
  { code: "AED", name: "UAE Dirham", symbol: "AED", decimals: 2 },
  { code: "CAD", name: "Canadian Dollar", symbol: "CA$", decimals: 2 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", decimals: 2 },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", decimals: 0 },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", decimals: 2 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2 },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", decimals: 2 },
  { code: "SAR", name: "Saudi Riyal", symbol: "SAR", decimals: 2 },
  { code: "TRY", name: "Turkish Lira", symbol: "₺", decimals: 2 },
  { code: "PLN", name: "Polish Zloty", symbol: "zł", decimals: 2 },
  { code: "SEK", name: "Swedish Krona", symbol: "kr", decimals: 2 },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr", decimals: 2 },
  { code: "DKK", name: "Danish Krone", symbol: "kr", decimals: 2 },
  { code: "ZAR", name: "South African Rand", symbol: "R", decimals: 2 },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", decimals: 2 },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$", decimals: 2 },
];

const CURRENCY_MAP = new Map<string, CurrencyInfo>(
  COMMON_CURRENCIES.map((c) => [c.code.toUpperCase(), c])
);

/**
 * Returns currency info for a given code, defaulting to EUR if unspecified.
 */
export function getCurrency(code?: string | null): CurrencyInfo {
  const normalized = (code || "EUR").trim().toUpperCase();
  const found = CURRENCY_MAP.get(normalized);
  if (found) return found;

  return {
    code: normalized,
    name: normalized,
    symbol: normalized,
    decimals: 2,
  };
}

/**
 * Returns the short currency symbol (e.g. "€", "$", "£", "₨", "AED").
 */
export function getCurrencySymbol(code?: string | null): string {
  return getCurrency(code).symbol;
}

/**
 * Formats a monetary amount with symbol and currency code.
 * Example:
 * formatMoney(1250, "EUR") -> "€1,250.00 EUR"
 * formatMoney(1250, "USD") -> "$1,250.00 USD"
 * formatMoney(1250, "PKR") -> "₨1,250.00 PKR"
 */
export function formatMoney(
  amount: number | null | undefined,
  currencyCode?: string | null,
  options?: {
    showCode?: boolean;
    compact?: boolean;
    maximumFractionDigits?: number;
  }
): string {
  const val = Number.isFinite(amount) ? (amount as number) : 0;
  const curr = getCurrency(currencyCode);
  const showCode = options?.showCode ?? true;
  const maxDecimals = options?.maximumFractionDigits ?? curr.decimals;

  const formattedNum = val.toLocaleString(undefined, {
    minimumFractionDigits: maxDecimals === 0 ? 0 : 2,
    maximumFractionDigits: maxDecimals,
  });

  if (showCode) {
    return `${curr.symbol}${formattedNum} ${curr.code}`;
  }
  return `${curr.symbol}${formattedNum}`;
}

/**
 * Formats a compact monetary amount for KPI cards and charts (e.g. "€1.2M EUR" or "$45K USD").
 */
export function formatCompactMoney(
  amount: number | null | undefined,
  currencyCode?: string | null
): string {
  const val = Number.isFinite(amount) ? (amount as number) : 0;
  const curr = getCurrency(currencyCode);

  let formattedNum = "";
  if (Math.abs(val) >= 1_000_000) {
    formattedNum = (val / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  } else if (Math.abs(val) >= 1_000) {
    formattedNum = (val / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  } else {
    formattedNum = val.toFixed(0);
  }

  return `${curr.symbol}${formattedNum} ${curr.code}`;
}

/**
 * Aggregates a list of monetary amounts grouped strictly by currency.
 * Guarantees that different currencies are never combined into a false total.
 */
export function groupTotalsByCurrency(
  items: Array<{ amount?: number; totalValue?: number; valueEur?: number; price?: number; currency?: string | null }>
): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const code = (item.currency || "EUR").trim().toUpperCase();
    const currTotal = map.get(code) || 0;
    const num = item.amount ?? item.totalValue ?? item.valueEur ?? item.price ?? 0;
    map.set(code, currTotal + (Number.isFinite(num) ? num : 0));
  }
  return map;
}

/**
 * Formats a multi-currency summary string (e.g. "€12,500.00 EUR · $8,400.00 USD").
 */
export function formatCurrencySummary(
  totals: Map<string, number> | Record<string, number>
): string {
  const entries: [string, number][] =
    totals instanceof Map
      ? Array.from(totals.entries())
      : Object.entries(totals);

  if (entries.length === 0) return "€0.00 EUR";

  return entries
    .map(([code, sum]) => formatMoney(sum, code))
    .join(" · ");
}

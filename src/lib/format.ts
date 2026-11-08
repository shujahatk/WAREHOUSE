const integerFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const tonnesFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const percentFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function formatInteger(value: number): string {
  return integerFormat.format(value);
}

export function formatKg(kg: number): string {
  return `${formatInteger(kg)} kg`;
}

export function formatTonnesFromKg(kg: number): string {
  return `${tonnesFormat.format(kg / 1000)} t`;
}

export function formatPercent(ratio: number): string {
  return `${percentFormat.format(ratio * 100)}%`;
}

/** Largest-remainder rounding so displayed one-decimal shares sum to 100.0%. */
export function formatSharePercents(weights: number[]): string[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    return weights.map(() => "0.0%");
  }

  const tenths = weights.map((weight) => (weight / total) * 1000);
  const base = tenths.map((value) => Math.floor(value));
  let leftover = 1000 - base.reduce((sum, value) => sum + value, 0);
  const order = tenths
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);

  let cursor = 0;
  while (leftover > 0 && order.length > 0) {
    base[order[cursor].index] += 1;
    leftover -= 1;
    cursor = (cursor + 1) % order.length;
  }

  return base.map((value) => `${(value / 10).toFixed(1)}%`);
}

export function formatIsoDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  const monthLabel = MONTHS[Number(month) - 1] ?? month;
  return `${Number(day)} ${monthLabel} ${year}`;
}

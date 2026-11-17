/**
 * Design tokens and styling constants for the StockFlow Worker Mobile Module.
 * Visual language conforms to the StockFlow Admin Console green enterprise identity:
 * - Clean off-white background (#F8FAFC)
 * - Pure white cards with subtle borders (#E2E8F0 / neutral-200)
 * - Deep forest green (#064E3B / emerald-800) for primary actions and active highlights
 * - Muted sage green (#ECFDF5 / emerald-50) for secondary accents and subtle pills
 * - Crisp dark charcoal headings (#0F172A / neutral-900) and muted slate secondary text
 * - Restrained status colors: emerald for completed, amber for warnings/demurrage, rose for overtime/errors
 * - Mobile-first ergonomic touch targets (min 44-48px)
 */

export const WORKER_THEME = {
  bg: "bg-[#F8FAFC]",
  card: "bg-white border border-neutral-200/90 shadow-2xs rounded-xl",
  cardHover: "hover:border-neutral-300 hover:shadow-xs transition-all",
  cardSolid: "bg-white border border-neutral-200 rounded-xl",
  cardInset: "bg-neutral-50/90 border border-neutral-200/80 rounded-lg",
  input: "h-12 w-full rounded-xl border border-neutral-300 bg-white px-3.5 text-sm text-neutral-900 placeholder-neutral-400 focus:border-emerald-700 focus:outline-hidden focus:ring-1 focus:ring-emerald-700",
  select: "h-12 w-full rounded-xl border border-neutral-300 bg-white px-3.5 text-sm text-neutral-900 focus:border-emerald-700 focus:outline-hidden focus:ring-1 focus:ring-emerald-700",
  btnPrimary: "flex h-12 min-h-[48px] w-full items-center justify-center rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-900 active:scale-[0.98] disabled:opacity-50",
  btnSecondary: "flex h-12 min-h-[48px] w-full items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-800 shadow-2xs transition hover:bg-neutral-50 active:scale-[0.98]",
  btnOutline: "flex h-12 min-h-[48px] items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 active:scale-[0.98]",
  btnDanger: "flex h-12 min-h-[48px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 active:scale-[0.98]",
  btnSuccess: "flex h-12 min-h-[48px] w-full items-center justify-center rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-800 active:scale-[0.98]",
  badgeEmerald: "inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800",
  badgeSage: "inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800",
  badgeAmber: "inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800",
  badgeRose: "inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800",
  badgeBlue: "inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800",
  badgeNeutral: "inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700",
} as const;

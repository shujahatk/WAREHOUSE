/**
 * Design tokens and styling constants for the StockFlow Worker Mobile Module.
 * Visual language: Dark navy background, purple/violet primary accents, dark cards with subtle borders.
 */

export const WORKER_THEME = {
  bg: "bg-[#0B0F19]",
  card: "bg-[#121B2E] border border-slate-800/80 shadow-md",
  cardHover: "hover:border-violet-500/40 transition-colors",
  cardGlass: "bg-[#121B2E]/90 backdrop-blur-md border border-slate-800/80 shadow-lg",
  input: "h-12 w-full rounded-xl border border-slate-700 bg-[#0E1626] px-3.5 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500",
  select: "h-12 w-full rounded-xl border border-slate-700 bg-[#0E1626] px-3.5 text-sm text-white focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500",
  btnPrimary: "flex h-12 min-h-[48px] w-full items-center justify-center rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-md shadow-violet-900/30 transition hover:bg-violet-500 active:scale-[0.98] disabled:opacity-50",
  btnSecondary: "flex h-12 min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-700 bg-[#162035] px-4 text-sm font-medium text-slate-200 transition hover:bg-[#1C2942] active:scale-[0.98]",
  btnOutline: "flex h-12 min-h-[48px] items-center justify-center rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 text-sm font-medium text-violet-300 transition hover:bg-violet-500/20 active:scale-[0.98]",
  btnDanger: "flex h-12 min-h-[48px] items-center justify-center rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 text-sm font-medium text-rose-400 transition hover:bg-rose-500/20 active:scale-[0.98]",
  badgeViolet: "inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/15 px-2.5 py-0.5 text-xs font-semibold text-violet-300",
  badgeEmerald: "inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400",
  badgeRose: "inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/15 px-2.5 py-0.5 text-xs font-semibold text-rose-400",
  badgeAmber: "inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-400",
  badgeBlue: "inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/15 px-2.5 py-0.5 text-xs font-semibold text-blue-400",
  badgeSlate: "inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/80 px-2.5 py-0.5 text-xs font-medium text-slate-300",
} as const;

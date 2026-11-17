/**
 * Design tokens and styling constants for the StockFlow Worker Mobile Module.
 * Visual language:
 * - Solid deep navy background (#080D1C)
 * - Dark slate cards with subtle borders (#202A3D)
 * - Restrained purple accent (#6655E8) for primary buttons, active navigation, and key highlights
 * - Crisp white primary headings and muted slate secondary text
 * - Green for completed operations, red/amber for warnings and demurrage
 * - No flashy neon gradients or glow effects
 */

export const WORKER_THEME = {
  bg: "bg-[#080D1C]",
  card: "bg-[#202A3D] border border-slate-700/60 shadow-sm",
  cardHover: "hover:border-slate-600 transition-colors",
  cardSolid: "bg-[#202A3D] border border-slate-700/60",
  cardInset: "bg-[#162032] border border-slate-700/50",
  input: "h-12 w-full rounded-xl border border-slate-700 bg-[#162032] px-3.5 text-sm text-white placeholder-slate-400 focus:border-[#6655E8] focus:outline-none focus:ring-1 focus:ring-[#6655E8]",
  select: "h-12 w-full rounded-xl border border-slate-700 bg-[#162032] px-3.5 text-sm text-white focus:border-[#6655E8] focus:outline-none focus:ring-1 focus:ring-[#6655E8]",
  btnPrimary: "flex h-12 min-h-[48px] w-full items-center justify-center rounded-xl bg-[#6655E8] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5846db] active:scale-[0.98] disabled:opacity-50",
  btnSecondary: "flex h-12 min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-700 bg-[#202A3D] px-4 text-sm font-medium text-slate-200 transition hover:bg-[#28354c] active:scale-[0.98]",
  btnOutline: "flex h-12 min-h-[48px] items-center justify-center rounded-xl border border-[#6655E8]/40 bg-[#6655E8]/10 px-4 text-sm font-medium text-[#8B7DF0] transition hover:bg-[#6655E8]/20 active:scale-[0.98]",
  btnDanger: "flex h-12 min-h-[48px] items-center justify-center rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 text-sm font-medium text-rose-400 transition hover:bg-rose-500/20 active:scale-[0.98]",
  btnSuccess: "flex h-12 min-h-[48px] w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 active:scale-[0.98]",
  badgePurple: "inline-flex items-center gap-1 rounded-md border border-[#6655E8]/30 bg-[#6655E8]/15 px-2 py-0.5 text-xs font-semibold text-[#8B7DF0]",
  badgeEmerald: "inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400",
  badgeRose: "inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/15 px-2.5 py-0.5 text-xs font-semibold text-rose-400",
  badgeAmber: "inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-400",
  badgeBlue: "inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/15 px-2.5 py-0.5 text-xs font-semibold text-blue-400",
  badgeSlate: "inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/80 px-2.5 py-0.5 text-xs font-medium text-slate-300",
} as const;

"use client";

import { useMemo, useState } from "react";
import type { OfferView } from "@/domain/view";
import { cn } from "@/lib/cn";

interface MonthData {
  key: string; // YYYY-MM
  label: string; // "Jan 24"
  purchasingCount: number;
  sellingCount: number;
  purchasingVolume: number;
  sellingVolume: number;
  totalCount: number;
  totalVolume: number;
}

export function OffersActivityChart({
  offers,
  monthsCount = 6,
}: {
  offers: OfferView[];
  monthsCount?: number;
}) {
  const [metric, setMetric] = useState<"volume" | "count">("volume");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Group real offers by calendar month
  const monthlyData = useMemo(() => {
    const now = new Date();
    const months: MonthData[] = [];

    for (let i = monthsCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const monthNum = String(d.getMonth() + 1).padStart(2, "0");
      const key = `${year}-${monthNum}`;
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

      months.push({
        key,
        label,
        purchasingCount: 0,
        sellingCount: 0,
        purchasingVolume: 0,
        sellingVolume: 0,
        totalCount: 0,
        totalVolume: 0,
      });
    }

    const monthMap = new Map<string, MonthData>();
    for (const m of months) {
      monthMap.set(m.key, m);
    }

    for (const o of offers) {
      if (!o.createdAt) continue;
      const key = o.createdAt.slice(0, 7); // YYYY-MM
      const bucket = monthMap.get(key);
      if (!bucket) continue;

      const val = o.totalValue || 0;
      if (o.kind === "purchasing") {
        bucket.purchasingCount += 1;
        bucket.purchasingVolume += val;
      } else {
        bucket.sellingCount += 1;
        bucket.sellingVolume += val;
      }
      bucket.totalCount += 1;
      bucket.totalVolume += val;
    }

    return months;
  }, [offers, monthsCount]);

  // Compute maximum values for scaling
  const { maxVal, totalPeriodVolume, totalPeriodCount } = useMemo(() => {
    let max = 1;
    let periodVol = 0;
    let periodCnt = 0;

    for (const m of monthlyData) {
      periodVol += m.totalVolume;
      periodCnt += m.totalCount;
      const cur = metric === "volume" ? m.totalVolume : m.totalCount;
      if (cur > max) max = cur;
    }

    return {
      maxVal: Math.max(max, metric === "volume" ? 10000 : 5),
      totalPeriodVolume: periodVol,
      totalPeriodCount: periodCnt,
    };
  }, [monthlyData, metric]);

  // SVG dimensions
  const svgWidth = 640;
  const svgHeight = 220;
  const paddingLeft = 60;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 35;
  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  const barGroupWidth = chartWidth / monthlyData.length;
  const barWidth = Math.min(24, Math.max(12, (barGroupWidth - 14) / 2));

  const formatYValue = (val: number) => {
    if (metric === "volume") {
      if (val >= 1_000_000) return `€${(val / 1_000_000).toFixed(1)}M`;
      if (val >= 1_000) return `€${Math.round(val / 1_000)}k`;
      return `€${Math.round(val)}`;
    }
    return Math.round(val).toString();
  };

  const yTicks = [1, 0.75, 0.5, 0.25, 0].map((pct) => ({
    pct,
    value: maxVal * pct,
    y: paddingTop + chartHeight * (1 - pct),
  }));

  return (
    <div className="rounded-xl border border-neutral-200/90 bg-white p-5 shadow-2xs">
      {/* Header & Toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-600" />
            <h3 className="text-sm font-bold text-neutral-950 tracking-tight">
              Monthly Deal Flow &amp; Trading Activity
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">
            Real historical activity across purchasing supplies and client sales.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Key Totals Pill */}
          <div className="hidden md:flex items-center gap-3 text-xs text-neutral-600 bg-neutral-50 px-3 py-1.5 rounded-lg border border-neutral-200/80">
            <span>
              Period Volume: <strong className="text-neutral-900 font-semibold">€{totalPeriodVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
            </span>
            <span className="text-neutral-300">|</span>
            <span>
              Deals: <strong className="text-neutral-900 font-semibold">{totalPeriodCount}</strong>
            </span>
          </div>

          {/* Metric Selector Buttons */}
          <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-100/80 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMetric("volume")}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                metric === "volume"
                  ? "bg-white text-emerald-950 shadow-2xs"
                  : "text-neutral-600 hover:text-neutral-900"
              )}
            >
              Trading Volume (€)
            </button>
            <button
              type="button"
              onClick={() => setMetric("count")}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                metric === "count"
                  ? "bg-white text-emerald-950 shadow-2xs"
                  : "text-neutral-600 hover:text-neutral-900"
              )}
            >
              Offer Count
            </button>
          </div>
        </div>
      </div>

      {/* SVG Chart Area */}
      <div className="relative mt-4 w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-52 select-none"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="purchasingGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#059669" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id="sellingGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f766e" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.5" />
            </linearGradient>
          </defs>

          {/* Grid lines and Y-axis labels */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={paddingLeft}
                y1={tick.y}
                x2={svgWidth - paddingRight}
                y2={tick.y}
                stroke="#f1f5f9"
                strokeWidth={tick.pct === 0 ? 1.5 : 1}
                strokeDasharray={tick.pct === 0 ? "none" : "3 3"}
              />
              <text
                x={paddingLeft - 8}
                y={tick.y + 3}
                textAnchor="end"
                className="fill-neutral-400 text-[10px] font-mono"
              >
                {formatYValue(tick.value)}
              </text>
            </g>
          ))}

          {/* Data Bars */}
          {monthlyData.map((d, idx) => {
            const centerX = paddingLeft + idx * barGroupWidth + barGroupWidth / 2;
            const x1 = centerX - barWidth - 2;
            const x2 = centerX + 2;

            const val1 = metric === "volume" ? d.purchasingVolume : d.purchasingCount;
            const val2 = metric === "volume" ? d.sellingVolume : d.sellingCount;

            const height1 = maxVal > 0 ? (val1 / maxVal) * chartHeight : 0;
            const height2 = maxVal > 0 ? (val2 / maxVal) * chartHeight : 0;

            const y1 = paddingTop + chartHeight - height1;
            const y2 = paddingTop + chartHeight - height2;

            const isHovered = hoveredIndex === idx;

            return (
              <g
                key={d.key}
                className="cursor-pointer transition-opacity"
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Hover column background highlight */}
                {isHovered ? (
                  <rect
                    x={centerX - barGroupWidth / 2}
                    y={paddingTop}
                    width={barGroupWidth}
                    height={chartHeight}
                    fill="#f8fafc"
                    rx={4}
                  />
                ) : null}

                {/* Purchasing Bar */}
                <rect
                  x={x1}
                  y={y1}
                  width={barWidth}
                  height={Math.max(2, height1)}
                  rx={3}
                  fill="url(#purchasingGradient)"
                  className="transition-all hover:opacity-100"
                  opacity={hoveredIndex === null || isHovered ? 1 : 0.6}
                />

                {/* Selling Bar */}
                <rect
                  x={x2}
                  y={y2}
                  width={barWidth}
                  height={Math.max(2, height2)}
                  rx={3}
                  fill="url(#sellingGradient)"
                  className="transition-all hover:opacity-100"
                  opacity={hoveredIndex === null || isHovered ? 1 : 0.6}
                />

                {/* X-axis Label */}
                <text
                  x={centerX}
                  y={svgHeight - 12}
                  textAnchor="middle"
                  className={cn(
                    "text-[10px] transition-colors",
                    isHovered ? "fill-neutral-950 font-bold" : "fill-neutral-500 font-medium"
                  )}
                >
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredIndex !== null && monthlyData[hoveredIndex] ? (
          (() => {
            const d = monthlyData[hoveredIndex];
            return (
              <div
                className="pointer-events-none absolute top-2 right-4 rounded-lg border border-neutral-200/90 bg-white/95 backdrop-blur-xs p-2.5 text-xs shadow-md transition-all animate-in fade-in zoom-in-95 duration-100"
                style={{ minWidth: "180px" }}
              >
                <div className="font-bold text-neutral-950 border-b border-neutral-100 pb-1 flex items-center justify-between">
                  <span>{d.label}</span>
                  <span className="font-mono text-[10px] text-neutral-400">Activity</span>
                </div>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-emerald-800 font-medium">
                      <span className="h-2 w-2 rounded-full bg-emerald-600" />
                      Purchasing:
                    </span>
                    <span className="font-semibold text-neutral-900 font-mono">
                      {metric === "volume"
                        ? `€${d.purchasingVolume.toLocaleString()}`
                        : `${d.purchasingCount} offers`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-teal-800 font-medium">
                      <span className="h-2 w-2 rounded-full bg-teal-600" />
                      Selling:
                    </span>
                    <span className="font-semibold text-neutral-900 font-mono">
                      {metric === "volume"
                        ? `€${d.sellingVolume.toLocaleString()}`
                        : `${d.sellingCount} offers`}
                    </span>
                  </div>
                  <div className="border-t border-neutral-100 pt-1 mt-1 flex items-center justify-between gap-3 text-neutral-500">
                    <span>Total {metric === "volume" ? "Volume" : "Deals"}:</span>
                    <span className="font-bold text-neutral-950 font-mono">
                      {metric === "volume"
                        ? `€${d.totalVolume.toLocaleString()}`
                        : `${d.totalCount}`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()
        ) : null}
      </div>

      {/* Legend & Summary Footer */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4 border-t border-neutral-100 pt-3 text-xs text-neutral-600">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />
            <span className="font-medium text-neutral-700">Purchasing Material Inflow</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-teal-600" />
            <span className="font-medium text-neutral-700">Selling Client Outflow</span>
          </div>
        </div>
        <span className="text-[11px] text-neutral-400 font-mono">
          Last {monthsCount} months aggregated
        </span>
      </div>
    </div>
  );
}


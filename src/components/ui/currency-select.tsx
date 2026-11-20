"use client";

import { useId, useMemo, useState } from "react";
import { COMMON_CURRENCIES, getCurrency } from "@/lib/currency";
import { cn } from "@/lib/cn";

export function CurrencySelect({
  value,
  onChange,
  disabled = false,
  className,
  id: customId,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const generatedId = useId();
  const selectId = customId || generatedId;
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const currentCurrency = useMemo(() => getCurrency(value), [value]);

  const filteredCurrencies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COMMON_CURRENCIES;
    return COMMON_CURRENCIES.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q)
    );
  }, [search]);

  function handleSelect(code: string) {
    onChange(code);
    setIsOpen(false);
    setSearch("");
  }

  function handleCustomAdd() {
    const custom = search.trim().toUpperCase();
    if (custom.length >= 2 && custom.length <= 5) {
      onChange(custom);
      setIsOpen(false);
      setSearch("");
    }
  }

  return (
    <div className={cn("relative", className)}>
      <button
        id={selectId}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 transition",
          "hover:border-neutral-400 focus:border-neutral-950 focus:outline-hidden",
          disabled && "cursor-not-allowed bg-neutral-100 opacity-60"
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-1.5 font-medium">
          <span className="inline-flex items-center justify-center rounded-sm bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-neutral-800">
            {currentCurrency.code}
          </span>
          <span className="text-neutral-500">({currentCurrency.symbol})</span>
          <span className="truncate text-neutral-700">{currentCurrency.name}</span>
        </span>
        <svg
          className={cn("h-4 w-4 text-neutral-400 transition", isOpen && "rotate-180")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setIsOpen(false);
              setSearch("");
            }}
          />
          <div className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full min-w-[240px] rounded-xl border border-neutral-200 bg-white p-2 shadow-xl animate-in fade-in zoom-in-95">
            <div className="mb-2">
              <input
                type="text"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code, name, or symbol…"
                className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
              />
            </div>
            <ul className="max-h-44 overflow-y-auto space-y-0.5 text-xs" role="listbox">
              {filteredCurrencies.map((c) => {
                const isSelected = c.code === currentCurrency.code;
                return (
                  <li key={c.code}>
                    <button
                      type="button"
                      onClick={() => handleSelect(c.code)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition",
                        isSelected
                          ? "bg-neutral-900 font-semibold text-white"
                          : "text-neutral-700 hover:bg-neutral-100"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 font-mono text-[10px] font-bold",
                            isSelected ? "bg-neutral-800 text-white" : "bg-neutral-100 text-neutral-800"
                          )}
                        >
                          {c.code}
                        </span>
                        <span className={isSelected ? "text-neutral-200" : "text-neutral-500"}>
                          {c.symbol}
                        </span>
                        <span>{c.name}</span>
                      </span>
                      {isSelected ? <span>✓</span> : null}
                    </button>
                  </li>
                );
              })}
              {filteredCurrencies.length === 0 && search.trim() ? (
                <li className="p-2 text-center text-xs text-neutral-500">
                  <p className="mb-1.5">No standard match for &ldquo;{search}&rdquo;</p>
                  <button
                    type="button"
                    onClick={handleCustomAdd}
                    className="rounded bg-neutral-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-neutral-800"
                  >
                    Use ISO Code &ldquo;{search.trim().toUpperCase()}&rdquo;
                  </button>
                </li>
              ) : null}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}

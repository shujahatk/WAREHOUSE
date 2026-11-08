"use client";

import { useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";
import type { RecordCard, TableCell, TableColumn, TableRecord } from "@/lib/table";

type PhoneLayout = "table" | "cards" | "compact";

type DataTableProps = {
  caption: string;
  columns: TableColumn[];
  rows: TableRecord[];
  searchPlaceholder?: string;
  searchable?: boolean;
  minWidthClassName?: string;
  phoneLayout?: PhoneLayout;
};

export function DataTable({
  caption,
  columns,
  rows,
  searchPlaceholder = "Search records",
  searchable = true,
  minWidthClassName = "min-w-[720px]",
  phoneLayout = "table",
}: DataTableProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows =
    searchable && normalizedQuery
      ? rows.filter((row) => row.searchText.toLowerCase().includes(normalizedQuery))
      : rows;
  const showPhoneList = phoneLayout !== "table";

  return (
    <div>
      {searchable ? (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <form
            role="search"
            className="w-full sm:max-w-xs"
            onSubmit={(event) => event.preventDefault()}
          >
            <label className="block">
              <span className="sr-only">Search records</span>
              <span className="relative block">
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={searchPlaceholder}
                  autoComplete="off"
                  className="h-9 w-full border border-neutral-300 bg-white px-3 pr-16 text-sm text-neutral-950 placeholder:text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute inset-y-0 right-2 text-xs font-medium text-neutral-700 hover:text-neutral-950"
                  >
                    Clear
                  </button>
                ) : null}
              </span>
            </label>
          </form>
          <p className="text-xs text-neutral-500" aria-live="polite">
            Showing {visibleRows.length} of {rows.length} records
          </p>
        </div>
      ) : null}
      {visibleRows.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-10 text-center">
          <p className="text-sm font-medium text-neutral-950">
            {rows.length === 0 ? "No records" : "No matching records"}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-neutral-600">
            {rows.length === 0
              ? "This sample has no rows to show."
              : "Nothing in this sample matches the search."}
          </p>
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-3 text-sm font-medium text-neutral-950 underline underline-offset-4"
            >
              Clear search
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {phoneLayout === "cards" ? <RecordCards rows={visibleRows} /> : null}
          {phoneLayout === "compact" ? <CompactRecords rows={visibleRows} /> : null}
          <ScrollTable
            caption={caption}
            columns={columns}
            rows={visibleRows}
            minWidthClassName={minWidthClassName}
            className={showPhoneList ? "hidden md:block" : undefined}
          />
        </>
      )}
    </div>
  );
}

function RecordCards({ rows }: { rows: TableRecord[] }) {
  return (
    <ul className="space-y-2 md:hidden">
      {rows.map((row) =>
        row.card ? (
          <li key={row.id} className="border border-neutral-200 bg-white px-3 py-3">
            <CardHeading card={row.card} />
            {row.card.fields.length > 0 ? (
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                {row.card.fields.map((field) => (
                  <div key={field.label} className="min-w-0">
                    <dt className="text-[11px] font-medium tracking-[0.12em] text-neutral-500 uppercase">
                      {field.label}
                    </dt>
                    <dd
                      className={cn(
                        "mt-0.5 text-sm break-words text-neutral-950",
                        field.mono && "font-mono text-[13px] tabular-nums",
                      )}
                    >
                      {field.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        ) : null,
      )}
    </ul>
  );
}

function CompactRecords({ rows }: { rows: TableRecord[] }) {
  return (
    <ul className="divide-y divide-neutral-200 border border-neutral-200 bg-white md:hidden">
      {rows.map((row) =>
        row.card ? (
          <li key={row.id} className="px-3 py-2.5">
            <CardHeading card={row.card} />
            {row.card.summary ?? row.card.subtitle ? (
              <p className="mt-1 text-xs leading-5 text-neutral-600">
                {row.card.summary ?? row.card.subtitle}
              </p>
            ) : null}
          </li>
        ) : null,
      )}
    </ul>
  );
}

function CardHeading({ card }: { card: RecordCard }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium break-words text-neutral-950">{card.title}</p>
        {card.subtitle && card.fields.length > 0 ? (
          <p className="mt-0.5 font-mono text-[11px] break-all text-neutral-500">{card.subtitle}</p>
        ) : null}
      </div>
      {card.status ? (
        <span className="shrink-0">
          <StatusBadge label={card.status.label} tone={card.status.tone} />
        </span>
      ) : null}
    </div>
  );
}

function ScrollTable({
  caption,
  columns,
  rows,
  minWidthClassName,
  className,
}: {
  caption: string;
  columns: TableColumn[];
  rows: TableRecord[];
  minWidthClassName: string;
  className?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [atEnd, setAtEnd] = useState(true);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    function update() {
      const element = scrollerRef.current;
      if (!element) {
        return;
      }
      const overflows = element.scrollWidth > element.clientWidth + 1;
      setOverflowing(overflows);
      setAtEnd(!overflows || element.scrollLeft + element.clientWidth >= element.scrollWidth - 1);
    }

    update();
    scroller.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [rows, columns]);

  const showCue = overflowing && !atEnd;

  return (
    <div className={className}>
      <div ref={scrollerRef} className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className={cn("w-full border-collapse text-left text-sm", minWidthClassName)}>
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-neutral-50 text-[11px] tracking-[0.08em] text-neutral-500 uppercase">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.header}
                  scope="col"
                  className={cn(
                    "px-3 py-2 font-medium whitespace-nowrap",
                    column.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-t border-neutral-200 transition-colors duration-150 hover:bg-neutral-50"
              >
                {row.cells.map((cell, index) => {
                  const column = columns[index];
                  return (
                    <td
                      key={`${row.id}-${column?.header ?? index}`}
                      className={cn(
                        "px-3 py-2 align-top",
                        column?.align === "right" ? "text-right" : "text-left",
                        column?.wrap ? "min-w-48 whitespace-normal" : "whitespace-nowrap",
                      )}
                    >
                      <CellValue cell={cell} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showCue ? (
        <p className="mt-1 text-[11px] leading-4 text-neutral-500">Scroll sideways for more columns.</p>
      ) : null}
    </div>
  );
}

function CellValue({ cell }: { cell: TableCell }) {
  if (cell.kind === "status") {
    return <StatusBadge label={cell.label} tone={cell.tone} />;
  }

  const emphasis =
    cell.emphasis === "strong"
      ? "font-medium text-neutral-950"
      : cell.emphasis === "muted"
        ? "text-neutral-500"
        : "text-neutral-800";

  return (
    <span className={cn(emphasis, cell.mono && "font-mono text-[13px] tabular-nums")}>{cell.value}</span>
  );
}

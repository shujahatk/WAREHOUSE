"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/permissions";
import { navActive, navSections, type NavItem } from "@/lib/navigation";

export function Mark({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 20 16" className="h-4 w-5" aria-hidden="true">
        <path d="M2 14 7 2 M8 14 13 2 M14 14l3-7" fill="none" stroke={light ? "#fff" : "#111"} strokeWidth="1.7" strokeLinecap="round" />
      </svg>
      <span className={cn("text-sm font-semibold tracking-tight", light ? "text-white" : "text-neutral-950")}>
        StockFlow
      </span>
    </span>
  );
}

function ItemList({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const active = navActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                active ? "bg-white/10 text-white" : "text-neutral-300 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function Sidebar({
  pathname,
  role,
  onNavigate,
}: {
  pathname: string;
  role: Role;
  onNavigate?: () => void;
}) {
  const visibleSections = navSections
    .map((section) => ({
      title: section.title,
      items: section.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#111111] text-white">
      <div className="flex h-16 items-center px-5">
        <Link href="/dashboard" onClick={onNavigate} aria-label="StockFlow">
          <Mark light />
        </Link>
      </div>
      <nav aria-label="Primary" className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {visibleSections.map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-1.5 text-[11px] font-medium tracking-[0.14em] text-neutral-500 uppercase">
              {section.title}
            </p>
            <ItemList items={section.items} pathname={pathname} onNavigate={onNavigate} />
          </div>
        ))}
      </nav>
      <p className="px-5 py-4 text-[11px] leading-5 text-neutral-500">
        StockFlow Warehouse & Logistics
      </p>
    </div>
  );
}

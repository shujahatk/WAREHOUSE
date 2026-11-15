"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { useDemo } from "@/components/providers/workspace-provider";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/permissions";
import { navActive, navSections, type NavItem } from "@/lib/navigation";

export function Mark({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <div
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-lg font-bold text-xs tracking-wider",
          light
            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 shadow-xs"
            : "bg-neutral-900 text-white",
        )}
      >
        RM
      </div>
      <div className="flex flex-col">
        <span className={cn("text-sm font-bold tracking-tight leading-none", light ? "text-white" : "text-neutral-950")}>
          RM
        </span>
        <span className={cn("text-[10px] font-medium tracking-wider uppercase mt-0.5", light ? "text-emerald-400/80" : "text-neutral-500")}>
          Trading &amp; Logistics
        </span>
      </div>
    </span>
  );
}

function ItemList({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate?: () => void }) {
  const { state } = useDemo();
  const pendingRequests = (state.accounts || []).filter((u) => u.approvalStatus === "pending").length;

  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = navActive(pathname, item.href);
        const hasPendingBadge = item.href === "/users" && pendingRequests > 0;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "group flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400",
                active
                  ? "bg-emerald-900/60 text-emerald-100 font-semibold shadow-xs border-l-2 border-emerald-400 pl-2"
                  : "text-emerald-100/70 hover:bg-[#122e23] hover:text-white",
              )}
            >
              <span className="flex items-center gap-2.5">
                <span className={cn("transition-colors", active ? "text-emerald-300" : "text-emerald-300/60 group-hover:text-emerald-300")}>
                  <Icon name={item.icon} />
                </span>
                {item.label}
              </span>
              <div className="flex items-center gap-1.5">
                {hasPendingBadge ? (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-300 border border-amber-400/40">
                    {pendingRequests}
                  </span>
                ) : null}
                {active ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                ) : null}
              </div>
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
    <div className="flex h-full min-h-0 flex-col bg-[#091b14] border-r border-[#143125] text-white">
      <div className="flex h-16 items-center px-5 border-b border-[#143125]/60">
        <Link href="/dashboard" onClick={onNavigate} aria-label="RM" className="hover:opacity-90 transition">
          <Mark light />
        </Link>
      </div>
      <nav aria-label="Primary" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {visibleSections.map((section) => (
          <div key={section.title}>
            <p className="px-2.5 pb-1.5 text-[10px] font-semibold tracking-[0.14em] text-emerald-300/40 uppercase">
              {section.title}
            </p>
            <ItemList items={section.items} pathname={pathname} onNavigate={onNavigate} />
          </div>
        ))}
      </nav>
      <div className="px-4 py-3.5 border-t border-[#143125]/80 flex items-center justify-between text-[11px] text-emerald-200/60">
        <span className="truncate">RM Logistics Platform</span>
        <span className="flex items-center gap-1.5 text-emerald-400 font-mono text-[10px]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live
        </span>
      </div>
    </div>
  );
}

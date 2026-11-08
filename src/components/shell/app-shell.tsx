"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { useSession } from "@/components/shell/auth-gate";
import { Sidebar } from "@/components/shell/sidebar";
import { TopNav } from "@/components/shell/top-nav";
import { cn } from "@/lib/cn";
import { mobileTabs, moreNav, navActive } from "@/lib/navigation";
import { canAccess, roleLabel } from "@/lib/permissions";
import { WorkspaceSearch } from "@/components/shell/search-context";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { identity, logout } = useSession();
  const [query, setQuery] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const allowed = canAccess(identity.role, pathname);
  const tabs = mobileTabs.filter((item) => item.roles.includes(identity.role));
  const moreItems = moreNav.filter((item) => item.roles.includes(identity.role));

  return (
    <WorkspaceSearch.Provider value={query}>
      <div className="min-h-screen bg-[#f4f4f5] text-neutral-950">
        <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-[232px] lg:flex-col">
          <Sidebar pathname={pathname} role={identity.role} />
        </div>
        <div className="lg:pl-[232px]">
          <TopNav query={query} onQuery={setQuery} identity={identity} onLogout={logout} />
          <main className="px-4 py-5 pb-24 sm:px-6 lg:px-8 lg:pb-8">
            <div className="mx-auto max-w-6xl">
              {allowed ? (
                children
              ) : (
                <section className="mx-auto max-w-lg rounded-xl border border-neutral-200 bg-white p-6">
                  <h1 className="text-xl font-semibold text-neutral-950">Access denied</h1>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">
                    Your {roleLabel(identity.role)} account does not have permission to access this module.
                  </p>
                </section>
              )}
            </div>
          </main>
        </div>
        <nav
          aria-label="Mobile"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white lg:hidden"
        >
          <ul className="grid grid-cols-5">
            {tabs.map((item) => {
              const active = navActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-16 flex-col items-center justify-center gap-1 text-[10px]",
                      active ? "text-neutral-950" : "text-neutral-500",
                    )}
                  >
                    <Icon name={item.icon} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((value) => !value)}
                className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[10px] text-neutral-500"
              >
                <Icon name="menu" />
                More
              </button>
            </li>
          </ul>
        </nav>
        {moreOpen ? (
          <div className="lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              className="fixed inset-0 z-40 bg-neutral-950/40"
              onClick={() => setMoreOpen(false)}
            />
            <div className="fixed inset-x-0 bottom-16 z-50 rounded-t-2xl border border-neutral-200 bg-white p-3">
              <ul className="grid grid-cols-2 gap-1">
                {moreItems.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-3 py-3 text-sm text-neutral-800"
                    >
                      <Icon name={item.icon} />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
    </WorkspaceSearch.Provider>
  );
}

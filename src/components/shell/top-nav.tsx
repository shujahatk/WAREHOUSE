"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { Icon } from "@/components/icons";
import { formatInstant, type DemoIdentity } from "@/domain/view";
import { roleLabel } from "@/lib/permissions";

export function TopNav({
  query,
  onQuery,
  identity,
  onLogout,
}: {
  query: string;
  onQuery: (value: string) => void;
  identity: DemoIdentity;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const { state, markNotificationRead, markAllNotificationsRead } = useDemo();

  useLayoutEffect(() => {
    const details = detailsRef.current;
    return () => {
      setOpen(false);
      if (details) {
        details.open = false;
      }
    };
  }, []);

  const notifications = state.notifications || [];
  const unreadNotifications = notifications.filter((n) => !n.read);
  const unreadCount = unreadNotifications.length;
  const recentNotifications = notifications.slice(0, 5);

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-base font-semibold tracking-tight text-neutral-950 lg:hidden">
          RM
        </Link>
        <form
          role="search"
          className="relative hidden min-w-0 flex-1 sm:block lg:max-w-md"
          onSubmit={(event) => event.preventDefault()}
        >
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-neutral-400">
            <Icon name="inventory" className="h-3.5 w-3.5" />
          </span>
          <label className="sr-only" htmlFor="workspace-search">
            Search by PO, container, supplier
          </label>
          <input
            id="workspace-search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search by PO, container, supplier..."
            className="h-10 w-full rounded-lg border border-neutral-200 bg-neutral-50 pr-3 pl-9 text-sm text-neutral-950 placeholder:text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
          />
        </form>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              aria-expanded={open}
              aria-label="Notifications"
              onClick={() => setOpen((value) => !value)}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 text-neutral-800 hover:bg-neutral-50"
            >
              <Icon name="bell" />
              {unreadCount > 0 ? (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow-xs">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </button>
            {open ? (
              <div className="fixed inset-x-3 top-16 z-40 sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-96 rounded-2xl border border-neutral-200 bg-white shadow-lg overflow-hidden text-sm">
                <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50/70 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-950">Notifications</span>
                    {unreadCount > 0 ? (
                      <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-medium text-white">
                        {unreadCount} new
                      </span>
                    ) : null}
                  </div>
                  {unreadCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => markAllNotificationsRead()}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800"
                    >
                      Mark all as read
                    </button>
                  ) : null}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-neutral-100">
                  {recentNotifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-neutral-500">
                      No notifications at this time.
                    </div>
                  ) : (
                    recentNotifications.map((notif) => (
                      <div
                        key={notif.id}
                        className={`p-3 transition-colors hover:bg-neutral-50/80 ${!notif.read ? "bg-blue-50/20" : ""
                          }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            href={notif.link || "/notifications"}
                            onClick={() => {
                              if (!notif.read) markNotificationRead(notif.id);
                              setOpen(false);
                            }}
                            className="min-w-0 flex-1 group"
                          >
                            <p className="text-xs font-medium text-neutral-950 group-hover:text-blue-600">
                              {notif.title}
                            </p>
                            <p className="mt-0.5 text-xs text-neutral-600 line-clamp-2">
                              {notif.message}
                            </p>
                            <span className="mt-1 block text-[10px] text-neutral-400">
                              {formatInstant(notif.createdAt)}
                            </span>
                          </Link>
                          {!notif.read ? (
                            <button
                              type="button"
                              title="Mark as read"
                              onClick={(e) => {
                                e.stopPropagation();
                                markNotificationRead(notif.id);
                              }}
                              className="mt-0.5 h-2 w-2 rounded-full bg-blue-600 shrink-0 hover:scale-125 transition-transform"
                            />
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <Link
                  href="/notifications"
                  onClick={() => setOpen(false)}
                  className="block border-t border-neutral-100 bg-neutral-50/50 p-2.5 text-center text-xs font-medium text-neutral-900 hover:bg-neutral-100 transition-colors"
                >
                  View all notifications →
                </Link>
              </div>
            ) : null}
          </div>
          <details ref={detailsRef} className="relative">
            <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-full border border-neutral-200 pr-3 pl-1">
              <span suppressHydrationWarning className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-950 text-[11px] font-medium text-white">
                {identity.name ? identity.name.slice(0, 1) : "U"}
              </span>
              <span suppressHydrationWarning className="hidden text-sm font-medium text-neutral-950 sm:inline">
                {`${identity.name || "User"} · ${roleLabel(identity.role)}`}
              </span>
            </summary>
            <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-neutral-200 bg-white p-3 text-sm shadow-sm">
              <p suppressHydrationWarning className="font-medium text-neutral-950">{identity.name || "User"}</p>
              <p suppressHydrationWarning className="mt-1 text-xs text-neutral-500">
                {`${roleLabel(identity.role)}${identity.warehouse ? ` · ${identity.warehouse}` : ""}`}
              </p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (detailsRef.current) {
                    detailsRef.current.open = false;
                  }
                  onLogout();
                }}
                className="mt-3 min-h-[36px] text-sm font-medium text-neutral-950 underline underline-offset-4"
              >
                Log out
              </button>
            </div>
          </details>
        </div>
      </div>
      <form role="search" className="relative mt-3 w-full sm:hidden" onSubmit={(event) => event.preventDefault()}>
        <label className="sr-only" htmlFor="workspace-search-mobile">
          Search by PO, container, supplier
        </label>
        <input
          id="workspace-search-mobile"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search by PO, container, supplier..."
          className="h-10 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-base sm:text-sm"
        />
      </form>
    </header>
  );
}

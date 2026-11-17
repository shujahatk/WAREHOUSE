"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/cn";

export function WorkerBottomNav() {
  const pathname = usePathname();

  const tabs = [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: "dashboard" as const,
      isActive: pathname === "/dashboard",
    },
    {
      href: "/containers",
      label: "Inbound",
      icon: "containers" as const,
      isActive: pathname === "/containers" || pathname.startsWith("/containers/"),
    },
    {
      href: "/outbound",
      label: "Outbound",
      icon: "outbound" as const,
      isActive: pathname === "/outbound" || pathname.startsWith("/outbound/"),
    },
    {
      href: "/inventory",
      label: "Inventory",
      icon: "inventory" as const,
      isActive: pathname === "/inventory" || pathname.startsWith("/inventory/"),
    },
  ];

  return (
    <nav
      aria-label="Worker Mobile Navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800/90 bg-[#0E1626]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-4px_20px_rgba(0,0,0,0.4)]"
    >
      <div className="mx-auto max-w-lg">
        <ul className="grid grid-cols-4 h-16">
          {tabs.map((tab) => {
            return (
              <li key={tab.href} className="flex">
                <Link
                  href={tab.href}
                  aria-current={tab.isActive ? "page" : undefined}
                  className={cn(
                    "flex flex-1 flex-col items-center justify-center gap-1 transition-all active:scale-95",
                    tab.isActive
                      ? "text-violet-400 font-semibold"
                      : "text-slate-400 hover:text-slate-200 font-medium"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-12 items-center justify-center rounded-full transition-all",
                      tab.isActive ? "bg-violet-600/20 text-violet-400" : "text-slate-400"
                    )}
                  >
                    <Icon name={tab.icon} />
                  </div>
                  <span className="text-[11px] tracking-tight">{tab.label}</span>
                  {tab.isActive ? (
                    <span className="h-1 w-1 rounded-full bg-violet-400 -mt-0.5" />
                  ) : (
                    <span className="h-1 w-1 opacity-0 -mt-0.5" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

type NavTab = {
  href: string;
  label: string;
  isActive: boolean;
  icon: (props: { active: boolean }) => React.JSX.Element;
};

// Lucide-style precision icons for the four core operational destinations
function DashboardIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.25 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 transition-transform duration-200"
      aria-hidden="true"
    >
      <rect width="7" height="9" x="3" y="3" rx="1.5" />
      <rect width="7" height="5" x="14" y="3" rx="1.5" />
      <rect width="7" height="9" x="14" y="12" rx="1.5" />
      <rect width="7" height="5" x="3" y="16" rx="1.5" />
    </svg>
  );
}

function InboundIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.25 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 transition-transform duration-200"
      aria-hidden="true"
    >
      <path d="M12 17V3" />
      <path d="m6 11 6 6 6-6" />
      <path d="M19 21H5" />
    </svg>
  );
}

function OutboundIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.25 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 transition-transform duration-200"
      aria-hidden="true"
    >
      <path d="m18 9-6-6-6 6" />
      <path d="M12 3v14" />
      <path d="M5 21h14" />
    </svg>
  );
}

function InventoryIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.25 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 transition-transform duration-200"
      aria-hidden="true"
    >
      <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
      <path d="M12 22V12" />
      <polyline points="3.29 7 12 12 20.71 7" />
    </svg>
  );
}

export function WorkerBottomNav() {
  const pathname = usePathname();

  const tabs: NavTab[] = [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: DashboardIcon,
      isActive: pathname === "/dashboard",
    },
    {
      href: "/schedules/unloading",
      label: "Unloading",
      icon: InboundIcon,
      isActive: pathname === "/schedules/unloading" || pathname.startsWith("/schedules/unloading") || pathname.startsWith("/containers"),
    },
    {
      href: "/schedules/loading",
      label: "Loading",
      icon: OutboundIcon,
      isActive: pathname === "/schedules/loading" || pathname.startsWith("/schedules/loading") || pathname.startsWith("/outbound"),
    },
    {
      href: "/inventory",
      label: "Inventory",
      icon: InventoryIcon,
      isActive: pathname === "/inventory" || pathname.startsWith("/inventory/"),
    },
  ];

  const activeIndex = tabs.findIndex((tab) => tab.isActive);

  return (
    <nav
      aria-label="Worker Operational Navigation"
      className="fixed inset-x-0 bottom-3 z-40 flex justify-center px-3.5 pointer-events-none pb-[env(safe-area-inset-bottom,0px)]"
    >
      {/* Floating dock surface with frosted backdrop blur, elegant borders, and soft layered shadow */}
      <div className="pointer-events-auto relative w-full max-w-[420px] rounded-2xl border border-neutral-200/90 bg-white/95 p-1.5 shadow-[0_10px_28px_-6px_rgba(0,0,0,0.12),0_4px_10px_-2px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.03)] backdrop-blur-md">
        {/* Animated sliding sage green active indicator pill */}
        {activeIndex >= 0 ? (
          <div
            aria-hidden="true"
            className="absolute top-1.5 bottom-1.5 rounded-xl border border-emerald-200/90 bg-emerald-50/90 shadow-2xs transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
            style={{
              left: `calc(${activeIndex * 25}% + 6px)`,
              width: "calc(25% - 12px)",
            }}
          />
        ) : null}

        {/* Four equal-width destination tabs */}
        <ul className="relative z-10 grid grid-cols-4 h-[54px] select-none">
          {tabs.map((tab) => {
            const IconComponent = tab.icon;
            return (
              <li key={tab.href} className="flex">
                <Link
                  href={tab.href}
                  aria-current={tab.isActive ? "page" : undefined}
                  className={cn(
                    "group relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition-all duration-200 active:scale-95",
                    tab.isActive
                      ? "text-emerald-950 font-bold"
                      : "text-neutral-500 hover:text-neutral-800 font-medium"
                  )}
                >
                  {/* Icon wrapper with subtle active scale and deep forest green color */}
                  <div
                    className={cn(
                      "flex items-center justify-center transition-all duration-200",
                      tab.isActive
                        ? "text-emerald-900 scale-105"
                        : "text-neutral-500 group-hover:text-neutral-700 scale-100"
                    )}
                  >
                    <IconComponent active={tab.isActive} />
                  </div>

                  {/* Clean text label */}
                  <span
                    className={cn(
                      "text-[11px] leading-tight tracking-tight transition-colors duration-200",
                      tab.isActive
                        ? "font-bold text-emerald-950"
                        : "font-medium text-neutral-500 group-hover:text-neutral-700"
                    )}
                  >
                    {tab.label}
                  </span>

                  {/* Tiny deep green active indicator dot */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-1 w-1 rounded-full bg-emerald-700 transition-all duration-300 -mt-0.5",
                      tab.isActive
                        ? "opacity-100 scale-100"
                        : "opacity-0 scale-50"
                    )}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

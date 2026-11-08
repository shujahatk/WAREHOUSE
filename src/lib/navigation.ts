import type { IconName } from "@/components/icons";
import type { ActiveRole, Role } from "@/lib/permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  roles: Role[];
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

const ALL: ActiveRole[] = ["owner", "manager", "worker"];
const OFFICE: ActiveRole[] = ["owner", "manager"];
const ADMIN: ActiveRole[] = ["owner"];

export const navSections: NavSection[] = [
  {
    title: "Main",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard", roles: ALL },
      { href: "/tasks", label: "Loading & Unloading Requests", icon: "documents", roles: ALL },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/purchases", label: "PO & SO Orders", icon: "purchases", roles: OFFICE },
      { href: "/containers", label: "Incoming / Unloading", icon: "containers", roles: ALL },
      { href: "/outbound", label: "Outgoing / Loading", icon: "outbound", roles: ALL },
    ],
  },
  {
    title: "Warehouse",
    items: [
      { href: "/inventory", label: "Inventory", icon: "inventory", roles: ALL },
      { href: "/stock-movements", label: "Stock Movements", icon: "movements", roles: ALL },
      { href: "/transfers", label: "Transfers", icon: "transfers", roles: OFFICE },
      { href: "/warehouses", label: "Warehouses", icon: "warehouses", roles: OFFICE },
    ],
  },
  {
    title: "Directories",
    items: [
      { href: "/suppliers", label: "Suppliers", icon: "suppliers", roles: OFFICE },
      { href: "/customers", label: "Customers", icon: "customers", roles: OFFICE },
      { href: "/materials", label: "Materials & Packaging", icon: "inventory", roles: OFFICE },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/users", label: "Users", icon: "users", roles: ADMIN },
      { href: "/reports", label: "Reports", icon: "reports", roles: ADMIN },
      { href: "/audit", label: "Audit Log", icon: "documents", roles: ADMIN },
      { href: "/settings", label: "Settings", icon: "settings", roles: ADMIN },
    ],
  },
];

export const primaryNav: NavItem[] = navSections
  .filter((section) => section.title === "Main" || section.title === "Operations" || section.title === "Warehouse")
  .flatMap((section) => section.items);

export const recordNav: NavItem[] = navSections
  .filter((section) => section.title === "Directories" || section.title === "Administration")
  .flatMap((section) => section.items);

export const mobileTabs: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", roles: ALL },
  { href: "/tasks", label: "Requests", icon: "documents", roles: ALL },
  { href: "/containers", label: "Incoming", icon: "containers", roles: ALL },
  { href: "/outbound", label: "Outgoing", icon: "outbound", roles: ALL },
];

export const moreNav: NavItem[] = navSections
  .flatMap((section) => section.items)
  .filter((item) => !mobileTabs.some((tab) => tab.href === item.href));

export function navActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

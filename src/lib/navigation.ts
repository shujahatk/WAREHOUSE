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

const ALL: ActiveRole[] = ["owner", "manager", "worker", "moderator"];
const WAREHOUSE_OPS: ActiveRole[] = ["owner", "manager", "worker"];
const OFFICE: ActiveRole[] = ["owner", "manager"];
const OFFERS_ROLES: ActiveRole[] = ["owner", "moderator"];
const ADMIN: ActiveRole[] = ["owner"];
const STAFF: ActiveRole[] = ["manager"];

export const navSections: NavSection[] = [
  {
    title: "Main",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard", roles: ALL },
      { href: "/analytics", label: "Analytics", icon: "reports", roles: OFFICE },
      { href: "/tasks", label: "Requests", icon: "documents", roles: WAREHOUSE_OPS },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/purchases", label: "PO & SO Orders", icon: "purchases", roles: OFFICE },
      { href: "/containers", label: "Incoming / Unloading", icon: "containers", roles: WAREHOUSE_OPS },
      { href: "/outbound", label: "Outgoing / Loading", icon: "outbound", roles: WAREHOUSE_OPS },
    ],
  },
  {
    title: "Warehouse",
    items: [
      { href: "/inventory", label: "Inventory", icon: "inventory", roles: WAREHOUSE_OPS },
      { href: "/stock-movements", label: "Stock Movements", icon: "movements", roles: ["manager", "worker"] },
      { href: "/transfers", label: "Transfers", icon: "transfers", roles: STAFF },
      { href: "/warehouses", label: "Warehouses", icon: "warehouses", roles: OFFICE },
    ],
  },
  {
    title: "Offers",
    items: [
      { href: "/offers", label: "Offers Dashboard", icon: "dashboard", roles: OFFERS_ROLES },
      { href: "/offers/purchasing", label: "Purchasing Offers", icon: "purchases", roles: OFFERS_ROLES },
      { href: "/offers/selling", label: "Selling Offers", icon: "sales", roles: OFFERS_ROLES },
    ],
  },
  {
    title: "Directories",
    items: [
      { href: "/suppliers", label: "Suppliers", icon: "suppliers", roles: STAFF },
      { href: "/customers", label: "Customers", icon: "customers", roles: STAFF },
      { href: "/materials", label: "Materials & Packaging", icon: "inventory", roles: STAFF },
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
  .filter((section) => section.title === "Main" || section.title === "Offers" || section.title === "Operations" || section.title === "Warehouse")
  .flatMap((section) => section.items);

export const recordNav: NavItem[] = navSections
  .filter((section) => section.title === "Directories" || section.title === "Administration")
  .flatMap((section) => section.items);

export const mobileTabs: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", roles: ALL },
  { href: "/offers", label: "Offers", icon: "dashboard", roles: OFFERS_ROLES },
  { href: "/tasks", label: "Requests", icon: "documents", roles: WAREHOUSE_OPS },
  { href: "/containers", label: "Incoming", icon: "containers", roles: WAREHOUSE_OPS },
  { href: "/outbound", label: "Outgoing", icon: "outbound", roles: WAREHOUSE_OPS },
];

export const moreNav: NavItem[] = navSections
  .flatMap((section) => section.items)
  .filter((item) => !mobileTabs.some((tab) => tab.href === item.href));

export function navActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/offers") return pathname === "/offers";
  return pathname === href || pathname.startsWith(`${href}/`);
}

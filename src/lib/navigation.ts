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
const OFFERS_ROLES: Role[] = ["owner", "moderator", "offers_user"];
const OFFERS_INTERNAL_ONLY: Role[] = ["owner", "moderator"];
const ADMIN: ActiveRole[] = ["owner"];
const STAFF: ActiveRole[] = ["manager"];

export const navSections: NavSection[] = [
  {
    title: "Main",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard", roles: ALL },
      { href: "/tasks", label: "Requests", icon: "documents", roles: ["owner", "worker"] },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/purchases", label: "PO & SO Orders", icon: "purchases", roles: OFFICE },
      { href: "/schedules/unloading", label: "Unloading Schedule", icon: "containers", roles: WAREHOUSE_OPS },
      { href: "/schedules/loading", label: "Loading Schedule", icon: "outbound", roles: WAREHOUSE_OPS },
      { href: "/verification", label: "Pending Verification", icon: "check", roles: OFFICE },
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
      { href: "/offers/selling", label: "Selling Offers", icon: "sales", roles: OFFERS_INTERNAL_ONLY },
      { href: "/offers/sold", label: "Sold", icon: "check", roles: OFFERS_INTERNAL_ONLY },
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
  { href: "/schedules/unloading", label: "Unloading", icon: "containers", roles: WAREHOUSE_OPS },
  { href: "/schedules/loading", label: "Loading", icon: "outbound", roles: WAREHOUSE_OPS },
  { href: "/verification", label: "Verify", icon: "check", roles: OFFICE },
  { href: "/offers", label: "Offers", icon: "dashboard", roles: OFFERS_ROLES },
];

export const moreNav: NavItem[] = navSections
  .flatMap((section) => section.items)
  .filter((item) => !mobileTabs.some((tab) => tab.href === item.href));

export function navActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/offers") return pathname === "/offers";
  return pathname === href || pathname.startsWith(`${href}/`);
}

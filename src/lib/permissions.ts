export type ActiveRole = "owner" | "manager" | "worker" | "moderator";
export type Role = ActiveRole | "offers_user" | "customer" | "data-entry" | "management";

export const ACTIVE_ROLES: readonly ActiveRole[] = ["owner", "manager", "worker", "moderator"] as const;

const ALL_ACTIVE: Role[] = ["owner", "manager", "worker", "moderator", "offers_user"];
const ADMIN_AND_STAFF: Role[] = ["owner", "manager"];
const OFFERS_ACCESS_ROLES: Role[] = ["owner", "moderator", "offers_user"];
const ADMIN_ONLY: Role[] = ["owner"];

const ROUTE_RULES: { prefix: string; roles: Role[] }[] = [
  { prefix: "/roadmap", roles: [] },
  { prefix: "/chat", roles: [] },
  { prefix: "/sales", roles: [] },
  { prefix: "/offers", roles: OFFERS_ACCESS_ROLES },
  { prefix: "/users", roles: ADMIN_ONLY },
  { prefix: "/reports", roles: ADMIN_ONLY },
  { prefix: "/analytics", roles: ADMIN_ONLY },
  { prefix: "/notifications", roles: ALL_ACTIVE },
  { prefix: "/audit", roles: ADMIN_ONLY },
  { prefix: "/settings", roles: ADMIN_ONLY },
  { prefix: "/transfers", roles: ADMIN_ONLY },
  { prefix: "/purchases", roles: ADMIN_AND_STAFF },
  { prefix: "/customers", roles: ADMIN_ONLY },
  { prefix: "/suppliers", roles: ADMIN_ONLY },
  { prefix: "/warehouses", roles: [] },
  { prefix: "/materials", roles: ADMIN_ONLY },
  { prefix: "/schedules", roles: ["owner", "manager", "worker"] },
  { prefix: "/verification", roles: ["owner", "manager"] },
  { prefix: "/tasks", roles: ["owner", "worker"] },
  { prefix: "/dashboard", roles: ["owner", "manager", "worker", "moderator"] },
  { prefix: "/containers", roles: ["owner", "worker"] },
  { prefix: "/outbound", roles: ["owner", "worker"] },
  { prefix: "/inventory", roles: ["owner", "worker"] },
  { prefix: "/documents", roles: ["owner", "worker"] },
  { prefix: "/stock-movements", roles: ["owner", "worker"] },
];

export function isActiveRole(role: string): role is ActiveRole {
  return (ACTIVE_ROLES as readonly string[]).includes(role);
}

export function normalizeRole(role: string): "owner" | "manager" | "worker" | "moderator" | "offers_user" | null {
  const key = role.trim().toLowerCase();
  if (key === "owner" || key === "admin") return "owner";
  if (key === "manager" || key === "staff") return "manager";
  if (key === "worker") return "worker";
  if (key === "moderator" || key === "offer-moderator" || key === "offer_moderator") return "moderator";
  if (key === "offers_user" || key === "offers-user" || key === "offersuser" || key === "offer-user") return "offers_user";
  return null;
}

export function roleLabel(role: Role): string {
  if (role === "owner") return "Admin";
  if (role === "manager") return "Staff";
  if (role === "worker") return "Worker";
  if (role === "moderator") return "Sales & Purchasing Offer Moderator";
  if (role === "offers_user") return "Offers User";
  if (role === "data-entry") return "Data entry";
  if (role === "customer") return "Customer";
  return "Management";
}

export function canAccess(role: Role, pathname: string): boolean {
  if (role === "offers_user") {
    // External user must have ONLY TWO MODULES:
    // 1. Purchasing Offers (/offers/purchasing and subroutes, or /offers redirecting to it)
    // 2. My Offers (/offers/my-offers and subroutes)
    // Plus notifications (/notifications) and viewing their own offer detail (/offers/[id]).
    // Strictly forbidden: /offers/selling, /offers/sold, /dashboard, and all internal operational modules.
    if (
      pathname === "/offers/selling" ||
      pathname.startsWith("/offers/selling/") ||
      pathname === "/offers/sold" ||
      pathname.startsWith("/offers/sold/") ||
      pathname === "/dashboard" ||
      pathname.startsWith("/dashboard/")
    ) {
      return false;
    }
    if (
      pathname === "/offers" ||
      pathname === "/offers/purchasing" ||
      pathname.startsWith("/offers/purchasing/") ||
      pathname === "/offers/my-offers" ||
      pathname.startsWith("/offers/my-offers/") ||
      (pathname.startsWith("/offers/") && pathname !== "/offers/selling" && pathname !== "/offers/sold")
    ) {
      return true;
    }
    if (pathname === "/notifications" || pathname.startsWith("/notifications/")) {
      return true;
    }
    return false;
  }
  if (!isActiveRole(role)) return false;
  const rule = ROUTE_RULES.find((entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`));
  if (!rule) return false;
  return rule.roles.includes(role);
}

export type AppAction =
  | "approve-order"
  | "reject-order"
  | "delete-order"
  | "edit-order"
  | "create-order"
  | "remove-order"
  | "submit-order"
  | "approve-request"
  | "reject-request"
  | "delete-request"
  | "complete-request"
  | "assign-worker"
  | "assign-worker-po"
  | "submit-selling-offer"
  | "decide-selling-offer"
  | "register-shipment"
  | "edit-shipment"
  | "unload"
  | "dispatch"
  | "edit-customs"
  | "confirm-seller"
  | "confirm-customs"
  | "save-cmr"
  | "set-threshold"
  | "adjust-stock"
  | "override-dispatch"
  | "create-transfer"
  | "send-chat"
  | "manage-users"
  | "manage-warehouses"
  | "manage-materials"
  | "manage-suppliers"
  | "manage-customers"
  | "add-document"
  | "add-annex"
  | "review-annex"
  | "approve-annex"
  | "manage-packaging"
  | "view-audit"
  | "create-offer"
  | "edit-offer"
  | "delete-offer"
  | "view-offer"
  | "submit-offer"
  | "approve-offer"
  | "reject-offer"
  | "negotiate-offer"
  | "status-offer"
  | "comment-offer"
  | "attach-offer"
  | "create-schedule"
  | "edit-schedule"
  | "verify-schedule"
  | "start-schedule"
  | "submit-schedule"
  | "import-data"
  | "export-data"
  | "approve-registration"
  | "reject-registration";

export type DemoAction = AppAction;

const ACTION_ROLES: Record<AppAction, Role[]> = {
  "approve-registration": ["owner"],
  "reject-registration": ["owner"],
  "create-schedule": ["manager"],
  "edit-schedule": ["manager"],
  "verify-schedule": ["owner", "manager"],
  "start-schedule": ["manager", "worker"],
  "submit-schedule": ["manager", "worker"],
  "approve-order": ["owner", "manager"],
  "reject-order": ["owner", "manager"],
  "delete-order": ["manager"],
  "edit-order": ["manager"],
  "create-order": ["manager"],
  "remove-order": ["manager"],
  "submit-order": ["manager"],
  "approve-request": ["owner", "manager"],
  "reject-request": ["owner", "manager"],
  "delete-request": ["worker"],
  "complete-request": ["worker"],
  "assign-worker": [],
  "assign-worker-po": ["manager"],
  "submit-selling-offer": ["offers_user"],
  "decide-selling-offer": ["owner", "moderator"],
  "register-shipment": ["manager", "worker"],
  "edit-shipment": ["manager", "worker"],
  unload: ["worker"],
  dispatch: ["worker"],
  "edit-customs": ["manager"],
  "confirm-seller": ["manager"],
  "confirm-customs": ["manager"],
  "save-cmr": ["manager", "worker"],
  "set-threshold": ["owner"],
  "adjust-stock": ["owner"],
  "override-dispatch": [],
  "create-transfer": ["owner"],
  "send-chat": ["manager", "worker"],
  "manage-users": ["owner"],
  "manage-warehouses": ["owner"],
  "manage-materials": ["owner"],
  "manage-suppliers": ["owner", "manager"],
  "manage-customers": ["owner", "manager"],
  "add-document": ["manager", "worker"],
  "add-annex": ["manager", "worker"],
  "review-annex": ["owner", "manager"],
  "approve-annex": ["owner", "manager"],
  "manage-packaging": ["owner"],
  "view-audit": ["owner"],
  "import-data": ["owner", "manager"],
  "export-data": ["owner", "manager", "moderator"],
  "create-offer": ["owner", "moderator", "offers_user"],
  "edit-offer": ["owner", "moderator"],
  "delete-offer": ["owner", "moderator"],
  "view-offer": ["owner", "moderator", "offers_user"],
  "submit-offer": ["owner", "moderator", "offers_user"],
  "approve-offer": ["owner", "moderator"],
  "reject-offer": ["owner", "moderator"],
  "negotiate-offer": ["owner", "moderator"],
  "status-offer": ["owner", "moderator"],
  "comment-offer": ["owner", "moderator"],
  "attach-offer": ["owner", "moderator"],
};

export function canPerform(role: Role, action: DemoAction): boolean {
  if (!isActiveRole(role) && role !== "offers_user") return false;
  return ACTION_ROLES[action].includes(role);
}

export function canOperateWarehouse(role: Role, assigned: string | null, warehouse: string): boolean {
  if (!isActiveRole(role)) return false;
  if (role !== "worker") return false;
  return assigned === warehouse;
}

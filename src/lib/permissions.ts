export type ActiveRole = "owner" | "manager" | "worker" | "moderator";
export type Role = ActiveRole | "offers_user" | "customer" | "data-entry" | "management";

export const ACTIVE_ROLES: readonly ActiveRole[] = ["owner", "manager", "worker", "moderator"] as const;

const ALL_ACTIVE: Role[] = ["owner", "manager", "worker", "moderator", "offers_user"];
const WAREHOUSE_ROLES: Role[] = ["owner", "manager", "worker"];
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
  { prefix: "/analytics", roles: ADMIN_AND_STAFF },
  { prefix: "/notifications", roles: ALL_ACTIVE },
  { prefix: "/audit", roles: ADMIN_ONLY },
  { prefix: "/settings", roles: ADMIN_ONLY },
  { prefix: "/transfers", roles: ADMIN_AND_STAFF },
  { prefix: "/purchases", roles: ADMIN_AND_STAFF },
  { prefix: "/customers", roles: ADMIN_AND_STAFF },
  { prefix: "/suppliers", roles: ADMIN_AND_STAFF },
  { prefix: "/warehouses", roles: ADMIN_AND_STAFF },
  { prefix: "/materials", roles: ADMIN_AND_STAFF },
  { prefix: "/tasks", roles: WAREHOUSE_ROLES },
  { prefix: "/dashboard", roles: ["owner", "manager", "worker", "moderator"] },
  { prefix: "/containers", roles: WAREHOUSE_ROLES },
  { prefix: "/outbound", roles: WAREHOUSE_ROLES },
  { prefix: "/inventory", roles: WAREHOUSE_ROLES },
  { prefix: "/documents", roles: WAREHOUSE_ROLES },
  { prefix: "/stock-movements", roles: WAREHOUSE_ROLES },
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
    return pathname === "/offers" || pathname.startsWith("/offers/") || pathname === "/notifications" || pathname.startsWith("/notifications/");
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
  | "import-data"
  | "export-data";

export type DemoAction = AppAction;

const ACTION_ROLES: Record<AppAction, Role[]> = {
  "approve-order": ["owner"],
  "reject-order": ["owner"],
  "delete-order": [],
  "edit-order": ["manager"],
  "create-order": ["manager"],
  "submit-order": [],
  "approve-request": ["owner"],
  "reject-request": ["owner"],
  "delete-request": ["worker"],
  "complete-request": ["worker"],
  "assign-worker": [],
  "assign-worker-po": ["owner", "manager"],
  "submit-selling-offer": ["offers_user"],
  "decide-selling-offer": ["owner"],
  "register-shipment": ["manager", "worker"],
  "edit-shipment": ["manager", "worker"],
  unload: ["worker"],
  dispatch: ["worker"],
  "edit-customs": ["manager"],
  "confirm-seller": ["manager"],
  "confirm-customs": ["manager"],
  "save-cmr": ["manager", "worker"],
  "set-threshold": ["owner"],
  "adjust-stock": [],
  "override-dispatch": [],
  "create-transfer": [],
  "send-chat": ["manager", "worker"],
  "manage-users": ["owner"],
  "manage-warehouses": ["owner"],
  "manage-materials": ["owner"],
  "manage-suppliers": ["manager"],
  "manage-customers": ["manager"],
  "add-document": ["manager", "worker"],
  "add-annex": ["manager", "worker"],
  "review-annex": ["owner", "manager"],
  "approve-annex": ["owner"],
  "manage-packaging": ["owner"],
  "view-audit": ["owner"],
  "import-data": ["owner", "manager"],
  "export-data": ["owner", "manager", "moderator"],
  "create-offer": ["moderator", "offers_user"],
  "edit-offer": ["moderator"],
  "delete-offer": ["moderator"],
  "view-offer": ["owner", "moderator", "offers_user"],
  "submit-offer": ["moderator", "offers_user"],
  "approve-offer": ["owner"],
  "reject-offer": ["owner"],
  "negotiate-offer": ["moderator"],
  "status-offer": ["moderator"],
  "comment-offer": ["owner", "moderator"],
  "attach-offer": ["moderator"],
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

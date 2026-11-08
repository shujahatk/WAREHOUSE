export type ActiveRole = "owner" | "manager" | "worker";
export type Role = ActiveRole | "customer" | "data-entry" | "management";

export const ACTIVE_ROLES: readonly ActiveRole[] = ["owner", "manager", "worker"] as const;

const ALL_ACTIVE: Role[] = ["owner", "manager", "worker"];
const ADMIN_AND_STAFF: Role[] = ["owner", "manager"];
const ADMIN_ONLY: Role[] = ["owner"];

const ROUTE_RULES: { prefix: string; roles: Role[] }[] = [
  { prefix: "/roadmap", roles: [] },
  { prefix: "/chat", roles: [] },
  { prefix: "/sales", roles: [] },
  { prefix: "/users", roles: ADMIN_ONLY },
  { prefix: "/reports", roles: ADMIN_ONLY },
  { prefix: "/audit", roles: ADMIN_ONLY },
  { prefix: "/settings", roles: ADMIN_ONLY },
  { prefix: "/transfers", roles: ADMIN_AND_STAFF },
  { prefix: "/purchases", roles: ADMIN_AND_STAFF },
  { prefix: "/customers", roles: ADMIN_AND_STAFF },
  { prefix: "/suppliers", roles: ADMIN_AND_STAFF },
  { prefix: "/warehouses", roles: ADMIN_AND_STAFF },
  { prefix: "/materials", roles: ADMIN_AND_STAFF },
  { prefix: "/tasks", roles: ALL_ACTIVE },
  { prefix: "/dashboard", roles: ALL_ACTIVE },
  { prefix: "/containers", roles: ALL_ACTIVE },
  { prefix: "/outbound", roles: ALL_ACTIVE },
  { prefix: "/inventory", roles: ALL_ACTIVE },
  { prefix: "/documents", roles: ALL_ACTIVE },
  { prefix: "/stock-movements", roles: ALL_ACTIVE },
];

export function isActiveRole(role: string): role is ActiveRole {
  return (ACTIVE_ROLES as readonly string[]).includes(role);
}

export function normalizeRole(role: string): ActiveRole | null {
  const key = role.trim().toLowerCase();
  if (key === "owner" || key === "admin") return "owner";
  if (key === "manager" || key === "staff") return "manager";
  if (key === "worker") return "worker";
  return null;
}

export function roleLabel(role: Role): string {
  if (role === "owner") return "Admin";
  if (role === "manager") return "Staff";
  if (role === "worker") return "Worker";
  if (role === "data-entry") return "Data entry";
  if (role === "customer") return "Customer";
  return "Management";
}

export function canAccess(role: Role, pathname: string): boolean {
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
  | "view-audit";

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
};

export function canPerform(role: Role, action: DemoAction): boolean {
  if (!isActiveRole(role)) return false;
  return ACTION_ROLES[action].includes(role);
}

export function canOperateWarehouse(role: Role, assigned: string | null, warehouse: string): boolean {
  if (!isActiveRole(role)) return false;
  if (role !== "worker") return false;
  return assigned === warehouse;
}

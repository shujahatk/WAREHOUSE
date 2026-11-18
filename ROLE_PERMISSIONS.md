# StockFlow — Role-Based Access Control (RBAC) Specification

StockFlow enforces strict Separation of Duties (SoD) to guarantee operational auditability, financial integrity, and worker safety across all warehouses.

---

## 1. Role Definitions & Scopes

### 1.1 Owner (Executive & System Admin)
- **Scope**: Entire platform, all 4 warehouses, financial reports, user directory, system configuration.
- **Key Responsibilities**: User account provisioning and de-provisioning; role assignments; high-level company oversight.

### 1.2 Admin (Operational Oversight & Governance)
- **Scope**: Approval/rejection workflows, new user approvals, compliance monitoring.
- **Strict Boundary**: **Read-Only on operational data**. An Admin can approve or decline a PO/SO request, approve or reject worker operations, and approve user accounts, but **cannot directly edit cargo gross weights, change tare packaging, or adjust stock balances**.

### 1.3 Staff / Manager (Warehouse Logistics & Planning)
- **Scope**: Physical operations planning, container scheduling, PO/SO order creation, worker assignment.
- **Strict Boundary**: **Cannot approve or reject PO/SO numbers**; cannot cancel or permanently delete PO/SO records (can only perform non-destructive number removal archiving); cannot bypass admin approval.

### 1.4 Worker (Warehouse Dock Operations)
- **Scope**: Strict single-warehouse scope (`Bornem`, `Turnhout`, `Spain`, or `Pakistan`).
- **Key Responsibilities**: Mobile container unloading and loading; recording gross weights and packaging counts; uploading container seal and cargo photos; generating CMRs.
- **Strict Boundary**: Zero access to unit prices, profit margins, administrative settings, or purchasing offers. Cannot perform operations at other warehouse sites.

### 1.5 Sales & Purchasing Offer Moderator
- **Scope**: Internal raw material purchasing offers workspace (`/offers`).
- **Key Responsibilities**: Create, edit, and organize raw material purchasing offers; manage attachments, specifications, and comments; change offer review status.
- **Strict Boundary**: Cannot approve or reject finalized offers; cannot access physical warehouse dock operations, container unloading, or stock balances.

### 1.6 External Offer Portal User (Supplier)
- **Scope**: Restricted external supplier portal (`/offers/purchasing` & `/offers/selling`).
- **Key Responsibilities**: View published purchasing specifications; submit binding selling offers against published POs; attach lab analysis certificates.
- **Strict Boundary**: Submissions are **strictly locked upon submit** (cannot be edited or withdrawn once sent); pending accounts require manual admin approval before accessing data.

---

## 2. Comprehensive Permissions Matrix

| Resource / Action | Owner | Admin | Staff | Worker | Moderator | Offers User |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **View Dashboard & KPI Summary** | ✅ | ✅ | ✅ | ✅ (Dock) | ❌ | ❌ |
| **Manage PO/SO Numbers (Add/Edit)** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Remove PO/SO Number Entry** | ✅ | ❌ | ✅ (Soft) | ❌ | ❌ | ❌ |
| **Approve / Reject PO/SO** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Assign Worker to Dock Task** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Execute Dock Operation (Weight/Tare)** | ❌ | ❌ | ❌ | ✅ (Site) | ❌ | ❌ |
| **Upload Operational Evidence Photos** | ❌ | ❌ | ❌ | ✅ (Site) | ❌ | ❌ |
| **Generate CMR Transport Document** | ✅ | ❌ | ✅ | ✅ (Site) | ❌ | ❌ |
| **View Financial Margins & Values** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Manage Users & Approve Signups** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Delete User Account (Unlink/Deact)** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Manage Purchasing Offers (CRUD)** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Submit Selling Offer against PO** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (Locked) |

---

## 3. Enforcement Mechanisms

1. **Next.js Middleware**: `src/middleware.ts` inspects session JWT claims and blocks direct URL navigation to unauthorized routes.
2. **Server Action & Command Guard**: `deny(role, action, message)` in `src/domain/commands.ts` validates caller credentials prior to executing domain logic.
3. **Database Row-Level Security (RLS)**: Enforced directly inside PostgreSQL. Unprivileged callers attempting direct SQL table modifications receive HTTP 401 / 403 `permission denied`.

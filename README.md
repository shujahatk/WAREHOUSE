# StockFlow — Enterprise Warehouse & Logistics Management System

StockFlow is a production-ready, full-stack warehouse and logistics management platform engineered specifically for **RMR (Raw Material Recycling)**. It coordinates multi-warehouse physical operations, inbound container unloading, outbound trailer loading, demurrage tracking, photographic evidence verification, real-time inventory balance accounting, and external supplier purchasing offer workflows.

---

## Key Capabilities

- **Multi-Warehouse Logistics**: Live operational coordination across 4 facilities (Bornem, Turnhout, Spain, Pakistan) with strict site-level worker scoping.
- **Inbound & Outbound Workflow**: Sequential PO/SO numbering (`PO-YYYY-XXXX`, `SO-YYYY-XXXX`), operational verification, and CMR transport documentation.
- **Demurrage Tracking & Prevention**: Real-time minute-by-minute demurrage calculations with color-coded alerts (green within allowance, amber warning, red billable demurrage).
- **Photographic Evidence Pipeline**: Mandatory multi-stage photo capture (before/after loading and unloading) with MIME and magic-byte validation, secure 10 MB payload limits, and private Supabase storage.
- **Real-Time Inventory Ledger**: Append-only transaction logging with automatic balance recalculation, tare adjustments (preset, custom, or bulk zero-tare), and idempotent stock deduplication.
- **Worker Mobile Portal**: Custom-tailored mobile-first interface featuring the signature StockFlow forest green identity, high-contrast dark surfaces, and a floating bottom navigation dock.
- **External Purchasing Offer Portal**: Self-service supplier proposal portal with admin registration approval workflows and immutable locked submissions.

---

## Tech Stack & Architecture

- **Frontend & App Framework**: Next.js 16.4.2 (App Router, Server Components & Server Actions, Partial Prerendering)
- **UI Library**: React 19, Tailwind CSS v4, Lucide Icons
- **Database & Storage**: Supabase (PostgreSQL 15+, Row-Level Security, Security Definer RPCs, Private Storage Buckets)
- **Data Access Layer**: Pluggable architecture supporting both `SupabaseAdapter` (live production database) and `FileDataAdapter` / `LocalAdapter` (deterministic offline testing and CI)
- **Type Safety**: End-to-end strict TypeScript with Zero compiler errors (`npx tsc --noEmit`)
- **Testing**: 100/100 automated test coverage across permissions, inventory math, workflow state machines, and Supabase RPCs

---

## User Roles & Operational Boundaries

| Role | Operational Scope | Administrative & Financial Boundaries |
| :--- | :--- | :--- |
| **Owner** | Full system visibility; company oversight; system configuration | Ultimate executive control across all modules and settings |
| **Admin** | Read-only operational oversight; approval/rejection of staff PO/SO requests, worker operations, and new user registrations | **Strictly blocked** from editing operational cargo weights, containers, or stock |
| **Staff (Manager)** | Operational management; PO/SO number creation, editing, and soft-removal; worker task scheduling | **Cannot** approve/reject orders, delete users, or bypass admin approval |
| **Worker** | Mobile-first execution at assigned warehouse; container unloading, loading, tare weighing, photo upload, CMR saving | **Scoped strictly** to assigned warehouse; zero access to financials, admin portals, or purchasing offers |
| **Offer Moderator** | Management of raw material purchasing offers; review submissions; status updates; attachment verification | **Cannot** approve/reject offers or access physical warehouse inventory |
| **Offers User (Portal)** | External supplier self-service portal; view published POs; submit locked proposals with certificates | **Immutable submissions**; requires admin approval before accessing data |

---

## Getting Started

### Prerequisites

- Node.js 20+ or 22+ LTS
- npm 10+
- Active Supabase Project (PostgreSQL 15+)

### Installation

```bash
git clone https://github.com/shujahatk/WAREHOUSE.git
cd WAREHOUSE
npm install
```

### Environment Configuration

Create a `.env.local` file in the root directory:

```env
# Database Mode: "supabase" (Production) or "local" (Testing/Offline)
STOCKFLOW_DATA_ADAPTER=supabase

# Live Supabase Connection
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_STORAGE_BUCKET=stockflow-files

# Initial Owner Bootstrap Account
STOCKFLOW_OWNER_EMAIL=admin@stockflow.com
STOCKFLOW_OWNER_NAME="Admin Owner"
STOCKFLOW_OWNER_PASSWORD="SecureOwnerPassword2026!"
```

### Database Migration

Apply the consolidated production migration script in the [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql/new):

```bash
# File: supabase/MIGRATION_CONSOLIDATED_FIX.sql
```

This applies all 29 relational tables, Row-Level Security policies, and Security Definer RPC functions (`rpc_remove_poso_number`, `rpc_delete_user_account`, `rpc_get_auth_account_status`, and approval workflows).

---

## Development & Testing Scripts

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Starts local Next.js development server at `http://localhost:3000` |
| `npm test` | Runs the full 100-test automated verification suite |
| `npm run test:live` | Validates schema integrity, tables, and RPCs against live Supabase |
| `npm run lint` | Executes ESLint to check for code quality and hook rules |
| `npx tsc --noEmit` | Validates 100% strict TypeScript compliance |
| `npm run build` | Compiles an optimized production build with Partial Prerendering |
| `npm start` | Serves the production build locally |

---

## Documentation Suite

Detailed architectural, security, and operational documentation is available in the repository root:

- [SYSTEM_ARCHITECTURE.md](file:///c:/Users/Asus/Desktop/stockflow/SYSTEM_ARCHITECTURE.md) — Comprehensive technical architecture, data flows, and state machines.
- [DATABASE_SCHEMA.md](file:///c:/Users/Asus/Desktop/stockflow/DATABASE_SCHEMA.md) — Complete 29-table schema definition, foreign keys, indexes, and RPC functions.
- [ROLE_PERMISSIONS.md](file:///c:/Users/Asus/Desktop/stockflow/ROLE_PERMISSIONS.md) — Role-based access control matrix and operational boundaries.
- [SECURITY_AUDIT.md](file:///c:/Users/Asus/Desktop/stockflow/SECURITY_AUDIT.md) — Security policies, RLS enforcement, CSRF, and file upload protection.
- [DEPLOYMENT_GUIDE.md](file:///c:/Users/Asus/Desktop/stockflow/DEPLOYMENT_GUIDE.md) — Production deployment instructions for Vercel and Supabase.
- [ENVIRONMENT_VARIABLES.md](file:///c:/Users/Asus/Desktop/stockflow/ENVIRONMENT_VARIABLES.md) — Complete environment variable specification and validation rules.
- [TESTING_REPORT.md](file:///c:/Users/Asus/Desktop/stockflow/TESTING_REPORT.md) — 100-test suite execution evidence, live Supabase results, and Playwright verification.
- [USER_GUIDE.md](file:///c:/Users/Asus/Desktop/stockflow/USER_GUIDE.md) — Step-by-step operational handbook for Admins, Staff, Workers, and Suppliers.
- [KNOWN_LIMITATIONS.md](file:///c:/Users/Asus/Desktop/stockflow/KNOWN_LIMITATIONS.md) — Platform considerations, browser support, and roadmap milestones.

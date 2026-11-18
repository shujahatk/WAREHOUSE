# StockFlow — Production Deployment & DevOps Runbook

This guide details the step-by-step production deployment procedures for Vercel and Supabase.

---

## 1. Supabase Database & Storage Deployment

### 1.1 Supabase Project Provisioning
1. Log in to [Supabase Dashboard](https://supabase.com/dashboard) and create a new project.
2. Note your Project URL and API Keys under **Settings > API**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (Keep confidential)

### 1.2 Storage Bucket Setup
1. In the Supabase dashboard, navigate to **Storage**.
2. Create a bucket named `stockflow-files`.
3. Set bucket access to **Private** (Public: disabled).

### 1.3 Apply Database Schema & Migrations
1. Open the **SQL Editor** in Supabase (`/sql/new`).
2. Copy and paste the contents of `supabase/MIGRATION_CONSOLIDATED_FIX.sql`.
3. Click **Run**.
4. Confirm successful execution. This applies:
   - All 29 tables, indexes, and foreign keys.
   - Security Definer RPCs (`rpc_remove_poso_number`, `rpc_delete_user_account`, `rpc_get_auth_account_status`, `rpc_admin_decide_order`, etc.).
   - Table Row-Level Security policies.
   - Schema cache reload notification (`NOTIFY pgrst, 'reload schema';`).

---

## 2. Vercel Production Deployment

### 2.1 Project Import & Settings
1. Connect your GitHub repository (`WAREHOUSE`) in the [Vercel Dashboard](https://vercel.com).
2. Framework Preset: **Next.js**.
3. Node.js Version: **20.x** or **22.x**.
4. Build Command: `npm run build` (or Next.js default).
5. Output Directory: `.next`.

### 2.2 Environment Variables in Vercel
In **Project Settings > Environment Variables**, add the following production variables:

| Variable Name | Environment | Value Description |
| :--- | :--- | :--- |
| `STOCKFLOW_DATA_ADAPTER` | Production, Preview | `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview | `https://<your-project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview | Your Supabase anon public key |
| `SUPABASE_STORAGE_BUCKET` | Production, Preview | `stockflow-files` |
| `STOCKFLOW_OWNER_EMAIL` | Production | Primary admin email (e.g. `admin@stockflow.com`) |
| `STOCKFLOW_OWNER_NAME` | Production | System owner display name |
| `STOCKFLOW_OWNER_PASSWORD` | Production | Strong password for initial bootstrap |

### 2.3 Deploy & Verification
1. Click **Deploy**.
2. Monitor build logs: Next.js compiles routes, static assets, and Partial Prerendering pages without error.
3. Access your production domain (e.g. `https://stockflow.vercel.app`).

---

## 3. Post-Deployment Smoke Test Protocol

1. **Owner Access**:
   - Log in with `STOCKFLOW_OWNER_EMAIL` and `STOCKFLOW_OWNER_PASSWORD`.
   - Verify Admin Console displays active stats, user directory, and warehouses.
2. **Staff Workflow**:
   - Log in as Staff (`staff@example.com`).
   - Navigate to **PO & SO Orders** (`/purchases`).
   - Create a test PO entry (`PO-2026-9001`). Verify auto-sequential numbering.
   - Soft-remove a PO entry. Confirm the modal closes and the order is archived with operational records preserved.
3. **Worker Mobile Experience**:
   - Log in as Worker (`worker.bornem@example.com`) or resize viewport to 390px.
   - Verify floating bottom dock navigation displays 4 tabs: Dashboard, Inbound, Outbound, Inventory.
   - Verify smooth sliding tab indicator and touch-friendly controls.
   - Complete an unloading workflow with gross weight and photo upload.
4. **Offer Portal Verification**:
   - Navigate to `/register` as an external user. Submit registration.
   - Verify account shows pending status and blocks login until Admin approves.
   - Admin approves user in Admin Console (`/users`).
   - Approved user logs in, views purchasing POs, and submits a proposal. Verify proposal is locked against edits.

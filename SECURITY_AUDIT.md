# StockFlow — Security Architecture & Vulnerability Audit Report

This document records the security mechanisms, policy enforcement proofs, and vulnerability assessments implemented in StockFlow.

---

## 1. Authentication & Session Security

- **Database-Level Approval Enforcement**: Newly registered users cannot bypass approval by manipulating client state. Every API request, server action, and login validation invokes `rpc_get_auth_account_status()`. Users with `approval_status = 'pending'` or `'rejected'` are blocked server-side.
- **Credential Storage**: Passwords are encrypted and managed via Supabase Auth (`auth.users`) utilizing bcrypt/Argon2. Plaintext passwords are never stored in `public.users` or log files.
- **Session Tokens**: JWT access tokens are stored in secure HTTP-only, SameSite cookies. Expired tokens are rejected automatically with HTTP 401.

---

## 2. Row-Level Security (RLS) & PostgreSQL Protection

All 29 relational tables have `ROW LEVEL SECURITY` strictly enabled and enforced (`ALTER TABLE ... FORCE ROW LEVEL SECURITY`).
- **Unauthenticated Queries**: The public `anon` role is denied access to operational tables. Direct HTTP REST requests without a valid Bearer JWT return `401 Unauthorized` (e.g. `permission denied for table users`).
- **Worker Isolation**: A worker account has RLS policies restricting `SELECT` queries to their assigned warehouse site (`warehouse_id = public.current_user_warehouse_id()`).
- **Admin Isolation**: Admin users cannot execute direct `INSERT` or `UPDATE` on `purchase_orders` or `stock_balances`. Any attempt to bypass the frontend throws `42501 permission denied`.

---

## 3. Storage Security & File Upload Verification

File uploads (dock evidence, CMR documents, Annex VII, lab certificates) are protected against malicious payloads:
1. **Magic-Byte Sniffing**: Files are inspected at the binary level using `validateUploadBytes` (`src/lib/data/upload-capture.ts`). Files masquerading with spoofed extensions (e.g., an executable renamed to `.jpg`) are rejected.
2. **Size Enforcement**: Server enforces a hard 10 MB file size limit before writing to storage.
3. **Storage Bucket Privacy**: The Supabase Storage bucket `stockflow-files` is **strictly private**. Public unauthenticated reads return an empty array `[]`.
4. **Time-Limited Signed URLs**: External file access is granted only via time-limited HMAC-signed URLs (300-second expiration). Tampered or expired URL tokens are rejected.

---

## 4. Account Lifecycle & Operational Record Preservation

- **Safe De-provisioning (`rpc_delete_user_account`)**:
  - If a user has operational records (created POs, conducted dock unloading, signed CMRs, or moved stock), the database unlinks their auth credentials (`auth_user_id = null`), sets `active = false`, and scrambles their email to `deleted.<id>.<epoch>@stockflow.internal`.
  - Historical records, warehouse balance histories, and audit entries remain 100% intact with foreign key integrity.
  - Accounts with zero operational activity are cleanly purged from the table.
- **Self-Deletion & Admin Protection**: The RPC explicitly prevents administrators from deleting their own accounts or deleting the last active Administrator account.

---

## 5. Audit Logging & Compliance Ledger

Every operational event generates an immutable entry in `audit_log`:
- User registration, approval, rejection, and deletion.
- PO/SO number creation, editing, and soft-removal.
- Container dock arrival, unloading start, gross/tare weight submission, and handover.
- Demurrage threshold violations and dispatch overrides.
- Document and photo upload/removal.

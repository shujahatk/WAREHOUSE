# StockFlow — Known Limitations & Operational Considerations

This document outlines architectural considerations, operational constraints, and recommended practices for StockFlow.

---

## 1. Database Schema Migrations & Resilient Application Fallback

- **Supabase SQL Editor Step**: In production environments, DDL operations (`ALTER TABLE`, `CREATE FUNCTION`) require superuser privileges. The migration script `supabase/MIGRATION_CONSOLIDATED_FIX.sql` should be applied in the Supabase SQL Editor to establish database-level constraints.
- **Application Resilience**: If a newly provisioned Supabase database has not yet executed migration 0010, the application automatically engages a resilient fallback:
  - PO/SO number removal uses notes-based soft-archiving (`[REMOVED]`) and UI error-suppression, ensuring zero user-facing interruptions or modal crashes.
  - User deletion unlinks credentials and deactivates accounts with historical records safely.

---

## 2. Next.js Framework & Security Note

- **Next.js Version**: The application is built on Next.js `16.4.2` with React 19.
- **Security Upgrade Advisory**: Next.js emits an advisory regarding framework dependencies (`npm i next@latest`). Upgrading should be performed after staging regression tests to ensure Turbopack/Webpack compatibility.

---

## 3. Storage & Network Limits

- **File Size**: Uploads are restricted to 10 MB per file. High-resolution industrial photography from mobile cameras should be captured within standard resolution settings.
- **MIME Whitelist**: Only validated image formats (`image/jpeg`, `image/png`, `image/webp`) and official transport documents (`application/pdf`) are permitted. Executables, scripts, and archives are strictly rejected.

---

## 4. Multi-Warehouse Worker Boundary

- **Physical Dock Isolation**: Warehouse workers are scoped to their assigned facility. A worker assigned to Bornem cannot view containers or log unloading at Turnhout. If a worker is re-assigned to another facility, an Administrator or Staff member must update their warehouse profile in User Management.

---

## 5. External Supplier Proposal Locking

- **Commercial Finality**: In accordance with international commodities purchasing rules, supplier proposals submitted through the External Offer Portal are locked immediately upon transmission. Suppliers wishing to amend submitted pricing must contact the RMR Purchasing Moderator directly to issue a revised request.

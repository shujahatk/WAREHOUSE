# STOCKFLOW — BACKUP & DISASTER RECOVERY RUNBOOK

## 1. Overview & Objectives

This document establishes the official disaster recovery, backup, and business continuity strategy for the StockFlow production warehouse and logistics platform.

* **Primary Source of Truth**: Supabase PostgreSQL (`dyluiydjzbmrhzgpaxqq.supabase.co`)
* **Primary Storage Bucket**: `stockflow-files` (Supabase Storage S3-compatible backend)
* **Target RPO (Recovery Point Objective)**: $\le 24\text{ hours}$ (Daily Automated Snapshots) or $\le 5\text{ minutes}$ (with Supabase Pro PITR enabled).
* **Target RTO (Recovery Time Objective)**: $< 30\text{ minutes}$ for logical database restoration.

---

## 2. Supabase Plan Capabilities & Backup Architecture

| Feature | Supabase Free Plan | Supabase Pro Plan ($25/mo) | StockFlow Implementation |
| :--- | :--- | :--- | :--- |
| **Automated Backups** | Daily logical backups (retained 7 days) | Daily backups (retained 30 days) | Automated via Supabase Platform + Daily Logical Snapshot Engine (`scripts/backup-disaster-recovery.mjs`) |
| **Point-in-Time Recovery (PITR)** | Not included | 7-day or 30-day continuous WAL archiving (add-on) | Documented enablement procedure via Supabase Dashboard Settings -> Database -> Backups. |
| **Storage Object Backups** | Not included in database dump | Standard S3 multi-AZ persistence | Documented bucket object replication to secondary storage |
| **Self-Service Restore** | Via SQL / pg_restore / REST restore | 1-click Web UI PITR Rollback | Full runbook provided below |

> [!NOTE]
> Database backups alone **do not** contain raw binary documents (CMR PDFs, Annex VII PDFs, inspection photos). Storage objects in `stockflow-files` are tracked separately via `public.documents` metadata and replicated via the Storage API.

---

## 3. Daily Automated Backup Strategy

The automated backup engine (`scripts/backup-disaster-recovery.mjs`) performs a synchronized point-in-time extraction:
1. **29 Relational Database Tables**:
   * Users, Warehouses, Companies, Materials, Packaging Types.
   * Purchase Orders, Purchase Order Lines, Shipments, Requests, Request Lines.
   * Worker General Requests & Attachments, Stock Balances, Warehouse Transfers.
   * Stock Movements, Customs, Demurrage, Annex VII.
   * Append-Only Audit Log, Offer Sequences, PO Sequences, Inventory History.
   * Offers, Offer Attachments, Offer Comments, Offer Activities.
2. **Storage Object Manifest**:
   * Inspects `public.documents` to verify all uploaded CMRs, Annex VII files, and photos.
   * Captures file size, MIME type, storage key, and upload checksum.
3. **Cryptographic Checksumming**:
   * Computes SHA-256 hash over the entire dataset to prevent undetected corruption or tampering.
4. **Storage & Retention**:
   * Snapshots are timestamped and stored in `backups/stockflow-backup-<timestamp>.json`.
   * Retained for **30 days** before rotational pruning.

---

## 4. Disaster Recovery & Restoration Procedures

### Scenario A: Accidental Data Deletion or Table Corruption (Logical Recovery)

1. **Stop Application Traffic**:
   Set `MAINTENANCE_MODE=true` in hosting environment to prevent in-flight writes.
2. **Locate Latest Verified Backup**:
   Inspect `backups/latest-backup-status.json` and select the most recent verified backup file.
3. **Execute Isolated Verification**:
   ```bash
   node scripts/test-restore-isolation.mjs
   ```
   Confirm all checksums match and zero schema conflicts exist.
4. **Apply Restoration Script**:
   Restore master reference records and missing operational entities using the idempotent restore tool.

### Scenario B: Catastrophic Project Loss / Infrastructure Failure

1. **Provision New Supabase Project**:
   Create a new instance in the target region (e.g., `eu-west-1` for European operations).
2. **Execute Consolidated Unified Migration**:
   In the new project's SQL Editor, run `supabase/migrations/20261112_stockflow_complete_unified_production.sql`.
   This reconstitutes all 29 tables, triggers, 35 RPCs, RLS policies, and the `stockflow-files` bucket.
3. **Restore User Credentials & Data**:
   Re-import the backup dataset.
4. **Update Application Environment Variables**:
   Update `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in production environment settings.
5. **Re-verify via Production Health Suite**:
   ```bash
   node scripts/live-health-check.mjs
   node scripts/test-phase3-live-workflows.mjs
   ```

---

## 5. Storage Restoration Procedure

1. **Bucket Verification**: Ensure the private bucket `stockflow-files` is active.
2. **Metadata Integrity**: Verify `public.documents` rows match the physical object storage keys.
3. **Bulk Object Sync**:
   Upload files matching `storage_key` using the Supabase CLI:
   ```bash
   supabase storage cp ./local-storage-mirror/ s3://stockflow-files/ --recursive
   ```

---

## 6. Backup Monitoring & Verification Status

StockFlow maintains real-time visibility into backup health via `backups/latest-backup-status.json` and the Admin Settings interface.

* **Monitoring Metrics**:
  * `lastBackupAt`: Timestamp of last successful snapshot.
  * `status`: Current status (`Healthy` / `Degraded`).
  * `tableCount`: Count of tables included (29/29).
  * `totalRows`: Total records safely archived.
  * `checksum`: SHA-256 tamper-evident digest.
  * `lastRecoveryTestAt`: Timestamp of last isolated restore simulation.


# StockFlow — PostgreSQL Database Schema & RPC Reference

This document defines the 29 relational tables, indexes, security triggers, and RPC functions in the production PostgreSQL database.

---

## 1. Relational Table Catalog

### 1.1 Directory & Master Data
1. **`warehouses`**: Physical operating locations.
   - `id` (uuid, PK), `name` (text, unique), `country` (text), `active` (boolean), `created_at` (timestamptz)
2. **`companies`**: Commercial partners (Suppliers, Customers, Carriers).
   - `id` (uuid, PK), `name` (text), `kind` (text: 'supplier' | 'customer' | 'carrier'), `active` (boolean), `created_at` (timestamptz)
3. **`materials`**: Recycled commodities catalog.
   - `id` (uuid, PK), `material_number` (text, unique), `name` (text), `category` (text), `active` (boolean)
4. **`packaging_types`**: Standard packaging tare configurations.
   - `id` (uuid, PK), `name` (text, unique), `tare_kg` (numeric), `active` (boolean)
5. **`users`**: Platform user identity & profile.
   - `id` (uuid, PK), `auth_user_id` (uuid, references `auth.users`), `email` (text, unique), `name` (text), `role` (text: 'owner' | 'manager' | 'worker' | 'sales_purchasing_offer_moderator' | 'offers_user'), `warehouse_id` (uuid, FK), `company_id` (uuid, FK), `approval_status` (text: 'pending' | 'approved' | 'rejected'), `active` (boolean), `created_at` (timestamptz)

### 1.2 Purchase Orders & Transport Documents
6. **`purchase_orders`**: Sequential order tracking.
   - `id` (uuid, PK), `number` (text, unique), `title` (text), `type` (text: 'PO' | 'SO'), `company_id` (uuid, FK), `status` (text: 'draft' | 'submitted' | 'approved' | 'declined'), `value_eur` (numeric), `notes` (text), `is_removed` (boolean, default false), `removed_at` (timestamptz), `removed_by` (uuid, FK), `warehouse_id` (uuid, FK), `created_by` (uuid, FK), `created_at` (timestamptz)
7. **`purchase_order_lines`**: Itemized lines per order.
   - `id` (uuid, PK), `purchase_order_id` (uuid, FK), `material_description` (text), `quantity_kg` (numeric), `unit_price_eur` (numeric)
8. **`shipments`**: Physical container / trailer transport movements.
   - `id` (uuid, PK), `reference` (text, unique), `direction` (text: 'inbound' | 'outbound'), `purchase_order_id` (uuid, FK), `container_number` (text), `warehouse_id` (uuid, FK), `status` (text: 'Planned' | 'Unloading' | 'Loading' | 'Completed' | 'Departed'), `carrier_name` (text), `handed_over_at` (timestamptz)

### 1.3 Operational Execution & Weight Ledger
9. **`requests`**: Worker operational assignments.
   - `id` (uuid, PK), `request_number` (text, unique), `shipment_id` (uuid, FK), `status` (text: 'draft' | 'submitted' | 'approved' | 'completed' | 'rejected'), `entered_by` (uuid, FK), `approved_by` (uuid, FK)
10. **`request_lines`**: Net weight cargo entries.
    - `id` (uuid, PK), `request_id` (uuid, FK), `material_id` (uuid, FK), `packaging_type_id` (uuid, FK), `package_count` (int), `gross_kg` (numeric), `tare_total_kg` (numeric), `net_kg` (numeric)
11. **`request_photos`**: Direct image attachments for dock requests.
    - `id` (uuid, PK), `request_id` (uuid, FK), `storage_key` (text), `stage` (text)
12. **`documents`**: Enterprise document index (CMRs, Annex VII, weight tickets).
    - `id` (uuid, PK), `kind` (text: 'cmr' | 'annex7' | 'photo' | 'customs'), `po_number` (text), `shipment_id` (uuid, FK), `storage_key` (text), `byte_size` (int), `mime` (text), `status` (text)
13. **`stock_balances`**: Real-time on-hand material balances per warehouse.
    - `id` (uuid, PK), `warehouse_id` (uuid, FK), `material_id` (uuid, FK), `quantity_kg` (numeric), `updated_at` (timestamptz)
14. **`stock_movements`**: Immutable audit log of every stock alteration.
    - `id` (uuid, PK), `warehouse_id` (uuid, FK), `material_id` (uuid, FK), `direction` (text: 'in' | 'out'), `quantity_kg` (numeric), `reference_type` (text), `reference_id` (text), `performed_by` (uuid, FK), `created_at` (timestamptz)
15. **`inventory_history`**: Append-only transactional ledger with snapshots.
    - `id` (uuid, PK), `warehouse_id` (uuid, FK), `material_id` (uuid, FK), `net_weight_change_kg` (numeric), `resulting_balance_kg` (numeric), `operation_type` (text), `created_at` (timestamptz)

### 1.4 Regulatory, Demurrage & General Requests
16. **`customs_records`**: Customs declarations and procedure clearances.
    - `id` (uuid, PK), `shipment_id` (uuid, FK), `declarant_reference` (text), `procedure_note` (text), `cleared_at` (timestamptz)
17. **`demurrage_records`**: Container detention logs.
    - `id` (uuid, PK), `shipment_id` (uuid, FK), `free_time_minutes` (int), `elapsed_minutes` (int), `billable_amount_eur` (numeric), `status` (text)
18. **`annex7_records`**: Basel Convention waste shipment Annex VII tracking.
    - `id` (uuid, PK), `shipment_id` (uuid, FK), `document_number` (text), `uploaded_at` (timestamptz)
19. **`audit_log`**: System-wide security and compliance ledger.
    - `id` (uuid, PK), `actor_id` (uuid, FK), `action` (text), `target_type` (text), `target_id` (text), `summary` (text), `created_at` (timestamptz)
20. **`worker_general_requests`**: Worker maintenance, incident, and supply requests.
    - `id` (uuid, PK), `category` (text: 'equipment' | 'safety' | 'supplies' | 'discrepancy' | 'maintenance' | 'other'), `title` (text), `description` (text), `status` (text: 'submitted' | 'under_review' | 'sent_back' | 'approved' | 'rejected' | 'completed'), `created_by` (uuid, FK)
21. **`worker_general_request_attachments`**: Files attached to general requests.
    - `id` (uuid, PK), `request_id` (uuid, FK), `storage_key` (text), `name` (text), `mime` (text)

### 1.5 Offer Portal & Notifications
22. **`offers`**: Raw material purchasing offers.
    - `id` (uuid, PK), `number` (text, unique), `title` (text), `material` (text), `quantity` (numeric), `unit` (text), `price_per_unit` (numeric), `status` (text: 'draft' | 'under_review' | 'approved' | 'rejected' | 'expired' | 'completed'), `locked` (boolean, default false), `created_by` (uuid, FK)
23. **`offer_attachments`**: Certificates, analyses, and photos for offers.
    - `id` (uuid, PK), `offer_id` (uuid, FK), `storage_key` (text), `name` (text), `mime` (text)
24. **`offer_comments`**: Collaboration commentary thread.
    - `id` (uuid, PK), `offer_id` (uuid, FK), `author_id` (uuid, FK), `content` (text), `created_at` (timestamptz)
25. **`offer_activities`**: Immutable audit timeline of offer events.
    - `id` (uuid, PK), `offer_id` (uuid, FK), `actor_id` (uuid, FK), `action` (text), `details` (jsonb), `created_at` (timestamptz)
26. **`notifications`**: Targeted user alerts.
    - `id` (uuid, PK), `recipient_id` (uuid, FK), `title` (text), `message` (text), `read` (boolean), `read_at` (timestamptz), `link` (text), `created_at` (timestamptz)
27. **`request_sequences`**: Sequence generator for sequential numbering.
    - `prefix` (text, PK), `current_val` (int), `updated_at` (timestamptz)
28. **`file_claims`**: Atomic file upload reservation and token claim records.
    - `id` (uuid, PK), `file_id` (uuid), `storage_key` (text), `actor_id` (uuid, FK), `claimed` (boolean), `expires_at` (timestamptz)
29. **`app_settings`**: Global system configuration values.
    - `key` (text, PK), `value` (jsonb), `updated_at` (timestamptz)

---

## 2. Core Stored Procedures & Security Definer RPCs

| RPC Function | Access Role | Description |
| :--- | :--- | :--- |
| `rpc_remove_poso_number(p_number text)` | Staff (`manager`), `owner` | Marks PO/SO as `is_removed = true`, preserving historical records, shipments, and audit logs. |
| `rpc_delete_user_account(p_user_id uuid)` | `owner` | Safely unlinks auth credentials and deactivates accounts with operational records; permanently deletes empty records. |
| `rpc_get_auth_account_status()` | Authenticated | Retrieves caller profile and approval status (`pending`, `approved`, `rejected`) directly from database. |
| `rpc_admin_decide_order(p_order_number, p_decision)` | `owner` | Approves or declines purchase orders with strict validation. |
| `rpc_worker_save_material_line(...)` | `worker` | Saves dock packaging and gross weight entry, calculating tare and net weight. |
| `rpc_worker_complete_request(p_request_id)` | `worker` | Idempotently completes approved operations and posts net weight to inventory balance. |
| `rpc_save_cmr(...)` | `worker`, `manager` | Persists official CMR transport document details. |
| `rpc_register_user(...)` | Anon / Public | Registers new Staff or Worker user with `pending` status awaiting admin approval. |
| `rpc_register_offers_user(...)` | Anon / Public | Registers external Offer Portal user with `pending` status. |

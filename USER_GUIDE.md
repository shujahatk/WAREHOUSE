# StockFlow — Operational User Guide

This user manual outlines the standard operating procedures (SOPs) for each user role in StockFlow.

---

## 1. Executive Owner & Administrator Guide

### 1.1 Managing New User Registrations
1. Navigate to **User Management** (`/users`).
2. Review the **Pending Registration Requests** banner.
3. Click **Review** on any pending applicant to inspect their full name, email, phone number, and requested role.
4. Click **Approve** to grant immediate access, or **Reject** with a mandatory explanation.
5. Rejected users will be notified on their next login attempt with the administrator's reason.

### 1.2 Approving Purchase Orders & Worker Operations
1. Open **Approvals & Governance** on the Admin Console.
2. Review submitted PO/SO orders from Staff.
3. Verify partner, material, and value details. Click **Approve Order** or **Decline Order**.
4. Review worker operations pending approval before inventory balance posting.

---

## 2. Staff (Manager) Guide

### 2.1 Creating PO (Unloading) & SO (Loading) Numbers
1. Navigate to **PO & SO Orders** (`/purchases`).
2. Click **+ Add PO Number** for inbound unloading or **+ Add SO Number** for outbound loading.
3. Select partner, material, estimated weight (kg), and value (EUR).
4. System automatically assigns the next sequential reference (e.g. `PO-2026-0004` or `SO-2026-0002`).

### 2.2 Safe Number Removal (Operational Archiving)
1. In the PO/SO Orders table, locate the target entry.
2. Click **Remove**.
3. Read the Operational Integrity Guarantee prompt.
4. Click **Remove Number**. The number is soft-archived from active lists while all historical dock records, photos, CMR documents, and audit logs remain strictly preserved.

---

## 3. Warehouse Worker Guide (Mobile)

### 3.1 Mobile Navigation Dock
- **Dashboard**: View today's assigned operations, active shipments, and live demurrage alerts.
- **Inbound**: List of containers arriving at your assigned warehouse dock.
- **Outbound**: List of trailers scheduled for loading.
- **Inventory**: Real-time on-hand stock balances for your warehouse.

### 3.2 Executing an Inbound Unloading Workflow
1. Tap on an assigned container in **Inbound** (`/containers`).
2. Tap **Start Unloading**. This records the physical arrival and begins demurrage free-time tracking.
3. **Record Packaging & Weights**:
   - Select material (e.g., *PET Flakes*).
   - Select packaging type from dropdown (e.g., *Big Bag 1500kg*, *Wooden Pallet*, or *Bulk / Zero Tare*).
   - Enter package count and gross weight (kg).
   - System automatically calculates tare and net weight.
4. **Capture Evidence Photos**:
   - Tap **Upload Photo** to capture container seal, trailer interior, or material lot.
   - At least one verification photo is required.
5. **Complete Unloading**:
   - Tap **Submit Completed Unloading**. Net cargo weight is posted directly into warehouse inventory balance.

### 3.3 Generating CMR Transport Documents
1. For completed inbound or outbound shipments, tap **Generate CMR**.
2. Enter carrier company name, vehicle registration plate, and transport remarks.
3. Tap **Save CMR Document**. The official document is indexed and ready for export or driver handover.

---

## 4. External Supplier Guide (Offer Portal)

### 4.1 Registering for the Purchasing Portal
1. Navigate to `/register`.
2. Fill in your business details: Company Name, Contact Name, Email, Phone, and Business Country.
3. Submit registration. Your account will enter **Pending Approval** status while verified by StockFlow admins.

### 4.2 Submitting a Proposal against a Published PO
1. Log in to the portal and navigate to **Purchasing Specifications** (`/offers/purchasing`).
2. Review published specifications from RMR.
3. Tap **Submit Selling Proposal**.
4. Enter proposed volume, pricing per ton, loading schedule, and attach analysis certificates.
5. Tap **Submit Proposal**.
6. **Notice**: Once submitted, proposals are **strictly locked** against edits or withdrawal to ensure legal commercial integrity.

# Data model

This is the Phase 1 domain contract. The running app reads and writes these records through the repository interfaces in `src/domain/repositories.ts`. The local implementation stores them in a JSON file (`STOCKFLOW_STORE_PATH`, or `data/warehouse-store.json`). `docs/schema-draft.sql` is a later-database sketch of the same records. It is not installed and must not be executed in this phase.

Identifiers are UUIDs. Timestamps are UTC ISO-8601 strings. Weights are kilograms, rounded to three decimal places. The display clock for demurrage is `Europe/Zurich`.

Nothing in this store is sample operational data. On an empty file the seeder may add reference rows and one owner, and only from environment variables:

- `STOCKFLOW_OWNER_EMAIL`, `STOCKFLOW_OWNER_NAME`, and `STOCKFLOW_OWNER_PASSWORD` must be set together. If all three are blank, no owner is created.
- `STOCKFLOW_REFERENCE_JSON` may contain warehouses, companies, materials, and packaging types. It must not contain purchase orders, shipments, requests, or stock.
- An existing owner password is not reset when the store already has users.

Passwords are stored as scrypt hashes (`scrypt$salt$hash`). The owner password from the environment is never written in plaintext.

## Relations

```text
Company 1──* PurchaseOrder 1──* PurchaseOrderLine *──0..1 Material
Warehouse 1──* Shipment *──0..1 PurchaseOrder
Shipment 1──* Request 1──* RequestLine *──1 Material
RequestLine *──1 PackagingType
Request 1──* RequestPhoto *──1 Document
Shipment 1──* Document
Shipment 1──0..1 CustomsRecord
Shipment 1──0..1 DemurrageRecord
Shipment 1──* Annex7Record *──1 Document
PurchaseOrder 0..1──* PoMessage *──1 User
Material + Warehouse 1──0..1 StockBalance
RequestLine + direction 1──0..1 StockMovement
User 1──* AuditLogEntry
```

A worker points at one warehouse. A customer points at one company. Owner and manager point at neither.

## User

| Field | Constraint |
| --- | --- |
| `id` | UUID, primary key |
| `email` | Email, unique ignoring case |
| `name` | Required |
| `role` | `owner`, `worker`, `manager`, or `customer` |
| `warehouseId` | Required for a worker. Null for every other role |
| `companyId` | Required for a customer. Null for every other role |
| `active` | Inactive users cannot sign in |
| `passwordHash` | Required. Omitted from the public profile |
| `createdAt`, `updatedAt` | UTC timestamps |

The last active owner cannot be deactivated or given another role. Creating a user returns a one-time temporary password. It is not stored in plaintext.

## Warehouse

| Field | Constraint |
| --- | --- |
| `id` | UUID |
| `name` | Required, unique ignoring case |
| `country` | Required |
| `active` | Boolean |

Names are created from reference JSON or when a shipment names a site that does not exist yet.

## Company

A company is either a supplier or a customer. The same display name may exist once per kind.

| Field | Constraint |
| --- | --- |
| `id` | UUID |
| `name` | Required |
| `kind` | `supplier` or `customer` |
| `active` | Boolean |

Unique on (`lower(name)`, `kind`).

## Material

| Field | Constraint |
| --- | --- |
| `id` | UUID |
| `materialNumber` | Required, unique ignoring case |
| `description` | Required |
| `unit` | Required. Stock arithmetic uses kilograms |
| `lowStockThresholdKg` | Zero or greater. This is the low-stock line, in kilograms, for every warehouse that holds the material |

A balance is low when its weight is greater than zero and at or below this threshold. A balance of zero is out of stock.

## PackagingType

| Field | Constraint |
| --- | --- |
| `id` | UUID |
| `name` | Required, unique ignoring case |
| `tareKg` | Zero or greater. Tare of one package |
| `active` | Inactive types cannot be used on a new line |

## PurchaseOrder and PurchaseOrderLine

| Purchase order field | Constraint |
| --- | --- |
| `id` | UUID |
| `number` | Required, unique |
| `companyId` | Company that sells or buys on this order |
| `status` | `draft`, `submitted`, `approved`, or `declined` |
| `valueEur` | Zero or greater |
| `notes` | Free text, may be empty |
| `createdBy` | User |
| `createdAt`, `updatedAt` | UTC timestamps |

Screens project `submitted` as Pending, `approved` as Approved, and `declined` as Rejected.

| Line field | Constraint |
| --- | --- |
| `id` | UUID |
| `purchaseOrderId` | Parent order |
| `materialId` | Material, or null when the line is only a description |
| `description` | Free text |
| `quantityKg` | Zero or greater |

Purchase orders do not change stock.

## Shipment

| Field | Constraint |
| --- | --- |
| `id` | UUID |
| `reference` | Required record number, unique per direction |
| `direction` | `inbound` or `outbound` |
| `purchaseOrderId` | Optional until dispatch of an outbound shipment, which requires one |
| `containerNumber` | Equipment number. May be empty until recorded. Unique among inbound shipments when set, ignoring case |
| `warehouseId` | Warehouse |
| `originCountry`, `destinationCountry` | Free text, may be empty |
| `status` | Inbound: `Planned`, `In transit`, `Arrived`, `Registered`, `Unloading`, `Completed`. Outbound: `Planned`, `Loading`, `Loaded`, `Dispatched` |
| `carrierName` | Free text. Required before a normal outbound dispatch |
| `handedOverAt` | UTC timestamp or null |
| `annex7Required` | Set when an Annex 7 file is attached |
| `sellerStatus` | `Pending` or `Confirmed` |
| `sellerCompany`, `sellerConfirmedBy`, `sellerConfirmedAt` | Seller confirmation captured for the current screens. Empty until confirmed |
| `overrideReason`, `overrideBy`, `overrideAt` | Owner override of seller and customs gates. Null until used |

An override still requires a carrier, a purchase order, and a container number. It does not post stock. Advancing shipment status submits or reuses a request and does not post stock.

Demurrage `startedAt` is set when an inbound shipment first enters `Unloading`, and only if it was null. It is not reset by later edits.

## Request

The number is generated on the server from `requestSequence` for the UTC year, in the form `REQ-2026-0001`. Clients cannot choose it.

| Field | Constraint |
| --- | --- |
| `id` | UUID |
| `number` | Matches `REQ-YYYY-NNNN`, unique |
| `type` | `unloading` for inbound, `loading` for outbound |
| `shipmentId` | Shipment |
| `purchaseOrderId` | Copied from the shipment, may be null |
| `containerNumber` | Copied from the shipment |
| `warehouseId` | Warehouse |
| `createdBy` | User who submitted it |
| `status` | `submitted`, `approved`, `declined`, `sent_back`, `completed`, or `deleted` |
| `declineReason` | Required when declined, otherwise null |
| `sentBackNote` | Required when sent back, otherwise null |
| `approvedBy`, `approvedAt` | Set when the owner approves |
| `enteredBy`, `enteredAt` | Set when a manager or the owner completes an approved request |
| `deletedBy`, `deletedAt` | Set on soft delete |
| `createdAt` | UTC timestamp |

Lifecycle:

- A shipment has at most one request that is not `declined`, `completed`, or `deleted`. Further line edits reuse that request.
- Requests are not edited in place. A correction is a new request. Soft delete keeps the row and sets `deleted`.
- Only the creator or the owner can soft-delete. A `completed` request cannot be deleted.
- Only the owner can approve, and only from `submitted`.
- Only the owner can decline. A reason is required. `completed` and `deleted` cannot be declined.
- The owner or a manager can send a request back. A note is required. `completed` and `deleted` cannot be sent back.
- Stock changes only when status is `approved` and a manager or the owner completes it. Completion applies each line once, then sets `completed`. Completing an already completed request is a no-op.

## RequestLine

| Field | Constraint |
| --- | --- |
| `id` | UUID |
| `requestId` | Parent request |
| `materialId` | Material |
| `packagingTypeId` | Active packaging type |
| `packageCount` | Whole number greater than zero |
| `grossKg` | Zero or greater |
| `tareTotalKg` | `packaging.tareKg * packageCount`, or zero when the line records no tare |
| `netKg` | Must equal `grossKg - tareTotalKg` after rounding to three decimals, and must be greater than zero |

Count-only lines are rejected. Every stored line has a positive net weight.

## RequestPhoto

| Field | Constraint |
| --- | --- |
| `id` | UUID |
| `requestId` | Request |
| `documentId` | Document of kind `photo` |

## Document

| Field | Constraint |
| --- | --- |
| `id` | UUID |
| `kind` | `cmr`, `photo`, `annex7`, `customs_proof`, or `other` |
| `category` | `Purchase`, `Container`, `Customs`, `Transport`, or `Annex 7` |
| `shipmentId` | Optional |
| `purchaseOrderId` | Optional |
| `name`, `mime` | File name and media type |
| `byteSize` | Zero or greater |
| `storageKey` | Key in file storage |
| `cmrReference`, `cmrCarrier`, `cmrGoodsDescription`, `cmrRemarks` | CMR columns, null unless kind is `cmr` |
| `cmrEnteredBy`, `cmrEnteredAt` | Who saved the CMR, and when |
| `createdBy`, `createdAt` | User and UTC timestamp |

A shipment has at most one CMR. File bytes live in file storage. Screens receive a URL that expires; the default lifetime is five minutes.

## StockBalance and StockMovement

| Balance field | Constraint |
| --- | --- |
| `id` | UUID |
| `materialId`, `warehouseId` | One balance per pair |
| `weightKg` | Zero or greater. Never negative |

| Movement field | Constraint |
| --- | --- |
| `id` | UUID |
| `materialId`, `warehouseId` | Balance that changed |
| `weightKg` | Greater than zero |
| `direction` | `in` for unloading, `out` for loading |
| `requestId`, `requestLineId` | The approved line that caused it |
| `createdAt`, `createdBy` | UTC timestamp and the user who completed the request |

A movement is idempotent on (`requestLineId`, `direction`). A second apply returns the existing row and does not change the balance. Movements are append-only. Outbound completion is refused when any line would make a balance negative, and no line of that request is posted.

## CustomsRecord

One row per shipment.

| Field | Constraint |
| --- | --- |
| `id` | UUID |
| `shipmentId` | Shipment, unique |
| `reference`, `procedureNote`, `goodsDescription`, `declarantReference` | Free text captured by the current screens. The final customs field list is still an open customer question |
| `confirmedBy`, `confirmedAt` | Set when customs is confirmed |
| `proofDocumentId` | Optional `customs_proof` document |

A normal outbound dispatch requires reference, procedure, and goods description, plus seller confirmation, unless an owner override is recorded. Confirmation does not post stock.

## DemurrageRecord

One row per shipment. Created with a shipment; `startedAt` stays null until unloading starts.

| Field | Constraint |
| --- | --- |
| `id` | UUID |
| `shipmentId` | Shipment, unique |
| `startedAt` | UTC timestamp or null |
| `freeMinutes` | Non-negative integer. The local rule is 120 |
| `ratePerMinute` | Non-negative. The local rule is 1 euro |
| `completedAt` | UTC timestamp or null, set when inbound status becomes `Completed` |
| `elapsedMinutes`, `billableMinutes`, `chargeEur` | Filled when the clock stops. Billable minutes are elapsed minus free minutes, floored at zero |

## Annex7Record

| Field | Constraint |
| --- | --- |
| `id` | UUID |
| `shipmentId` | Shipment |
| `documentId` | Document of kind `annex7` |
| `reference` | Required |
| `status` | `uploaded`, `under_review`, or `approved` |
| `notes` | Free text |
| `uploadedBy`, `uploadedAt` | User and UTC timestamp |

## PoMessage

| Field | Constraint |
| --- | --- |
| `id` | UUID |
| `purchaseOrderId` | Null only for an internal note that is not tied to an order |
| `scope` | `purchase-order`, `seller`, or `internal`. Scope keeps the three chat sections separate |
| `authorId` | User |
| `body` | Required |
| `createdAt` | UTC timestamp |

A customer can post on a purchase-order thread only when the order belongs to that customer's company.

## AuditLogEntry

Written on every request state change and on the other state changes the local commands perform. Rows are append-only.

| Field | Constraint |
| --- | --- |
| `id` | UUID |
| `userId` | Actor |
| `action` | Required verb, such as `request-approved` |
| `targetType`, `targetId` | Record that changed |
| `oldValue`, `newValue` | Optional text snapshots |
| `createdAt` | UTC timestamp |

## Local adapter records

These exist so the JSON store can sign sessions and files. They are not business tables for the later database. Supabase Auth and Storage replace them.

| Record | Fields |
| --- | --- |
| Session | `id`, `userId`, `expiresAt`. Lifetime is 12 hours. The cookie is `stockflow_session`, httpOnly |
| Blob | `key`, `name`, `mime`, `bytesBase64` |
| Request sequence | `year`, `next` issued number for that year |
| File secret | HMAC key for time-limited file URLs |

## Interfaces

`LocalAdapter.services()` implements each of these. Screens do not call the JSON file, IndexedDB, `localStorage`, or `sessionStorage`. They call server actions, which call the adapter.

| Interface | Responsibility |
| --- | --- |
| `UserRepository` | List profiles, create a user, change role, deactivate |
| `AuthRepository` | Sign in, sign out, current session, create user, deactivate user |
| `PurchaseOrderRepository` | List orders and lines |
| `ShipmentRepository` | List shipments |
| `RequestRepository` | List, submit, approve, decline, send back, complete, soft-delete |
| `InventoryRepository` | Balances, movements, set the kilogram threshold, apply one idempotent movement |
| `DocumentRepository` | List documents |
| `CustomsRepository` | List customs rows |
| `DemurrageRepository` | List demurrage rows |
| `Annex7Repository` | List Annex 7 rows |
| `ChatRepository` | List and send messages |
| `AuditRepository` | List the audit log |
| `ReportRepository` | Stock, purchase totals, movements |
| `FileStorage` | `put`, `signedUrl`, `delete` |
| `DirectoryRepository` | Warehouses, companies, materials, packaging types |

`DirectoryRepository` is the reference-data companion. The screen snapshot in `src/domain/project.ts` is a projection of these records. It is not a second store.

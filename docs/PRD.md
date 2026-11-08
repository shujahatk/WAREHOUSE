# StockFlow product requirements

## Product

StockFlow is a warehouse operations workspace for teams that move goods by weight. Planners need one place to see what is on hand, what is inbound, and which lots need attention.

Phase 1 is the interface only. It proves the information architecture and the visual system with compiled sample records.

## Users

- Warehouse planners checking on-hand weight and capacity
- Buyers tracking purchase orders that still need receipt
- Commercial staff reviewing customers, suppliers, and sales orders

## Phase 1 goals

- Provide a black-and-white operations interface with a shared shell
- Make every primary workspace route reachable from the sidebar
- Show inventory weight, incoming containers, pending purchase orders, warehouse distribution, recent stock movements, and low-stock indicators on the dashboard
- Label sample figures as demo data on every screen that shows them
- Keep the implementation typed, componentized, and free of a backend

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Redirects to `/dashboard` |
| `/dashboard` | Sample position: weight, inbound containers, pending orders, distribution, movements, low stock |
| `/inventory` | Sample lots |
| `/warehouses` | Sample sites, capacity, and share of on-hand weight |
| `/purchases` | Sample purchase orders |
| `/containers` | Sample containers |
| `/stock-movements` | Sample ledger lines |
| `/customers` | Sample customers |
| `/suppliers` | Sample suppliers |
| `/sales` | Sample sales order headers |
| `/reports` | Category preview, report catalog, and an empty saved-reports state |
| `/settings` | Read-only sample preferences and empty states for alerts and access |

## Demo data policy

Sample records live in `src/lib/demo-data.ts`. Dashboard totals are derived from those records in `src/lib/selectors.ts`. The sample date is 21 Oct 2026.

The interface must say that these records are demo data. It must not describe them as saved, synced, or operational. Stock movement lines are illustrative. They are not applied to lot balances, so the ledger and the on-hand position are not a reconciled pair.

Search filters the rows already rendered in the browser. It does not call a server.

## Counting rules shown in the interface

- Inventory weight is the sum of lot `weightKg`.
- Incoming containers are those with status `in_transit` or `customs`. Scheduled containers stay on the containers page and are excluded from the dashboard count.
- Pending purchase orders are those with status `pending`. Drafts stay on the purchases page and are excluded from the dashboard count.
- Low-stock lots are those whose quantity is at or below the reorder point, including quantity zero.

## Non-goals for Phase 1

- Database, schema migrations, and seed jobs
- Authentication, accounts, and roles
- API routes or any stand-in service
- Creating, editing, or deleting records
- Posting stock movements against balances
- Generating or saving report files
- Sending notifications

## Phase 1 success criteria

- All sidebar links open a working page inside the shared shell
- The dashboard shows the six required information groups, each labeled as demo data
- Empty states explain missing capability where the product cannot store data yet
- `npm run lint` and `npm run build` succeed

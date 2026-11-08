# Phase tracker

Status of StockFlow delivery. Phase 1 is the interface. Later phases are recommendations, not work already started.

## Phase 1 — Interface

Status: complete

- [x] Inspect the generated Next.js, TypeScript, Tailwind CSS v4, and ESLint app
- [x] Shared responsive shell: sidebar, top bar, page headings
- [x] Reusable cards, tables, status indicators, search, and empty states
- [x] Routes: `/dashboard`, `/inventory`, `/warehouses`, `/purchases`, `/containers`, `/stock-movements`, `/customers`, `/suppliers`, `/sales`, `/reports`, `/settings`
- [x] Dashboard: inventory weight, incoming containers, pending purchase orders, warehouse distribution, recent stock movements, low-stock indicators
- [x] Sample figures labeled as demo data, with no claim that they are stored
- [x] No database, authentication, or API
- [x] `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/PHASE_TRACKER.md`, `docs/DATA_MODEL.md`, `docs/QA_CHECKLIST.md`
- [x] `README.md` setup and limitations

## Phase 2 — Persistence (recommended next)

Replace the compiled sample module with a real store and server reads.

- Add a database and migrations that match `docs/DATA_MODEL.md`
- Seed the current sample rows so the interface can be compared with Phase 1
- Read warehouses, lots, containers, purchase orders, movements, customers, suppliers, and sales on the server
- Keep the pages read-only
- Keep the demo labeling until the data is clearly operational rather than a seed

Do this before authentication. The read path should be stable before accounts exist.

## Phase 3 — Access

- Sign-in and sessions
- Roles for planner, buyer, and read-only review
- Protect workspace routes

## Phase 4 — Recorded operations

- Receive purchase orders and containers
- Post stock movements in the same transaction that changes on-hand weight
- Keep an auditable ledger that reconciles to lot balances
- Stop treating movement lines as disconnected samples

## Phase 5 — Reporting

- Run the catalog in `src/lib/demo-data.ts` against stored data
- Save report definitions
- Export files

## Still out of scope until a later phase

Notifications, multi-organization tenancy, and currency valuation are not required to finish Phases 2 through 5.

## Verification recorded 21 Oct 2026

- `npm run lint` completed with exit code 0
- `npm run build` completed with exit code 0 and prerendered every workspace route as static content
- `GET /` returned 307 with `Location: /dashboard`
- Each workspace route returned 200
- An unknown path returned 404


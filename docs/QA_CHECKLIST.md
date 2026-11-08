# QA checklist

Use this list against a running StockFlow workspace. Phase 1 has no automated test runner.

## Setup

- [ ] `npm install` completes
- [ ] `npm run dev` serves the app and prints a local URL
- [ ] `npm run lint` completes with no errors
- [ ] `npm run build` completes with no errors

## Shell

- [ ] `/` redirects to `/dashboard`
- [ ] Every sidebar link opens its route: dashboard, inventory, warehouses, purchases, containers, stock movements, customers, suppliers, sales, reports, settings
- [ ] The current route is marked in the sidebar
- [ ] The top bar names the current page and shows a Demo data label
- [ ] Below the large breakpoint, the sidebar is closed until Open navigation is used
- [ ] Escape, the scrim, and Close navigation dismiss the mobile sidebar
- [ ] Choosing a destination closes the mobile sidebar
- [ ] Wide tables scroll horizontally inside the page

## Demo data honesty

- [ ] Dashboard, list pages, and reports show a Demo data notice
- [ ] The notice says the records are not stored
- [ ] Settings says the page is not saved
- [ ] Stock movements describe the lines as unposted samples
- [ ] Search helper text says filtering happens in the browser

## Dashboard definitions

- [ ] Inventory weight matches the sum of the sample lots
- [ ] Incoming containers count only in transit and customs
- [ ] Pending purchase orders exclude drafts
- [ ] Low-stock indicators include lots at or below reorder, including zero quantity
- [ ] Warehouse bars show share of on-hand weight
- [ ] Recent movements are the latest sample lines

## Search and empty states

- [ ] A query with no match shows "No matching demo records" and Clear search restores the rows
- [ ] A known SKU, container number, or customer name narrows the matching page
- [ ] Reports shows an empty saved-reports state
- [ ] Settings shows empty states for notifications and access
- [ ] An unknown URL shows the not-found page with a link back to the dashboard

## Regression

- [ ] Reloading a filtered table clears the filter and shows the original sample
- [ ] No page offers a control that claims to create, edit, delete, or save a record

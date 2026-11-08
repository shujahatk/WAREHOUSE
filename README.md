# StockFlow

StockFlow is a warehouse operations workspace. Phase 1 is the interface: a shared shell and working routes filled with compiled demo data.

The sample figures are not stored. Reloading the app shows the same records because they are part of the source, not because a database saved them.

## Setup

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Open the local URL printed in the terminal. `/` redirects to `/dashboard`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run lint` | Run ESLint |
| `npm run build` | Create a production build |
| `npm start` | Serve the production build |

The app uses Next.js 16, React 19, TypeScript, and Tailwind CSS v4. Styling is configured in `src/app/globals.css`. There is no `tailwind.config` file.

## Routes

- `/dashboard`
- `/inventory`
- `/warehouses`
- `/purchases`
- `/containers`
- `/stock-movements`
- `/customers`
- `/suppliers`
- `/sales`
- `/reports`
- `/settings`

## Current limitations

- No database, authentication, or API
- No way to create, edit, or delete records
- Search filters demo rows in the browser only
- Stock movements are sample lines and are not posted against on-hand lots
- Reports are a catalog and a calculated preview. Files are not generated or saved
- Settings values are read-only samples
- The interface stays on the light black-and-white palette and does not follow a system dark theme

## Docs

- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Phase tracker](docs/PHASE_TRACKER.md)
- [Data model](docs/DATA_MODEL.md)
- [QA checklist](docs/QA_CHECKLIST.md)

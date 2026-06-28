# FinTrack — Personal Finance Tracker

A full-stack personal finance app. Users upload bank statements (CSV, Excel, PDF), transactions are parsed and auto-categorized, and displayed in a dashboard with charts and a filterable transaction table.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/finance-app run dev` — run the frontend (port 18748)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Recharts, TanStack Query, shadcn/ui, Wouter
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Parsing: PapaParse (CSV), xlsx (Excel), pdf-parse (PDF)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/db/src/schema/transactions.ts` — transactions table schema
- `artifacts/api-server/src/routes/` — Express route handlers (upload, transactions, dashboard, categories)
- `artifacts/api-server/src/lib/parsers.ts` — CSV/Excel/PDF parsing logic
- `artifacts/api-server/src/lib/categorizer.ts` — keyword-based auto-categorization + category list
- `artifacts/finance-app/src/pages/` — Dashboard, Transactions, Upload pages
- `artifacts/finance-app/src/components/layout.tsx` — sidebar navigation
- `attached_assets/sample-statement.csv` — sample CSV for testing

## Architecture decisions

- Files deleted after parsing — only structured transaction data is stored, never raw uploads
- Sensitive data (IBAN, card numbers, account numbers) masked in `parsers.ts` before DB insert
- Rule-based categorizer in `categorizer.ts` — easily extendable keyword lists per category
- pdf-parse externalized from esbuild bundle (uses path traversal for its own test data files)
- Dynamic import pattern for pdf-parse to avoid CJS/ESM interop issues at build time

## Product

Upload CSV/Excel/PDF bank statements → transactions are parsed, masked, categorized, and stored → browse and filter transactions with inline category editing → dashboard shows monthly spending totals, category breakdown (pie chart), top merchants (bar chart), and income vs expenses trend (line chart) → switch months via a dropdown selector.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `pdf-parse` must stay in `build.mjs` external list — it reads test fixture files via path traversal that break when bundled
- After any schema change in `lib/db/src/schema/`, run `pnpm run typecheck:libs` before checking artifact packages, then `pnpm --filter @workspace/db run push`
- After any OpenAPI spec change, re-run codegen before using updated types

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Sample CSV: `attached_assets/sample-statement.csv`

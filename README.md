# FinTrack — Personal Finance Tracker

A full-stack personal finance analytics platform. Upload CSV, Excel, or PDF bank statements; transactions are parsed, masked, and auto-categorised; then browse them in a filterable table, set monthly budgets, and explore rule-based spending insights — all in a clean React dashboard.

---

## Features

- **Upload** CSV / Excel (.xlsx/.xls) / PDF bank statements with a two-step preview flow (review before saving, duplicate detection)
- **Dashboard** — monthly KPIs, spending pie chart, top merchants bar chart, income vs expenses trend line, recent transactions, biggest expenses, recurring payment detection
- **Transactions** — sortable columns, search & filter, bulk categorise, inline notes editing, Export CSV
- **Budgets** — set monthly limits per category with real-time progress bars and over-budget warnings
- **Insights** — financial health score, month-over-month comparison, recurring payments, savings opportunity tips
- **Categories & Rules** — 12 built-in categories; create custom keyword→category rules stored in the database (applied before built-ins on next import)
- **Settings** — load 6-month demo dataset, delete all data with confirmation, privacy information
- **Mobile-responsive** — collapsible Sheet sidebar on small screens

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24, TypeScript 5.9 |
| Package manager | pnpm 10 workspaces |
| Frontend | React 19, Vite 7, Wouter, TanStack Query v5, shadcn/ui, Recharts, Tailwind CSS v4 |
| API | Express 5 |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod v4, drizzle-zod |
| API contract | OpenAPI 3.1 → Orval codegen (React Query hooks + Zod schemas) |
| Parsing | PapaParse (CSV), xlsx (Excel), pdf-parse (PDF) |
| Logging | Pino + pino-http |
| Build | esbuild (ESM bundle for API server) |

---

## Prerequisites

| Tool | Minimum version | Quick install |
|---|---|---|
| Node.js | 22 (24 recommended) | https://nodejs.org — or `nvm install 24` |
| pnpm | 10 | `npm i -g pnpm@latest` |
| PostgreSQL | 14 | https://www.postgresql.org/download/ |

**macOS shortcut:**
```bash
brew install postgresql@16 && brew services start postgresql@16
```

**Windows:** use the official PostgreSQL installer from https://www.postgresql.org/download/windows/ and include the command-line tools (`psql`, `createdb`) in PATH, or create the database from pgAdmin.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `SESSION_SECRET` | ✅ | — | Secret for signing sessions (any long random string) |
| `PORT` (API) | no | `8080` | Express API listen port |
| `PORT` (frontend) | no | `5173` | Vite dev server port (set in `artifacts/finance-app/.env`) |
| `BASE_PATH` | no | `/` | Vite base path (set in `artifacts/finance-app/.env`) |
| `API_PORT` | no | `8080` | API port the Vite proxy forwards to (local dev only) |

### Example `DATABASE_URL` formats

```
# Local PostgreSQL, default OS user
DATABASE_URL=postgresql://localhost:5432/fintrack

# With explicit credentials
DATABASE_URL=postgresql://myuser:mypassword@localhost:5432/fintrack

# Supabase / Neon / Railway (paste from their dashboard)
DATABASE_URL=postgresql://user:pass@db.example.com:5432/fintrack?sslmode=require
```

### Generate a SESSION_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Local Setup

### 1. Open the local workspace and install

```powershell
cd C:\Projects\FinTrack
pnpm install
```

This prepared local workspace lives at `C:\Projects\FinanceAnalyzerPro`. `C:\Projects\FinTrack` is a directory junction to that same folder, so either path works without duplicating files.

### 2. Configure environment

```powershell
# Root .env - read by the API server
Copy-Item .env.example .env
# Edit .env: set DATABASE_URL and SESSION_SECRET.
```

In this prepared workspace, `.env` has already been created with local defaults. Update `DATABASE_URL` if your PostgreSQL username/password or host differs.

The `artifacts/finance-app/.env` file ships with correct local defaults (`PORT=5173`, `BASE_PATH=/`). You normally don't need to touch it.

### 3. Create the database

```bash
# Create the database (adjust username if needed)
createdb fintrack
# or: psql -U postgres -c "CREATE DATABASE fintrack;"
```

On Windows, if `createdb` is not in PATH, open the SQL Shell (`psql`) or pgAdmin and run:

```sql
CREATE DATABASE fintrack;
```

### 4. Push the schema

```bash
pnpm --filter @workspace/db run push
```

This creates three tables: `transactions`, `budgets`, `categorization_rules`.

### 5. Start the development servers

Open **two terminal tabs** in `C:\Projects\FinTrack`:

**Terminal 1 — API** (http://localhost:8080):
```bash
pnpm --filter @workspace/api-server run dev
```

**Terminal 2 — Frontend** (http://localhost:5173):
```bash
pnpm --filter @workspace/finance-app run dev
```

Open **http://localhost:5173** in your browser.

> The Vite dev server automatically proxies all `/api/*` requests to `localhost:8080` — no extra config needed.

### VS Code shortcut

Open the command palette → **Tasks: Run Task** → **Start All (API + Frontend)** to launch both in split terminals.

---

## Project Structure

```
.
├── .env.example                    ← copy to .env and fill in
├── .vscode/                        ← VS Code tasks, launch, extensions
├── attached_assets/
│   └── sample-statement.csv        ← sample CSV for testing uploads
│
├── artifacts/
│   ├── api-server/                 ← Express 5 API (port 8080)
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   ├── categorizer.ts  ← keyword rules + CATEGORIES list
│   │   │   │   ├── parsers.ts      ← CSV/Excel/PDF parsing + data masking
│   │   │   │   └── logger.ts       ← Pino singleton
│   │   │   ├── routes/
│   │   │   │   ├── budgets.ts      ← GET/PUT/DELETE /api/budgets/:month/:category
│   │   │   │   ├── categories.ts   ← GET /api/categories
│   │   │   │   ├── dashboard.ts    ← GET /api/dashboard
│   │   │   │   ├── demo.ts         ← POST /api/demo  |  DELETE /api/data
│   │   │   │   ├── health.ts       ← GET /api/healthz
│   │   │   │   ├── insights.ts     ← GET /api/insights
│   │   │   │   ├── rules.ts        ← CRUD /api/rules
│   │   │   │   ├── transactions.ts ← CRUD + /bulk-categorize
│   │   │   │   └── upload.ts       ← POST /api/upload/preview | /confirm | /upload
│   │   │   └── index.ts
│   │   └── build.mjs               ← esbuild config (pdf-parse is external)
│   │
│   └── finance-app/                ← React + Vite frontend (port 5173)
│       ├── .env                    ← local dev defaults (PORT, BASE_PATH)
│       └── src/
│           ├── components/
│           │   ├── layout.tsx      ← sidebar + mobile drawer
│           │   └── ui/             ← shadcn/ui component library
│           ├── pages/
│           │   ├── dashboard.tsx
│           │   ├── transactions.tsx
│           │   ├── upload.tsx
│           │   ├── categories.tsx
│           │   ├── budgets.tsx
│           │   ├── insights.tsx
│           │   └── settings.tsx
│           └── App.tsx
│
└── lib/
    ├── api-spec/
    │   └── openapi.yaml            ← OpenAPI 3.1 contract (source of truth)
    ├── api-client-react/           ← ⚠ generated — do not edit manually
    ├── api-zod/                    ← ⚠ generated — do not edit manually
    └── db/
        └── src/schema/
            ├── transactions.ts
            ├── budgets.ts
            └── rules.ts
```

---

## Key Development Workflows

### Adding a new API endpoint

1. Add the endpoint to `lib/api-spec/openapi.yaml`
2. Re-run codegen (regenerates React Query hooks + Zod validators):
   ```bash
   pnpm --filter @workspace/api-spec run codegen
   ```
3. Implement the route handler in `artifacts/api-server/src/routes/`
4. Register it in `artifacts/api-server/src/routes/index.ts`
5. Use the generated hook in the React frontend

### Changing the database schema

1. Edit or add files in `lib/db/src/schema/`
2. Export the new table from `lib/db/src/schema/index.ts`
3. Run:
   ```bash
   pnpm run typecheck:libs          # rebuild lib declarations
   pnpm --filter @workspace/db run push   # apply to database
   ```

### Extending auto-categorisation

Edit `artifacts/api-server/src/lib/categorizer.ts` — add keywords to `CATEGORY_RULES` or add a new category entry. The same file exports the `CATEGORIES` list consumed by the frontend.

Users can also add custom rules from the **Categories & Rules** page — these are applied before the built-in rules on every import.

### Running the full typecheck

```bash
pnpm run typecheck
```

---

## Available Scripts

| Command | Description |
|---|---|
| `pnpm --filter @workspace/api-server run dev` | Build + start API in dev mode |
| `pnpm --filter @workspace/finance-app run dev` | Start Vite dev server |
| `pnpm --filter @workspace/db run push` | Push Drizzle schema to the database |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate hooks + Zod schemas from OpenAPI spec |
| `pnpm run typecheck` | Full typecheck across all packages |
| `pnpm run typecheck:libs` | Typecheck shared libs only (faster during development) |
| `pnpm --filter @workspace/api-server run build` | Production build of API |
| `pnpm --filter @workspace/finance-app run build` | Production build of frontend (outputs to `dist/public/`) |

---

## Deploying to Production

### API server

```bash
# 1. Build
pnpm --filter @workspace/api-server run build

# 2. Start (set all env vars)
DATABASE_URL=... SESSION_SECRET=... PORT=8080 NODE_ENV=production \
  node --enable-source-maps artifacts/api-server/dist/index.mjs
```

### Frontend

```bash
# Build static files
BASE_PATH=/ PORT=3000 pnpm --filter @workspace/finance-app run build
# Serve the dist/public/ directory from any static host (Nginx, Vercel, Netlify, etc.)
```

### Database migrations (production)

Use Drizzle's `generate` + `migrate` commands instead of `push` in production:

```bash
pnpm --filter @workspace/db run generate   # generate SQL migration files
pnpm --filter @workspace/db run migrate    # apply migrations safely
```

---

## Supported Bank Statement Formats

### CSV

Auto-detects common column names:

| Field | Accepted column names |
|---|---|
| Date | `Date`, `dt`, `Transaction Date` |
| Description | `Description`, `Narration`, `Merchant`, `Details`, `Particulars`, `Memo`, `Reference` |
| Amount | `Amount`, `Value`, `Sum` |
| Debit / Credit | `Debit`, `Credit` (separate columns also supported) |
| Type | `Type`, `DR/CR`, `Transaction Type` |

### Excel

Same columns as CSV. The parser reads the first worksheet.

### PDF

Extracts lines containing a date pattern and an amount. Works best with text-based (not scanned) PDFs. Quality varies by bank format.

---

## Privacy & Security

- Uploaded files are **deleted immediately** after parsing — only structured fields are stored
- IBAN numbers, 16-digit card numbers, and long account numbers are **masked (`****`)** before being stored (`lib/parsers.ts`)
- No data is sent to any third-party service

---

## Sample Data

`attached_assets/sample-statement.csv` — 3 months of realistic UK bank transactions covering all 12 categories.

You can also generate 6 months of realistic demo data without uploading anything: **Settings → Load Demo Data**.

---

## License

MIT

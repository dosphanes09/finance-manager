# FinanceAnalyzerPro — Personal Finance Tracker

A full-stack personal finance analytics platform. Upload CSV, Excel, or PDF bank statements; transactions are parsed, masked, and auto-categorised; then browse them in a filterable table, set monthly budgets, and explore rule-based spending insights — all in a clean React dashboard.

---

## Features

- **Upload** CSV / Excel (.xlsx/.xls) / PDF bank statements with a two-step preview flow (review before saving, duplicate detection)
- **Dashboard** — flexible period KPIs, category totals and trends, top merchants bar chart, income vs expenses trend line, recent transactions, biggest expenses, recurring payment detection
- **Transactions** — sortable columns, search/filter, merchant + original description columns, inline category editing, quick review, bulk categorise/review, inline notes, Export CSV
- **Budgets** — set monthly limits per category with real-time progress bars and over-budget warnings
- **Insights** — financial health score, month-over-month comparison, recurring payments, savings opportunity tips
- **Categories & Rules** — 12 built-in categories; create custom keyword→category rules manually, from transactions, or from suggestions (custom rules override built-ins)
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
| `FINANCE_ANALYZER_ENV_FILE` | no | auto-detected root `.env` | Optional explicit path to the env file used by DB tooling and the API |
| `PORT` (API) | no | `8080` | Express API listen port |
| `PORT` (frontend) | no | `5173` | Vite dev server port (set in `artifacts/finance-app/.env`) |
| `BASE_PATH` | no | `/` | Vite base path (set in `artifacts/finance-app/.env`) |
| `API_PORT` | no | `8080` | API port the Vite proxy forwards to (local dev only) |
| `PDF_PARSE_DEBUG` | no | `false` | Save masked selectable-PDF parser debug text and print masked extracted-line diagnostics |
| `CORS_ORIGINS` | no | local Vite origins | Comma-separated allowed browser origins for the API |
| `JSON_BODY_LIMIT` | no | `5mb` | Express JSON body size limit |
| `URLENCODED_BODY_LIMIT` | no | `256kb` | Express URL-encoded body size limit |
| `UPLOAD_RATE_LIMIT_WINDOW_MS` | no | `60000` | Upload route rate-limit window |
| `UPLOAD_RATE_LIMIT_MAX` | no | `8` | Upload requests allowed per IP per window |
| `LLM_CATEGORIZATION_ENABLED` | no | `false` | Enables optional low-confidence categorization fallback only after deterministic rules fail |
| `LLM_CATEGORIZATION_CONFIDENCE_THRESHOLD` | no | `0.65` | LLM fallback is skipped when deterministic confidence is at or above this value |
| `LLM_CATEGORIZATION_ENDPOINT` | no | — | Optional internal LLM categorization endpoint |
| `LLM_CATEGORIZATION_API_KEY` | no | — | API key for the optional LLM endpoint |

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
cd C:\Projects\FinanceAnalyzerPro
pnpm install
```

This prepared local workspace lives at `C:\Projects\FinanceAnalyzerPro`.

### 2. Configure environment

```powershell
# Root .env - read by Drizzle, the DB package, and the API server
Copy-Item .env.example .env
# Edit .env: set DATABASE_URL and SESSION_SECRET.
```

In this prepared workspace, `.env` has already been created with local defaults. Update `DATABASE_URL` if your PostgreSQL username/password or host differs.

The API does not need `artifacts/api-server/.env`. Keep database settings in the project root `.env` so Drizzle pushes and API runtime queries use the same connection string. If you need to force a different env file, set `FINANCE_ANALYZER_ENV_FILE` to its absolute path.

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

This workspace can also run PostgreSQL from the ignored local cluster at `.local/postgres-data`:

```powershell
& "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe" -D "C:\Projects\FinanceAnalyzerPro\.local\postgres-data" -l "C:\Projects\FinanceAnalyzerPro\.local\logs\postgres.log" -o "-p 5432 -h localhost" start
```

The `.local` folder is ignored by git and must not be committed.

### 4. Push the schema

```bash
pnpm --filter @workspace/db run push
```

This creates four core tables: `transactions`, `budgets`, `categorization_rules`, and `merchants`. The `transactions` table stores parser/categorization confidence metadata and a `reviewed` flag used by the Needs Review workflow. The `merchants` table is a persistent recognition memory so corrected or recognized merchants are reused on future imports.

### 5. Start the development servers

Open **two terminal tabs** in `C:\Projects\FinanceAnalyzerPro`:

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

### 6. Verify database connectivity from the API

With the API server running, check the DB health endpoint:

```powershell
curl.exe http://127.0.0.1:8080/api/health/db
```

Expected when PostgreSQL is reachable:

```json
{
  "connected": true,
  "environment": {
    "envFileLoaded": "C:\\Projects\\FinanceAnalyzerPro\\.env",
    "databaseUrl": {
      "scheme": "postgresql",
      "host": "localhost",
      "port": "5432",
      "database": "fintrack",
      "user": "postgres",
      "password": "<redacted>"
    }
  }
}
```

If this returns `503` with `ECONNREFUSED`, the API loaded the env file but cannot reach PostgreSQL. Verify the database process is listening before trying Upload duplicate detection:

```powershell
Test-NetConnection 127.0.0.1 -Port 5432
```

### VS Code shortcut

Open the command palette → **Tasks: Run Task** → **Start All (API + Frontend)** to launch both in split terminals.

---

## Everyday Local App Mode (Windows)

After the first setup is complete, you do not need to manually start PostgreSQL, the backend, and the Vite frontend for normal use.

In this mode:

- PostgreSQL starts in the background from the local `.local/postgres-data` cluster.
- The API starts on `http://127.0.0.1:8080`.
- The API serves the built frontend from `artifacts/finance-app/dist/public`.
- The desktop shortcut opens the app directly from `http://127.0.0.1:8080/`.
- Port `5173` is only needed for frontend development, not everyday use.

### Recommended one-command setup

Run this after the root `.env` is configured:

```cmd
cd C:\Projects\FinanceAnalyzerPro
scripts\local-prod\setup-local-app.cmd
```

This installs workspace dependencies, starts PostgreSQL, applies the local Drizzle schema, builds the API and frontend, installs background startup launchers, creates the desktop shortcut, and verifies that the app responds on `8080`.

Useful setup options:

```cmd
scripts\local-prod\setup-local-app.cmd -SkipInstall
scripts\local-prod\setup-local-app.cmd -SkipDbPush
scripts\local-prod\setup-local-app.cmd -SkipBuild
scripts\local-prod\setup-local-app.cmd -NoBrowser
```

### One-time build

Run this after pulling code changes or changing frontend/backend source:

```cmd
cd C:\Projects\FinanceAnalyzerPro
pnpm run build
```

### Install automatic startup

Run these once:

```cmd
cd C:\Projects\FinanceAnalyzerPro
scripts\local-prod\install-postgres-autostart.cmd
scripts\local-prod\install-api-autostart.cmd
scripts\local-prod\install-desktop-shortcut.cmd
```

If Windows does not allow Scheduled Tasks for this user, the scripts create hidden Startup launchers instead:

```text
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\FinanceAnalyzerPro-Postgres.vbs
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\FinanceAnalyzerPro-Api.vbs
```

On this configured machine, the desktop shortcut is created at:

```text
C:\Users\yagiz\OneDrive\Desktop\FinanceAnalyzerPro.lnk
```

### Open the app

Use the desktop shortcut, or run:

```cmd
cd C:\Projects\FinanceAnalyzerPro
scripts\local-prod\open-app.cmd
```

If the app is not running, `open-app.cmd` starts PostgreSQL and the API in the background, waits until `8080` is ready, and then opens the browser.

### Manage the local app

```cmd
cd C:\Projects\FinanceAnalyzerPro
scripts\local-prod\status-app.cmd
scripts\local-prod\restart-app.cmd
scripts\local-prod\stop-app.cmd
```

Use this if you want to stop only the API and leave PostgreSQL running:

```cmd
scripts\local-prod\stop-app.cmd -KeepPostgres
```

### Logs and local data

Runtime logs are written outside the repository:

```text
%LOCALAPPDATA%\FinanceAnalyzerPro\logs\api.log
%LOCALAPPDATA%\FinanceAnalyzerPro\logs\postgres.log
```

Local PostgreSQL data stays in the ignored project folder:

```text
C:\Projects\FinanceAnalyzerPro\.local\postgres-data
```

Do not commit `.env`, `.local`, uploaded statements, or real financial data.

For development work, keep using the two-terminal Vite/API workflow from **Local Setup**.

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
│   │   │   │   ├── health.ts       ← GET /api/healthz | /api/health/db
│   │   │   │   ├── insights.ts     ← GET /api/insights
│   │   │   │   ├── rules.ts        ← CRUD /api/rules + suggestions/apply endpoints
│   │   │   │   ├── transactions.ts ← CRUD + bulk categorize/review
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

### Transaction categorization workflow

- On **Transactions**, change the category directly in the table. The transaction is saved immediately and then asks whether to remember the categorization.
- Choose **No, only update this transaction** for a one-off fix.
- Choose **Yes, create a rule for this merchant going forward** to save a custom rule without changing older matching transactions.
- Choose **Yes, create a rule and apply it to all matching past transactions** to save the rule and recategorize historical matches.
- The suggested rule pattern prefers the normalized merchant, then a cleaned description with dates, numbers, card references, authorization codes, installments, and amounts removed.
- Use **Needs review** to focus on transactions categorized as `other`, low-confidence matches, or generic merchants such as card payments. **Quick review** steps through the current queue one transaction at a time.
- Select multiple transactions to bulk change category, create grouped rules, apply existing rules to selected rows, or mark them reviewed.
- Custom rules are deterministic and always run before built-in keyword rules. AI is not used for categorization.
- Category values stored in PostgreSQL are canonical IDs such as `food`; the UI displays labels such as `Food & Dining` from the shared `@workspace/finance-categories` package.

To normalize old database rows that may contain display labels:

```bash
pnpm --filter @workspace/scripts run normalize-categories
```

### Dashboard period analysis

- On **Dashboard**, choose **This month**, **Last 3 months**, **Last 6 months**, **This year**, **Last 12 months**, or **Custom range**.
- Custom range uses transaction dates, not import dates.
- The selected period is saved in the browser and restored when returning to the dashboard.
- Total income, total expense, net balance, category totals, merchant totals, recurring payments, and trend charts all use the selected date range.
- Multi-month views keep empty months visible as zero and show month-by-month spending for top categories.

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
| `scripts\local-prod\setup-local-app.cmd` | One-command local app setup: install, DB schema, build, autostart, shortcut, health check |
| `scripts\local-prod\open-app.cmd` | Open the local one-port app, starting background services if needed |
| `scripts\local-prod\status-app.cmd` | Show local API/PostgreSQL status and log locations |
| `scripts\local-prod\restart-app.cmd` | Restart the local API and project PostgreSQL |
| `scripts\local-prod\stop-app.cmd` | Stop the local API and project PostgreSQL |
| `scripts\local-prod\install-desktop-shortcut.cmd` | Create the Windows desktop shortcut |

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

The import pipeline is deterministic first:

1. Validate file extension, MIME type, size, and file signature.
2. Extract structured rows from CSV/Excel or selectable text from PDF.
3. Detect Turkish bank profile automatically.
4. Normalize rows into one canonical transaction shape: date, merchant, description, amount, direction, semantic transaction kind, currency, balance, bank/parser metadata, category, confidence, and explanation.
5. Remove noisy bank tokens such as POS IDs, reference numbers, authorization codes, masked cards, transaction IDs, timestamps, and installment markers.
6. Categorize with user rules, persistent merchant memory, parser merchant rules, and built-in deterministic rules.
7. Use the optional LLM fallback only when enabled and deterministic confidence is below `LLM_CATEGORIZATION_CONFIDENCE_THRESHOLD`.

Currency defaults to Turkish Lira (`TRY`). CSV and Excel imports without a currency column are stored as `TRY`; decimal numbers alone never imply USD. If an uploaded file explicitly contains `USD`, `EUR`, `GBP`, `TL`, `TRY`, or a currency column/value, the parser preserves that explicit currency. UI amounts are formatted centrally with Turkish locale (`tr-TR`) using `formatCurrency(amount, currency = "TRY", locale = "tr-TR")`.

Detected Turkish bank profiles:

| Bank | Current support |
|---|---|
| Enpara | Bank-specific credit-card PDF parser |
| Ziraat | Bank-specific Bankkart PDF parser |
| Is Bankasi, Garanti BBVA, Akbank, Yapi Kredi, QNB/Finansbank, VakifBank, Halkbank, Kuveyt Turk | Bank profile detection plus deterministic Turkish generic table parser |

Transaction kind detection includes `pos`, `eft`, `fast`, `atm_withdrawal`, `atm_deposit`, `credit_card_payment`, `salary`, `refund`, `bill`, `subscription`, `investment`, `transfer`, `fee`, `interest`, and `cashback`.

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

Extracts selectable PDF text and groups transaction blocks across continuation lines. The parser supports Turkish-style dates and amounts, debit/credit columns, and balance columns. Works with text-based PDFs only; scanned documents are not OCR'd.

For selectable PDFs that fail to parse, enable backend diagnostics:

```powershell
$env:PDF_PARSE_DEBUG="true"
pnpm --filter @workspace/api-server run dev
```

You can also send `?pdfDebug=1` on `/api/upload/preview` or `/api/upload`. Debug mode saves masked extracted PDF text to a temp file, logs masked line diagnostics, and returns parser diagnostics when no transaction rows match. It does not use OCR and must not be used to log raw bank statements.

---

## Privacy & Security

- Uploads are accepted only for CSV, XLSX, XLS, and PDF files after extension, MIME, and file-signature validation
- Uploaded files are written to the ignored `.local/uploads` directory and **deleted immediately** after parsing
- Upload endpoints are rate-limited and capped at **20 MB** per file
- API JSON and URL-encoded request bodies have explicit size limits
- IBAN numbers, 16-digit card numbers, and long account numbers are **masked (`****`)** before being stored
- PDF debug output is masked before it is written or logged
- No data is sent to any third-party service
- Current authentication is local-development only. Add authentication and per-user authorization before hosted production use.

See also:

- `docs/ARCHITECTURE.md`
- `docs/SECURITY_AUDIT.md`

---

## Sample Data

`attached_assets/sample-statement.csv` — 3 months of realistic UK bank transactions covering all 12 categories.

You can also generate 6 months of realistic demo data without uploading anything: **Settings → Load Demo Data**.

---

## License

MIT

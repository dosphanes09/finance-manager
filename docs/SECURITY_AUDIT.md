# FinanceAnalyzerPro Security Audit

This audit was performed against the local codebase before Phase 3 hardening. Status values are updated as fixes are implemented.

## Summary

The application is a local, single-user finance tracker with no authentication layer yet. The highest-risk areas are file upload handling, sensitive financial data handling, open CORS, unbounded request bodies, debug logging, unauthenticated destructive API routes, and future AI data handling. SQL injection risk is comparatively low because Drizzle parameterization and generated Zod validation are used throughout the route layer.

## Findings

| ID | Severity | Area | Affected files | Risk | Recommended fix | Implementation status |
|---|---|---|---|---|---|---|
| SEC-001 | High | Upload validation | `artifacts/api-server/src/routes/upload.ts`, `artifacts/api-server/src/lib/upload-security.ts` | Upload validation was extension-only. Client-provided filename could claim `.pdf`, `.csv`, `.xlsx`, or `.xls` while content was something else. | Validate both extension and MIME metadata, then verify file magic/content after saving and before parsing. | Implemented in Phase 3 |
| SEC-002 | Medium | Upload file size / DoS | `routes/upload.ts`, `app.ts` | Multer had a 20 MB file limit, but JSON and URL-encoded request bodies were unbounded. Large confirm bodies could consume memory. | Keep a strict upload limit and add Express JSON/urlencoded body limits. | Implemented in Phase 3 |
| SEC-003 | Medium | Temporary files | `routes/upload.ts`, `.gitignore` | Uploads were written under `artifacts/api-server/uploads`, which was not explicitly ignored. Names were timestamp-based. Cleanup was attempted after parse. | Move uploads to ignored `.local/uploads`, use random UUID names, and ensure cleanup only targets the upload directory. | Implemented in Phase 3 |
| SEC-004 | High | Sensitive logging | `lib/parsers.ts`, `routes/upload.ts` | PDF debug mode logged the first 100 extracted lines. These lines could include names, statement metadata, account references, card references, and transaction descriptions. | Mask debug log lines and diagnostics. Do not log raw statement contents. | Implemented in Phase 3 |
| SEC-005 | High | Sensitive data storage | `routes/upload.ts`, `lib/upload-security.ts`, `statement-parsers/text-utils.ts` | Parser paths mask descriptions, but `/upload/confirm` trusted client-provided preview rows. A direct API caller could send unmasked descriptions to be saved. | Mask merchant and description fields server-side immediately before insert. | Implemented in Phase 3 |
| SEC-006 | Medium | Unsafe parser libraries | `lib/parsers.ts`, `package.json`, `lib/upload-security.ts` | PDF and spreadsheet parsers process attacker-controlled binary content. Malformed files can trigger parser bugs or CPU/memory pressure. | Validate content type/magic first, keep dependency versions current, limit size, and avoid logging raw parser output. | Partially implemented in Phase 3; dependency monitoring remains |
| SEC-007 | Medium | API error leakage | `app.ts`, route files | Express default error handling could return HTML stack traces for malformed JSON, Multer errors, or unhandled exceptions. Some route errors returned internal messages. | Add centralized JSON error handler with sanitized messages and no stack traces. | Implemented in Phase 3 |
| SEC-008 | High | Missing authentication | All API routes | Any process/browser that can reach the API can read, mutate, upload, or delete financial data. | Add authentication before production. For local-only mode, bind API carefully and document risk. | Open; not in current Phase 3 priority scope |
| SEC-009 | High | Missing authorization / tenancy | All API routes and DB schema | There is no user/account id, so multi-user deployment would expose all data to all users. | Add users, ownership columns, and authorization checks before hosted deployment. | Open; future architecture work |
| SEC-010 | Medium | CORS | `app.ts` | `cors()` allowed any origin. In a browser, a malicious local page could call local APIs if reachable. | Restrict CORS to configured origins, with localhost defaults for development. | Implemented in Phase 3 |
| SEC-011 | Medium | Rate limiting | `routes/upload.ts` | Upload endpoints can be spammed locally or in a deployment, causing parser CPU/memory pressure. | Add basic rate limiting to upload routes. | Implemented in Phase 3 |
| SEC-012 | Medium | Health endpoint metadata | `routes/health.ts`, `lib/db/src/index.ts` | `/health/db` redacts password, but still exposes database host, database name, DB user, and table names. Useful locally; sensitive in production. | Keep password redacted, avoid raw errors, and restrict or reduce in production. | Partially implemented in Phase 3; production access control remains |
| SEC-013 | Low | SQL injection | Route files | Most queries use Drizzle helpers and tagged SQL. Search/filter values are interpolated through Drizzle parameterization. | Continue using Drizzle parameterization; avoid raw string-built SQL. | Implemented |
| SEC-014 | Medium | Transaction integrity | `routes/upload.ts`, `routes/rules.ts` | Multi-row saves and rule applications are not wrapped in explicit DB transactions. Partial updates are possible if a later query fails. | Use Drizzle transactions for multi-step operations before production. | Open; not in current Phase 3 priority scope |
| SEC-015 | Medium | Destructive API | `routes/demo.ts`, `pages/settings.tsx` | UI has a confirmation dialog for delete-all-data, but the API route itself has no auth or confirmation token. | Keep UI confirmation and add auth/CSRF or a confirmation challenge for production. | UI implemented; API hardening open |
| SEC-016 | Low | Frontend XSS | Frontend pages | Transaction descriptions are rendered as React text nodes, which are escaped. The only `dangerouslySetInnerHTML` is chart CSS from local config. | Continue avoiding raw HTML rendering of transaction fields. Validate chart config inputs if user-controlled in future. | Implemented |
| SEC-017 | Low | Client-side trust | `pages/upload.tsx`, `routes/upload.ts` | Preview rows can be edited client-side and submitted to `/upload/confirm`. Without server-side sanitization, client can bypass parser masking and category assumptions. | Treat confirm payload as untrusted; validate and mask again before insert. | Implemented in Phase 3 |
| SEC-018 | Low | Environment secrets | `.gitignore`, `.env.example`, `README.md` | Root `.env` and `.local` are ignored. `artifacts/api-server/uploads` was not ignored. README shows example credentials but no real secrets. | Add upload temp directories to `.gitignore`; never commit `.env` or local DB data. | Implemented in Phase 3 |
| SEC-019 | Medium | Privacy retention | `routes/upload.ts`, `routes/demo.ts`, `pages/settings.tsx` | Structured financial data is retained indefinitely until delete-all-data. Raw uploaded files are deleted after parsing. Export CSV can expose sensitive transaction data to local disk. | Explain retention clearly, keep delete flow, mask before storage, and keep raw files temporary. | Partially implemented in Phase 3; retention policy/auth remains |
| SEC-020 | Medium | AI readiness | Future AI routes | Future AI features could send raw PDFs/descriptions, IBANs, card numbers, or prompt-injection text to an external model. | Never send raw PDFs; anonymize transaction text; strip IBAN/card/account numbers; validate AI output; add rate/cost limits. | Open; future AI work |

## File Upload Security

Current Phase 3 behavior:

- Extensions allowed: `.csv`, `.xlsx`, `.xls`, `.pdf`.
- File size limit: 20 MB via Multer.
- MIME validation: implemented by extension-specific allowlists.
- Content signature validation: implemented for PDF, XLSX, XLS, and likely-text CSV content.
- Path traversal: low risk because Multer uses server-generated UUID filenames and cleanup verifies the upload directory.
- Temporary cleanup: present in `finally` for parsed upload routes.
- Unsafe parser risk: reduced by metadata/content validation, size limits, and rate limiting.
- DoS risk: reduced by upload limits, request body limits, and basic upload rate limiting.

## Sensitive Financial Data

Sensitive data classes:

- card numbers
- IBANs
- customer/account numbers
- personal names and statement metadata
- transaction descriptions
- merchant names and salary signals

Masking exists in parser text utilities and Phase 3 now masks merchant and description fields again immediately before database insertion because API clients are untrusted.

## Database Security

SQL injection risk is low because Drizzle helpers and tagged SQL are used. The main remaining database risks are:

- no auth or per-user ownership
- no explicit transactions for multi-step rule/import operations
- local `drizzle push` is acceptable for development but production needs generated migrations
- DB health metadata should remain local-only or protected in production

## API Security

Main gaps:

- no authentication
- no authorization
- missing authentication
- missing authorization
- production access controls for health/destructive endpoints
- no explicit DB transactions for multi-step imports/rule applications

## Frontend Security

The frontend mostly relies on React escaping. It does not use localStorage/sessionStorage for financial data. CSV export creates an in-memory object URL and revokes it after click. Client-side validations and UI confirmations should be treated only as UX; server-side controls are still required.

## Environment and Configuration

`.env`, `.local`, and legacy upload temp output are ignored by git. The root `.env.example` contains placeholders only. The DB health endpoint redacts the password and no longer returns raw driver messages on failure. Production deployment still needs stricter environment validation, authentication, and migration workflow.

## Privacy

Raw uploaded files are deleted after parsing. Parsed structured data remains in PostgreSQL until explicitly deleted. The Settings page explains local storage, masking, and delete-all-data behavior. Export CSV transfers the user's financial data to a downloaded file controlled by the browser.

## AI Readiness

AI is not currently used. Before adding AI:

- do not send raw PDFs to AI
- anonymize and mask descriptions before model calls
- remove IBAN/card/account/customer numbers
- treat transaction descriptions as untrusted prompt-injection content
- constrain AI output to validated schemas
- log only request metadata, not raw financial text
- enforce user consent and rate/cost limits

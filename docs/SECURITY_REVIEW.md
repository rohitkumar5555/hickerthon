# Security & Data Integrity Review

## Secret & API Key Isolation

- Only `process.env.GEMINI_API_KEY` (managed server-side by AI Studio) is used by the backend (`server/gemini.ts` and `server/routes.ts`). It is never bundled into Vite client code or returned by `/api/health`.
- Zero external configuration secrets are required (`GOOGLE_MAPS_API_KEY`, `FIREBASE_*`, `SESSION_SECRET`, `GEMINI_MODEL`, and `ENABLE_EVALUATOR_DEMO` are completely removed).
- Sliding-window in-memory rate limiting protects AI-invoking endpoints (`/api/ingest/ai-parse`, `/api/briefings/generate`, `/api/advisories/generate`).

## Local-Device Workspace & Role Boundaries

- **Truthful Local Persistence Model**: All operational tables (`batches`, `readings`, `briefings`, `advisories`, `actionTasks`, `alerts`, `alertRecipients`, `auditLogs`) persist locally in the user's browser via **IndexedDB (Dexie)** inside explicit `db.transaction('rw', ...)` ACID blocks with foreign-key checks. This is explicitly labelled as a local-device workspace rather than multi-user cloud storage.
- **Operating Role Selector & Guardrails**: Role actions (e.g., municipal field resource dispatch in `POST /api/radar/optimize`, row deletion, task approval scope, alert scope approval, and Evaluator QA diagnostics) check `activeRole` consistently on both client transactions and stateless server routes, returning `403` when an unauthorized role attempts privileged dispatch. Every role selection or switch is recorded in the local IndexedDB `auditLogs` table.

## Input Sanitization & Data Provenance

- **XSS Neutralization**: `sanitizeText()` runs on both client (`src/utils/civicMath.ts`) and server (`server/analytics.ts`), stripping `<script>` blocks, `javascript:` URIs, inline `on*=` attributes, and escaping angle brackets before persisting pasted cells, review notes, orders, or titles.
- **Zod Validation**: All JSON API request and Gemini response payloads are validated against strict Zod schemas (`src/types/civic.ts`, `server/gemini.ts`).
- **Immutable Raw Cells**: `ReadingRecord.exactRawCells` is never overwritten during human overrides (`reviewReadingTransaction`), while `reviewHistory` appends field, old/new values, justification reason, `actorRole`, and ISO timestamp.

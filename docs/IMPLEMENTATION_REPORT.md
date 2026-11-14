# Implementation Report — Civic Air Quality Briefing Studio

## Stack & Zero-Config Integrations

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4 (`@tailwindcss/vite`), Lucide Icons, `dexie` (IndexedDB), and `leaflet` (OpenStreetMap zero-key GIS mapping).
- **Backend**: Stateless Express 4 (`server.ts`, `server/routes.ts`) serving `/api/*` normalization, AQI, optimization, Gemini, and QA routes alongside Vite middleware on port 3000.
- **Generative AI (`@google/genai`)**: Server-side `gemini-2.5-flash` calls (`server/gemini.ts`) using `User-Agent: 'aistudio-build'`, structured JSON schemas + Zod validation, latency/request telemetry, sanitized prompt payload inspection, and `[Row #N]` citation verification. No canned AI fallbacks exist; if `GEMINI_API_KEY` is unavailable, clear error states are surfaced.
- **Zero-Key Civic GIS Map (`src/pages/MapPage.tsx`)**: Direct `leaflet` + OpenStreetMap tile rendering without API keys. Plots markers solely from verified numeric latitude/longitude coordinates present in imported data; displays `"No verified coordinates in this import; evidence list is available below."` when missing.
- **Local-Device Persistence (`src/db/civicDexie.ts`)**: Browser IndexedDB store via Dexie (`CivicAirQualityStudioDB`) using explicit `rw` ACID transactions, foreign-key validation, immutable raw cell preservation, and local audit logging.

## Domain-Specific Engineering Controls

1. **Zero-Fake Operational Guarantee**: Empty workspaces yield `0` counts across Command Center, Map, Radar, Briefings, Advisories, Tasks, and Alerts.
2. **Scientific Guardrails**:
   - Missing pollutant cells never receive guessed AQI values (`AQI unavailable from supplied data`).
   - Unparameterized `ppm`/`ppb` values are flagged `CONVERSION_UNAVAILABLE` rather than guessing ambient temperature/pressure.
   - `PM2.5 > PM10`, negative readings, extreme spikes (`PM2.5 > 1500` or `PM10 > 2500`), and duplicate rows are auto-excluded from averages while remaining inspectable.
   - Fine-smoke episodes (`PM2.5/PM10 >= 0.68` and `PM2.5 >= 120 µg/m³`) automatically skip water misting in the constrained resource optimizer (`optimizeFieldResources`).
3. **Truthful Governance & Alert Preparation**: Subordinate field orders and targeted zone alerts require authorized role approval. Approved alerts transition to `APPROVED_PREPARED` (`Prepared for targeted recipients`) with `[Copy Approved Alert]` rather than making false automated SMS/WhatsApp delivery claims.

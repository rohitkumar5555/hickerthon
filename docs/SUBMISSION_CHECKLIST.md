# Submission Checklist

- [x] Zero manual configuration required (only server-side managed `GEMINI_API_KEY`, hardcoded `gemini-2.5-flash`)
- [x] Zero static/hardcoded AQI metrics, alerts, forecasts, or canned AI fallbacks
- [x] Server-side `@google/genai` (`gemini-2.5-flash`) integration with Zod validation & `[Row #N]` citation verification
- [x] Messy multi-delimiter & multi-format parser (`.csv`, `.tsv`, `.json`, `.xlsx`, Markdown pipes, pasted text)
- [x] Unit normalization (`mg/m³` ↔ `µg/m³`) + `CONVERSION_UNAVAILABLE` guardrail on `ppm`/`ppb`
- [x] Forensic auditing (`PM2.5 > PM10`, negative values, outliers, duplicates, sharp-drop verification) + immutable `exactRawCells`
- [x] Constrained field resource optimizer with fine-smoke water-misting contraindication
- [x] Truthful local **Operating Role** demo session (`EVALUATOR`, `WARD_OFFICER`, `HOUSING_SOCIETY`, `SCHOOL_COORDINATOR`) with Switch Role audit logging and server/client role boundary checks
- [x] Browser IndexedDB (Dexie) transactional persistence labelled honestly as a local-device workspace
- [x] Zero-key Leaflet + OpenStreetMap evidence map plotting only verified imported coordinates (never inventing coordinates)
- [x] Truthful targeted zone alert preparation (`Prepared for targeted recipients` + `[Copy Approved Alert]`)
- [x] Multilingual & reading-level Citizen Advisories with Children / Older Adults / Sensitive Groups guidance & Web Speech API TTS
- [x] Isolated QA self-check suite (`/qa-evaluator`) & `[Wipe Local Workspace]` true 0-state reset
- [x] Unit & HTTP integration tests (`npm test`), TypeScript lint (`npm run lint`), and production build (`npm run build`)
- [ ] Demo video recorded and URL entered in `docs/DEMO_VIDEO_SCRIPT.md`

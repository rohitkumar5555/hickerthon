# Civic Air Quality Briefing Studio

An evidence-traceable civic intelligence workbench enabling municipal ward officers, housing society (RWA) estate managers, and school health coordinators to convert messy air quality tables into verified local briefings, targeted zone alerts, human-approved field orders, and multilingual citizen advisories.

## Zero-Manual-Config Architecture

The studio runs out-of-the-box with **zero manual environment configuration**:
- **No external database, auth, or map keys required**: Uses browser **IndexedDB (Dexie)** with ACID transactions for local-device workspace persistence and **Leaflet + OpenStreetMap** tiles for zero-key mapping.
- **Server-Side Managed Gemini AI**: Uses only AI Studio's server-side `process.env.GEMINI_API_KEY` (`gemini-2.5-flash` hardcoded on the Express backend) with zero canned fallbacks.
- **Truthful Operating Role Session**: Choose `Evaluator`, `Ward Officer`, `Housing Society`, or `School Coordinator` in the local role picker or switch roles anytime in the header (every role switch is recorded in the local IndexedDB audit log).

## Key Capabilities

- **Messy Data Ingestion & Forensic Audit (`/ingest`)**: Parses pasted WhatsApp/Excel/CSV/TSV/Markdown/JSON tables and uploaded `.csv`, `.tsv`, `.json`, and `.xlsx` files. Normalizes mixed units (`mg/m³` -> `µg/m³`, `µg/m³` -> `mg/m³` for CO), refuses unsafe unparameterized `ppm`/`ppb` conversions (`CONVERSION_UNAVAILABLE`), detects `PM2.5 > PM10`, negative values, extreme outliers, duplicates, and abrupt drops requiring field verification, and preserves immutable `exactRawCells` even when humans override values.
- **CPCB NAQI & Past–Present–Projection Radar (`/radar`)**: Computes Indian CPCB NAQI sub-indices strictly from valid eligible rows (refusing to invent AQI when pollutant fields are missing), tracks period-over-period AQI deltas, damped 24-hour trajectory projections, safe outdoor / classroom window clocks, and a constrained field resource optimizer enforcing fine-smoke water-misting contraindications (`PM2.5/PM10 >= 0.68` and `PM2.5 >= 120 µg/m³`).
- **Zero-Key Leaflet Evidence Map & Targeted Alert Preparation (`/map`)**: Plots markers **only** when imported rows carry verified numeric latitude/longitude coordinates (displaying *"No verified coordinates in this import; evidence list is available below."* when none exist — never inventing coordinates). Clicking any marker opens its `[Row #N]` **Source Evidence X-Ray** drawer. Targeted zone alerts are approved and marked *"Prepared for targeted recipients"* with `[Copy Approved Alert]` (no fabricated SMS/WhatsApp delivery claims).
- **Traceable Gemini AI Briefing Studio (`/briefing-studio`)**: Calls `@google/genai` (`gemini-2.5-flash`) strictly on the Express backend with Zod validation and `[Row #N]` citation verification.
- **Multilingual & Multi-Reading-Level Citizen Advisories (`/citizen-advisory`)**: Generates plain-language notices across `English`, `Hindi (हिन्दी)`, `Hinglish`, `Marathi (मराठी)`, `Tamil (தமிழ்)`, and `Bengali (বাংলা)` at 3 reading levels with dedicated care sections for children/infants, older adults (60+), and asthma/sensitive groups, WhatsApp copy, print poster mode, and Web Speech API (`window.speechSynthesis`) readout.
- **Action Board & Proof of Execution (`/tasks`)**: Tracks human-approved official orders, subordinate dispatch, cross-role spillover escalations, completion proof, and Before-vs-After Observed Outcome Scorecards.
- **Evaluator Self-Check & Local Workspace Reset (`/qa-evaluator`)**: Runs an isolated 12-point server-side self-check suite and provides `[Wipe Local Workspace]` to reset IndexedDB operational tables cleanly to `0`.

## Local Development & Verification

```bash
npm install
npm run dev        # Starts Express + Vite middleware on http://localhost:3000
npm run lint       # TypeScript type-check (tsc --noEmit)
npm test           # Vitest unit & HTTP integration tests
npm run build      # Production Vite + esbuild server bundle
npm start          # Runs bundled production server (node server.js)
```

## Documentation Index

- [Evaluator Guide](docs/EVALUATOR_GUIDE.md)
- [Implementation Report](docs/IMPLEMENTATION_REPORT.md)
- [Test Report](docs/TEST_REPORT.md)
- [Security Review](docs/SECURITY_REVIEW.md)
- [Accessibility Review](docs/ACCESSIBILITY_REVIEW.md)
- [Demo Video Script](docs/DEMO_VIDEO_SCRIPT.md)
- [Submission Checklist](docs/SUBMISSION_CHECKLIST.md)

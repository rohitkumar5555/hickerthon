# Demo Video Script (2-Minute Walkthrough)

- **Video URL:** `_______________` *(Insert recorded demo link before final submission)*

## Scene-by-Scene Script

1. **0:00–0:20 — Operating Role Selector & True 0-State (`/`, `/command-center`)**
   - Show the **Choose Operating Role** screen (zero keys/configs required) and click **Enter as EVALUATOR**.
   - Show the empty local workspace confirming all KPIs start at `0` with no synthetic telemetry.

2. **0:20–0:50 — Messy Ingestion & Forensic Audit (`/ingest`)**
   - Load labelled `Fixture 1 (Baseline Period)` (`TEST FIXTURE — NOT LIVE AIR-QUALITY DATA`) and commit to IndexedDB.
   - Load `Fixture 2 (Current Messy Period)` showing mixed `mg/m³`/`µg/m³` units, `0.045 ppm` (`CONVERSION_UNAVAILABLE`), `PM2.5 > PM10`, outlier `9999`, and duplicate detection.
   - Override one row inline and open **Source Evidence X-Ray** (`Row #N`) to prove `exactRawCells` stay immutable while `reviewHistory` logs the edit.

3. **0:50–1:15 — Radar, Resource Policy & Zero-Key Leaflet Map (`/radar`, `/map`)**
   - Show Past–Present–24h Projection delta and safe outdoor/classroom window clock.
   - Run the Constrained Resource Optimizer and highlight why Water Sprinklers are skipped on fine-smoke school zones.
   - Open `/map` to show zero-key Leaflet OpenStreetMap coordinate markers, click a marker to inspect its `Row #N` drawer, approve a targeted alert (`Prepared for targeted recipients`), and click `[Copy Approved Alert]`.

4. **1:15–1:45 — Traceable Gemini Briefing & Multilingual Citizen Advisory (`/briefing-studio`, `/citizen-advisory`)**
   - Generate a Ward Officer or School Coordinator briefing via `gemini-2.5-flash`, inspect latency telemetry and `[View Grounded Prompt Payload]`, click a `Row #N` citation chip, approve a subordinate draft, and send a cross-role escalation.
   - Generate a Hindi/Hinglish Citizen Advisory at `Child-Friendly School Story` reading level and trigger `[Listen]`.

5. **1:45–2:00 — Action Proof, QA Self-Check & Local 0-State Reset (`/tasks`, `/qa-evaluator`)**
   - Complete an order on `/tasks` with proof notes.
   - Open `/qa-evaluator`, use **Switch Role** audit trail inspection, run the non-destructive 12-point self-check suite, and demonstrate `[Wipe Local Workspace]` returning local metrics cleanly to `0`.

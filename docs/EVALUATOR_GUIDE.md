# Evaluator Walkthrough Guide

## Zero-Config Operating Role Selector

On the initial **Choose Operating Role** screen (no passwords, session secrets, Firebase credentials, or Google Maps keys needed), select any local demo-role session:

| Role | Display Name | Primary Capabilities |
| :--- | :--- | :--- |
| `EVALUATOR` | QA Evaluator | Full workspace access, Persona Lens Switcher, QA Self-Check, Local Audit Logs, `[Wipe Local Workspace]` |
| `WARD_OFFICER` | Ward Officer | Full ward ingestion, resource dispatch optimization, alert preparation approval, ward orders |
| `HOUSING_SOCIETY` | Housing Society (RWA) | RWA brief & guard checks, senior park guidance, spillover escalations to Ward Officer |
| `SCHOOL_COORDINATOR` | School Coordinator | Classroom ventilation clock, principal directives, upwind escalation to Ward/RWA |

All data is persisted locally in this browser via **IndexedDB (Dexie ACID transactions)** — explicitly a local-device workspace, not multi-user cloud authentication. You can switch operating roles anytime via the header **Switch Role** control; every switch is logged in the local audit log.

## Recommended 5-Minute Evaluation Flow

1. **Verify True 0-State**: Enter as **EVALUATOR**; confirm empty workspace displays `0` metrics and no fabricated AQI or alerts.
2. **Load Baseline Fixture**: Open **Data Ingestion Studio**, click **Fixture 1 (Baseline Period)** (`TEST FIXTURE — NOT LIVE AIR-QUALITY DATA`), inspect normalized rows, and click **Commit Verified Batch**.
3. **Load Messy Current Fixture**: Click **Fixture 2 (Current Messy Period)** to inspect mixed `mg/m³`/`µg/m³` conversions, `0.045 ppm` (`CONVERSION_UNAVAILABLE`), `PM2.5 > PM10` exclusion, outlier `9999` exclusion, and duplicate detection. Commit the batch.
4. **Test Inline Reading Review**: Edit or exclude a flagged row in the Ingestion table; click its `Row #N` badge to confirm `exactRawCells` remained immutable and `reviewHistory` recorded your reason.
5. **Inspect Zero-Key Leaflet Evidence Map & Radar**:
   - Open `/map` to view verified imported coordinates plotted via Leaflet + OpenStreetMap (or test a coordinate-free import to see `"No verified coordinates in this import; evidence list is available below."`). Click any marker to open its `Row #N` Evidence X-Ray drawer, approve a zone alert (`Prepared for targeted recipients`), and use `[Copy Approved Alert]`.
   - Open `/radar` for 24-hour projection trajectory, safe outdoor/classroom window clock, and the Resource Optimizer skipping water sprinklers on fine-smoke school zones.
6. **Generate Real Gemini Briefing & Multilingual Advisory**:
   - In `/briefing-studio`, compare Current Messy against Baseline (`[Generate Traceable AI Civic Briefing]`). Inspect latency telemetry, `[View Grounded Prompt Payload]`, approve a subordinate draft, and send a cross-role escalation.
   - In `/citizen-advisory`, generate a `Hindi (हिन्दी)` or `Hinglish` advisory at `Child-Friendly School Story` level, test `[Listen]`, and copy WhatsApp text.
7. **Run QA Self-Check & Local 0-State Wipe**: On `/qa-evaluator`, run `[Run Operational Self-Check Suite]` (non-destructive) and finally test `[Wipe Local Workspace]` to confirm all local IndexedDB operational tables return to `0`.

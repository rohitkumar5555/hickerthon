# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e.spec.ts >> Civic Air Quality Briefing Studio Full End-to-End Flow >> role -> baseline fixture -> parse -> messy dataset -> review -> real Gemini brief -> Row citation -> advisory -> task approve/complete -> targeted alert -> QA -> wipe
- Location: tests/e2e.spec.ts:4:3

# Error details

```
Error: locator.click: Error: strict mode violation: getByRole('button', { name: /^Citizen Advisory$/i }) resolved to 2 elements:
    1) <button type="button" class="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors text-left whitespace-nowrap text-slate-700 hover:bg-slate-100 hover:text-slate-900 border border-transparent">…</button> aka getByRole('navigation', { name: 'Primary Workspace Navigation' }).getByRole('button', { name: 'Citizen Advisory' })
    2) <button type="button" class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800">…</button> aka locator('#main-content').getByRole('button', { name: 'Citizen Advisory' })

Call log:
  - waiting for getByRole('button', { name: /^Citizen Advisory$/i })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - link "Skip to main content" [ref=e4] [cursor=pointer]:
    - /url: "#main-content"
  - complementary [ref=e5]:
    - button "Civic Air Quality Briefing Studio" [ref=e7]:
      - generic [ref=e8]: Civic Air Quality
      - generic [ref=e9]: Briefing Studio
    - navigation "Primary Workspace Navigation" [ref=e10]:
      - button "Command Center" [ref=e11]
      - button "Data Ingestion" [ref=e18]
      - button "Evidence Map & Alerts" [ref=e23]
      - button "Radar & Resources" [ref=e28]
      - button "Briefing Studio" [ref=e32]
      - button "Citizen Advisory" [ref=e37]
      - button "Action Board" [ref=e42]
      - button "Evaluator QA & Audit" [ref=e48]
    - generic [ref=e53]:
      - generic [ref=e54]: Evaluator (Full Studio & QA)
      - generic [ref=e55]: Civic Studio Local Evaluation Workspace · All Wards
  - generic [ref=e56]:
    - banner [ref=e57]:
      - generic [ref=e58]: All Wards/Briefing Studio
      - generic [ref=e60]:
        - generic [ref=e61]:
          - generic [ref=e62]: "Role:"
          - combobox "Role:" [ref=e63]:
            - option "Evaluator (Full Studio & QA)" [selected]
            - option "Ward Officer (Municipal Authority)"
            - option "Housing Society (RWA / Estate)"
            - option "School Coordinator (Principal / Health)"
        - generic [ref=e64]:
          - generic [ref=e65]: "View:"
          - combobox "View:" [ref=e66]:
            - option "Ward Officer" [selected]
            - option "Housing Society (RWA)"
            - option "School Coordinator"
        - button "Role Picker" [ref=e67]
    - status [ref=e75]:
      - generic [ref=e76]: Action approved & dispatched.
      - button "Dismiss notification" [ref=e81]
    - main [ref=e85]:
      - generic [ref=e86]:
        - generic [ref=e87]:
          - heading "Briefing Studio" [level=1] [ref=e88]
          - generic [ref=e89]:
            - button "Hide Internal Brief" [ref=e90]
            - button "Citizen Advisory" [ref=e95]
        - region "Briefing Generator" [ref=e100]:
          - generic [ref=e101]:
            - generic [ref=e102]:
              - generic [ref=e103]: Dataset
              - combobox "Dataset" [ref=e104]:
                - option "Current Messy Period — Mixed Units, Anomalies & Hotspot Shift (Test Fixture) (11 rows)" [selected]
                - option "Baseline Period — Ward 14, Ward 7, Greenpark RWA & Sunrise School (Test Fixture) (8 rows)"
            - generic [ref=e105]:
              - generic [ref=e106]: Audience Role
              - combobox "Audience Role" [ref=e107]:
                - option "Ward Officer" [selected]
                - option "Housing Society (RWA)"
                - option "School Coordinator"
            - generic [ref=e108]:
              - generic [ref=e109]: Compare Previous Brief
              - combobox "Compare Previous Brief" [ref=e110]:
                - option "Auto / Baseline" [selected]
                - option "BRF-2026-1067 · WARD OFFICER"
                - option "BRF-2026-6036 · WARD OFFICER"
            - button "Analyze with Gemini AI" [ref=e112]
          - generic [ref=e117]:
            - generic [ref=e118]: "Briefs:"
            - button "BRF-2026-1067 · WARD" [ref=e119]
            - button "BRF-2026-6036 · WARD" [ref=e120]
        - generic [ref=e121]:
          - generic [ref=e122]:
            - region "Data quality summary" [ref=e123]:
              - generic [ref=e124]:
                - heading "Data Quality" [level=3] [ref=e128]
                - generic [ref=e129]: 91% completeness
              - generic [ref=e130]:
                - generic [ref=e131]:
                  - generic [ref=e132]: Valid rows
                  - generic [ref=e133]: "8"
                - generic [ref=e134]:
                  - generic [ref=e135]: Missing data
                  - generic [ref=e136]: "1"
                - generic [ref=e137]:
                  - generic [ref=e138]: Unit conversions
                  - generic [ref=e139]: "4"
                - generic [ref=e140]:
                  - generic [ref=e141]: Unreliable rows
                  - generic [ref=e142]: "4"
              - generic [ref=e143]:
                - generic [ref=e144]: "Flagged rows requiring attention:"
                - list [ref=e145]:
                  - listitem [ref=e146]:
                    - generic [ref=e147]:
                      - generic [ref=e148]: "Senior Citizens Park Sector B:"
                      - text: Missing PM2.5 reading
                    - 'button "Row #4" [ref=e149]'
                  - listitem [ref=e156]:
                    - generic [ref=e157]:
                      - generic [ref=e158]: "Ward 7 Market Junction:"
                      - text: Exact/near duplicate reading row
                    - 'button "Row #6" [ref=e159]'
                  - listitem [ref=e166]:
                    - generic [ref=e167]:
                      - generic [ref=e168]: "Lotus Enclave Housing Society:"
                      - text: "Inconsistent measurement: PM2.5 (185 µg/m³) exceeds PM10 (140 µg/m³)"
                    - 'button "Row #7" [ref=e169]'
                  - listitem [ref=e176]:
                    - generic [ref=e177]:
                      - generic [ref=e178]: "Ward 7 South Sensor Node:"
                      - text: Extreme outlier requiring field verification (> threshold)
                    - 'button "Row #8" [ref=e179]'
                  - listitem [ref=e186]:
                    - generic [ref=e187]:
                      - generic [ref=e188]: "Civic General Hospital Wing:"
                      - text: NO2 conversion unavailable (0.045 ppm)
                    - 'button "Row #11" [ref=e189]'
            - region "Evidence rows" [ref=e196]:
              - heading "Evidence Rows (11)" [level=2] [ref=e197]
              - generic [ref=e198]:
                - generic [ref=e199]:
                  - generic [ref=e200]:
                    - generic [ref=e201]: Ward 14 Metro Construction Gate
                    - generic [ref=e202]: "PM2.5: 88 · PM10: 228"
                  - generic [ref=e203]:
                    - generic [ref=e204]:
                      - generic [ref=e208]: AQI 193
                      - generic [aria-hidden] [ref=e209]: ·
                      - generic [ref=e210]: Moderate Watch
                    - 'button "Row #1" [ref=e211]'
                - generic [ref=e218]:
                  - generic [ref=e219]:
                    - generic [ref=e220]: Sunrise Public School Courtyard
                    - generic [ref=e221]: "PM2.5: 148 · PM10: 195"
                  - generic [ref=e222]:
                    - generic [ref=e223]:
                      - generic [ref=e226]: AQI 322
                      - generic [aria-hidden] [ref=e227]: ·
                      - generic [ref=e228]: Red Zone Emergency
                    - 'button "Row #2" [ref=e229]'
                - generic [ref=e236]:
                  - generic [ref=e237]:
                    - generic [ref=e238]: Greenpark Residency Gate 2
                    - generic [ref=e239]: "PM2.5: 124 · PM10: 162"
                  - generic [ref=e240]:
                    - generic [ref=e241]:
                      - generic [ref=e244]: AQI 303
                      - generic [aria-hidden] [ref=e245]: ·
                      - generic [ref=e246]: Red Zone Emergency
                    - 'button "Row #3" [ref=e247]'
                - generic [ref=e254]:
                  - generic [ref=e255]:
                    - generic [ref=e256]: Senior Citizens Park Sector B
                    - generic [ref=e257]: "PM2.5: N/A · PM10: 184"
                  - generic [ref=e258]:
                    - generic [ref=e259]:
                      - generic [ref=e263]: AQI 156
                      - generic [aria-hidden] [ref=e264]: ·
                      - generic [ref=e265]: Moderate Watch
                    - 'button "Row #4" [ref=e266]'
                - generic [ref=e273]:
                  - generic [ref=e274]:
                    - generic [ref=e275]: Ward 7 Market Junction
                    - generic [ref=e276]: "PM2.5: 168 · PM10: 342"
                  - generic [ref=e277]:
                    - generic [ref=e278]:
                      - generic [ref=e281]: AQI 337
                      - generic [aria-hidden] [ref=e282]: ·
                      - generic [ref=e283]: Red Zone Emergency
                    - 'button "Row #5" [ref=e284]'
                - generic [ref=e291]:
                  - generic [ref=e292]:
                    - generic [ref=e293]: Ward 7 Market Junction
                    - generic [ref=e294]: "PM2.5: 168 · PM10: 342"
                  - generic [ref=e295]:
                    - generic [ref=e296]:
                      - generic [ref=e299]: AQI 337
                      - generic [aria-hidden] [ref=e300]: ·
                      - generic [ref=e301]: Red Zone Emergency
                    - 'button "Row #6" [ref=e302]'
                - generic [ref=e309]:
                  - generic [ref=e310]:
                    - generic [ref=e311]: Lotus Enclave Housing Society
                    - generic [ref=e312]: "PM2.5: 185 · PM10: 140"
                  - generic [ref=e313]:
                    - generic [ref=e314]:
                      - generic [ref=e317]: AQI 350
                      - generic [aria-hidden] [ref=e318]: ·
                      - generic [ref=e319]: Red Zone Emergency
                    - 'button "Row #7" [ref=e320]'
                - generic [ref=e327]:
                  - generic [ref=e328]:
                    - generic [ref=e329]: Ward 7 South Sensor Node
                    - generic [ref=e330]: "PM2.5: 9999 · PM10: 410"
                  - generic [ref=e331]:
                    - generic [ref=e332]:
                      - generic [ref=e335]: AQI 500
                      - generic [aria-hidden] [ref=e336]: ·
                      - generic [ref=e337]: Red Zone Emergency
                    - 'button "Row #8" [ref=e338]'
                - generic [ref=e345]:
                  - generic [ref=e346]:
                    - generic [ref=e347]: St. Xavier Primary Campus
                    - generic [ref=e348]: "PM2.5: 118 · PM10: 168"
                  - generic [ref=e349]:
                    - generic [ref=e350]:
                      - generic [ref=e353]: AQI 293
                      - generic [aria-hidden] [ref=e354]: ·
                      - generic [ref=e355]: Poor Warning
                    - 'button "Row #9" [ref=e356]'
                - generic [ref=e363]:
                  - generic [ref=e364]:
                    - generic [ref=e365]: Ward 14 East Curb Sensor
                    - generic [ref=e366]: "PM2.5: 36 · PM10: 42"
                  - generic [ref=e367]:
                    - generic [ref=e368]:
                      - generic [ref=e372]: AQI 108
                      - generic [aria-hidden] [ref=e373]: ·
                      - generic [ref=e374]: Moderate Watch
                    - 'button "Row #10" [ref=e375]'
                - generic [ref=e382]:
                  - generic [ref=e383]:
                    - generic [ref=e384]: Civic General Hospital Wing
                    - generic [ref=e385]: "PM2.5: 58 · PM10: 124"
                  - generic [ref=e386]:
                    - generic [ref=e387]:
                      - generic [ref=e391]: AQI 116
                      - generic [aria-hidden] [ref=e392]: ·
                      - generic [ref=e393]: Moderate Watch
                    - 'button "Row #11" [ref=e394]'
            - region "Previous versus current changes" [ref=e401]:
              - heading "Previous vs. Current Changes" [level=2] [ref=e402]
              - generic [ref=e403]:
                - generic [ref=e404]: "Baseline: BRF-2026-6036 · Overall AQI Delta: -1"
                - paragraph [ref=e405]: Compared to previous briefing BRF-2026-6036, Ward 14 Metro Construction Gate improved sharply from AQI 356 to 193 (requires verification), while Ward 7 Market Junction worsened from AQI 280 to 337 and Sunrise Public School Courtyard worsened from AQI 273 to 322.
                - generic [ref=e406]: "New hotspots: Greenpark Residency Gate 2, St. Xavier Primary Campus"
                - generic [ref=e407]: "Improved: Ward 14 Metro Construction Gate"
          - generic [ref=e408]:
            - generic [ref=e409]:
              - generic [ref=e410]:
                - generic [ref=e411]: BRF-2026-1067
                - generic [aria-hidden] [ref=e412]: ·
                - generic [ref=e413]: gemini-4-hydrogen
                - generic [aria-hidden] [ref=e414]: ·
                - generic [ref=e415]: 11/14/2026, 8:25:51 AM
                - generic [aria-hidden] [ref=e416]: ·
                - generic [ref=e417]: 23627 ms
                - generic [aria-hidden] [ref=e418]: ·
                - generic [ref=e419]: 11 cited rows
              - button "Prompt Payload" [ref=e420]
            - generic [ref=e426]:
              - heading "Role Briefing (WARD OFFICER)" [level=2] [ref=e427]
              - paragraph [ref=e428]: Air quality across Ward 7 and Ward 14 shows Very Poor conditions at Ward 7 Market Junction (AQI 337), Sunrise Public School Courtyard (AQI 322), and Greenpark Residency Gate 2 (AQI 303), with St. Xavier Primary Campus approaching the red zone (AQI 293). The safest outdoor window is 11:00–13:00, while peak danger is 09:00–11:00; four rows (6, 7, 8, and missing/unconverted fields in 4, 11) require data verification or exclusion.
              - list [ref=e429]:
                - listitem [ref=e430]:
                  - generic [ref=e431]: Ward 7 Market Junction recorded Very Poor air quality (AQI 337) with PM2.5 at 168 µg/m³ (unit-converted from 0.168 mg/m³) and NO2 at 112 µg/m³.
                  - 'button "Row #5" [ref=e433]'
                - listitem [ref=e440]:
                  - generic [ref=e441]: Sunrise Public School Courtyard (AQI 322, PM2.5 148 µg/m³, ratio 0.76) and Greenpark Residency Gate 2 (AQI 303, PM2.5 124 µg/m³, ratio 0.77) both triggered fine-smoke misting contraindication warnings.
                  - generic [ref=e442]:
                    - 'button "Row #2" [ref=e443]'
                    - 'button "Row #3" [ref=e450]'
                - listitem [ref=e457]:
                  - generic [ref=e458]: St. Xavier Primary Campus recorded Poor air quality (AQI 293, PM2.5 118 µg/m³), representing a +163 AQI increase from the previous period.
                  - 'button "Row #9" [ref=e460]'
                - listitem [ref=e467]:
                  - generic [ref=e468]: Ward 14 Metro Construction Gate improved to Moderate (AQI 193, PM2.5 88 µg/m³ unit-converted), while Ward 14 East Curb Sensor recorded Moderate AQI 108 with NO2 as dominant pollutant.
                  - generic [ref=e469]:
                    - 'button "Row #1" [ref=e470]'
                    - 'button "Row #10" [ref=e477]'
            - generic [ref=e484]:
              - generic [ref=e485]:
                - heading "Immediate Action (0–4h)" [level=3] [ref=e486]
                - generic [ref=e487]:
                  - generic [ref=e488]: Deploy Traffic Marshals & No-Idling Enforcement
                  - generic [ref=e489]: Ward 7 Market Junction · 0-4 hours
                  - paragraph [ref=e490]: Ward 7 Market Junction is at AQI 337 with a possible vehicular traffic idling / corridor congestion pattern.
                  - 'button "Row #5" [ref=e492]'
                - generic [ref=e499]:
                  - generic [ref=e500]: Waste-Burning Patrol Enforcement
                  - generic [ref=e501]: Sunrise Public School Courtyard & Greenpark Residency Gate 2 · 0-4 hours
                  - paragraph [ref=e502]: Sunrise Public School Courtyard (AQI 322) and Greenpark Residency Gate 2 (AQI 303) show possible fine-smoke / biomass combustion patterns.
                  - generic [ref=e503]:
                    - 'button "Row #2" [ref=e504]'
                    - 'button "Row #3" [ref=e511]'
                - generic [ref=e518]:
                  - generic [ref=e519]: Targeted Wet-Sweeping (Non-Contraindicated Zones Only)
                  - generic [ref=e520]: Ward 14 Metro Construction Gate · 0-4 hours
                  - paragraph [ref=e521]: Ward 14 Metro Construction Gate has coarse dust (ratio 0.39, AQI 193) where wet-sweeping is not contraindicated.
                  - 'button "Row #1" [ref=e523]'
              - generic [ref=e530]:
                - heading "Do-Not-Do Guardrails" [level=3] [ref=e531]
                - generic [ref=e535]:
                  - generic [ref=e536]: Do NOT deploy water misting or fogging at Sunrise Public School Courtyard or Greenpark Residency Gate 2.
                  - paragraph [ref=e537]: "Sunrise Public School Courtyard & Greenpark Residency Gate 2: Fine-smoke ratio >= 0.68 (0.76 and 0.77) and PM2.5 >= 120 µg/m³; added moisture can trap fine combustion particles."
                  - generic [ref=e538]:
                    - 'button "Row #2" [ref=e539]'
                    - 'button "Row #3" [ref=e546]'
                - generic [ref=e553]:
                  - generic [ref=e554]: Do NOT trigger emergency misting or统计 actions based on Ward 7 South Sensor Node or Lotus Enclave readings without field verification.
                  - paragraph [ref=e555]: "Ward 7 South Sensor Node & Lotus Enclave Housing Society: Row 8 has an extreme outlier (PM2.5 9999 µg/m³ > PM10 410 µg/m³) and Row 7 has PM2.5 (185 µg/m³) > PM10 (140 µg/m³)."
                  - generic [ref=e556]:
                    - 'button "Row #7" [ref=e557]'
                    - 'button "Row #8" [ref=e564]'
              - generic [ref=e571]:
                - heading "Preventive Action (7–30 Days)" [level=3] [ref=e572]
                - generic [ref=e573]:
                  - generic [ref=e574]: Enforce Construction Tarpaulin & Dust Controls
                  - generic [ref=e575]: Ward 14 Metro Construction Gate · 7-30 days
                  - paragraph [ref=e576]: Maintain the AQI improvement at Ward 14 Metro Construction Gate (356 to 193) and verify sustained compliance.
                  - 'button "Row #1" [ref=e578]'
                - generic [ref=e585]:
                  - generic [ref=e586]: Establish Permanent No-Idling Corridors
                  - generic [ref=e587]: Ward 7 Market Junction & Ward 14 East Curb Sensor · 7-30 days
                  - paragraph [ref=e588]: Address recurring congestion and NO2 spikes at Ward 7 Market Junction (NO2 112 µg/m³) and Ward 14 East Curb Sensor (NO2 88 µg/m³).
                  - generic [ref=e589]:
                    - 'button "Row #5" [ref=e590]'
                    - 'button "Row #10" [ref=e597]'
            - generic [ref=e604]:
              - heading "Action Drafts & Escalations" [level=3] [ref=e605]
              - generic [ref=e606]:
                - generic [ref=e607]:
                  - generic [ref=e608]: "To: Traffic & Enforcement Supervisor (Ward 7) (Ward 7 Market Junction)"
                  - generic [ref=e609]: Due Within 2 hours
                - paragraph [ref=e610]: "Advisory draft for approval: Deploy traffic marshals to enforce no-idling corridors during peak hours (09:00–11:00) to address AQI 337."
                - generic [ref=e611]:
                  - 'button "Row #5" [ref=e613]'
                  - generic [ref=e620]:
                    - button "Queue" [ref=e621]
                    - button "Approve & Dispatch" [ref=e626]
              - generic [ref=e631]:
                - generic [ref=e632]:
                  - generic [ref=e633]: "To: Sanitation & Waste-Burning Patrol Team (Ward 14) (Sunrise Public School Courtyard & Greenpark Residency Gate 2)"
                  - generic [ref=e634]: Due Within 2 hours
                - paragraph [ref=e635]: "Advisory draft for approval: Conduct immediate perimeter patrols for biomass/waste burning; strictly prohibit water misting/fogging."
                - generic [ref=e636]:
                  - generic [ref=e637]:
                    - 'button "Row #2" [ref=e638]'
                    - 'button "Row #3" [ref=e645]'
                  - generic [ref=e652]:
                    - button "Queue" [ref=e653]
                    - button "Approve & Dispatch" [ref=e658]
              - generic [ref=e663]:
                - generic [ref=e664]:
                  - generic [ref=e665]: "To: Municipal Sensor & Field Verification Team (Ward 7 South Sensor Node & Lotus Enclave Housing Society)"
                  - generic [ref=e666]: Due Within 24 hours
                - paragraph [ref=e667]: "Advisory draft for approval: Inspect sensor calibration and local conditions due to PM2.5 > PM10 inconsistencies and extreme outlier (9999 µg/m³)."
                - generic [ref=e668]:
                  - generic [ref=e669]:
                    - 'button "Row #7" [ref=e670]'
                    - 'button "Row #8" [ref=e677]'
                  - generic [ref=e684]:
                    - button "Queue" [ref=e685]
                    - button "Approve & Dispatch" [ref=e690]
              - generic [ref=e695]:
                - generic [ref=e696]: "Draft Escalation: WARD OFFICER → SCHOOL COORDINATOR (Sunrise Public School Courtyard & St. Xavier Primary Campus)"
                - paragraph [ref=e700]: "Sunrise Public School is at AQI 322 (Very Poor) and St. Xavier Primary Campus jumped to AQI 293 (Poor, approaching red zone). · Requested: Coordinate indoor-only recess/assemblies during peak danger window (09:00–11:00) and monitor sensitive students."
                - generic [ref=e701]:
                  - generic [ref=e702]:
                    - 'button "Row #2" [ref=e703]'
                    - 'button "Row #9" [ref=e710]'
                  - button "Send Escalation" [ref=e717]
              - generic [ref=e722]:
                - generic [ref=e723]: "Draft Escalation: WARD OFFICER → HOUSING SOCIETY (Greenpark Residency Gate 2 & Lotus Enclave Housing Society)"
                - paragraph [ref=e727]: "Greenpark Residency Gate 2 is at AQI 303 with fine-smoke pattern; Lotus Enclave has an inconsistent PM2.5 > PM10 reading. · Requested: Advise residents to avoid outdoor activity during 09:00–11:00, prohibit garden waste burning, and avoid misting."
                - generic [ref=e728]:
                  - generic [ref=e729]:
                    - 'button "Row #3" [ref=e730]'
                    - 'button "Row #7" [ref=e737]'
                  - button "Send Escalation" [ref=e744]
            - generic [ref=e749]:
              - heading "Internal Civic Briefing Note" [level=3] [ref=e750]
              - generic [ref=e751]: "WARD OFFICER BRIEFING: Prioritize traffic no-idling at Ward 7 Market Junction (AQI 337, row 5) and waste-burning patrols near Sunrise Public School (AQI 322, row 2) and Greenpark Residency (AQI 303, row 3). Strictly avoid water misting in fine-smoke zones (rows 2, 3). Escalate to School Coordinators for St. Xavier (AQI 293, row 9) and verify sensor anomalies at rows 7 and 8."
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test';
  2   | 
  3   | test.describe('Civic Air Quality Briefing Studio Full End-to-End Flow', () => {
  4   |   test('role -> baseline fixture -> parse -> messy dataset -> review -> real Gemini brief -> Row citation -> advisory -> task approve/complete -> targeted alert -> QA -> wipe', async ({
  5   |     page,
  6   |   }) => {
  7   |     const pageErrors: string[] = [];
  8   |     const consoleErrors: string[] = [];
  9   | 
  10  |     page.on('pageerror', (err) => pageErrors.push(err.message));
  11  |     page.on('console', (msg) => {
  12  |       if (msg.type() === 'error') {
  13  |         const text = msg.text();
  14  |         if (!text.includes('tile.openstreetmap.org')) {
  15  |           consoleErrors.push(text);
  16  |         }
  17  |       }
  18  |     });
  19  | 
  20  |     await page.goto('/');
  21  | 
  22  |     // 1. Compact Role Entry -> opens Command Center empty state
  23  |     await expect(page.getByRole('heading', { name: /Civic Air Quality Briefing Studio/i })).toBeVisible();
  24  |     await page.getByRole('button', { name: /Enter workspace/i }).first().click();
  25  |     await expect(page.getByRole('heading', { name: /No analyzed air-quality data yet\./i })).toBeVisible();
  26  | 
  27  |     // 2. Data Ingestion: load Baseline Fixture #1, Parse Preview, Review and Analyze Data
  28  |     await page.getByRole('button', { name: /^Data Ingestion$/i }).click();
  29  |     await expect(page.getByRole('heading', { name: /^Data Ingestion$/i })).toBeVisible();
  30  | 
  31  |     await page.getByLabel('Select labelled test fixture').selectOption('fixture_1_baseline');
  32  |     await page.getByRole('button', { name: 'Load', exact: true }).click();
  33  |     await page.getByRole('button', { name: /Parse Preview/i }).click();
  34  |     await page.getByRole('button', { name: /Review and Analyze Data/i }).click();
  35  |     await expect(page.getByText(/Normalized & Audited Rows/i)).toBeVisible();
  36  | 
  37  |     // 3. Generate baseline briefing first so Previous vs Current brief comparison has a real prior brief
  38  |     await page.getByRole('button', { name: /^Briefing Studio$/i }).click();
  39  |     await page.getByRole('button', { name: /Analyze with Gemini AI/i }).click();
  40  |     await expect(page.getByText(/Immediate Action \(0–4h\)/i)).toBeVisible({ timeout: 120000 });
  41  | 
  42  |     // 4. Load Messy Next Dataset (Fixture #2), Parse, Commit, and Review/Override a row
  43  |     await page.getByRole('button', { name: /^Data Ingestion$/i }).click();
  44  |     await page.getByLabel('Select labelled test fixture').selectOption('fixture_2_messy_current');
  45  |     await page.getByRole('button', { name: 'Load', exact: true }).click();
  46  |     await expect(page.getByText(/TEST FIXTURE — NOT LIVE DATA/i).first()).toBeVisible();
  47  |     await page.getByRole('button', { name: /Review and Analyze Data/i }).click();
  48  |     await expect(page.getByText(/Missing data/i).first()).toBeVisible();
  49  | 
  50  |     await page.getByRole('button', { name: /^Review$/i }).first().click();
  51  |     await expect(page.getByRole('heading', { name: /Review Override/i })).toBeVisible();
  52  |     await page.getByLabel(/Verification Reason/i).fill('Verified sensor cross-check');
  53  |     await page.getByRole('button', { name: /Save Review/i }).click();
  54  |     await expect(page.getByRole('heading', { name: /Review Override/i })).toHaveCount(0);
  55  | 
  56  |     // 5. Briefing Studio: analyze current dataset vs previous brief with real Gemini, open Row citation, view Internal Brief
  57  |     await page.getByRole('button', { name: /^Briefing Studio$/i }).click();
  58  |     await expect(page.getByRole('heading', { name: /^Briefing Studio$/i })).toBeVisible();
  59  |     await expect(page.getByText(/Previous vs\. Current Changes/i)).toBeVisible();
  60  | 
  61  |     await page.getByRole('button', { name: /Analyze with Gemini AI/i }).click();
  62  |     await expect(page.getByText(/Baseline: BRF-/i)).toBeVisible({ timeout: 120000 });
  63  |     await expect(page.getByText(/gemini-/i).first()).toBeVisible();
  64  | 
  65  |     // Open Row #1 CitationDrawer
  66  |     await page.getByRole('button', { name: /Row #1/i }).first().click();
  67  |     await expect(page.getByRole('dialog')).toBeVisible();
  68  |     await expect(page.getByText(/Source Evidence · Row #1/i)).toBeVisible();
  69  |     await page.getByRole('button', { name: /Close source evidence drawer/i }).click();
  70  | 
  71  |     // Toggle Internal Brief
  72  |     await page.getByRole('button', { name: /Generate Internal Brief/i }).click();
  73  |     await expect(page.getByText(/Internal Civic Briefing Note/i)).toBeVisible();
  74  | 
  75  |     // Approve & Dispatch one draft action
  76  |     const approveDraftBtn = page.getByRole('button', { name: /Approve & Dispatch/i }).first();
  77  |     if (await approveDraftBtn.isVisible()) {
  78  |       await approveDraftBtn.click();
  79  |     }
  80  | 
  81  |     // 6. Citizen Advisory: generate multilingual plain-language advisory with real Gemini
> 82  |     await page.getByRole('button', { name: /^Citizen Advisory$/i }).click();
      |                                                                     ^ Error: locator.click: Error: strict mode violation: getByRole('button', { name: /^Citizen Advisory$/i }) resolved to 2 elements:
  83  |     await expect(page.getByRole('heading', { name: /^Citizen Advisory$/i })).toBeVisible();
  84  |     await page.getByLabel('Language').selectOption('Hindi (हिन्दी)');
  85  |     await page.getByRole('button', { name: /Generate Advisory/i }).click();
  86  |     await expect(page.getByText(/Children/i).first()).toBeVisible({ timeout: 120000 });
  87  |     await expect(page.getByText(/Older Adults/i).first()).toBeVisible();
  88  |     await expect(page.getByText(/Sensitive Groups/i).first()).toBeVisible();
  89  | 
  90  |     // 7. Action Board: approve a pending task (if any), then complete a task with proof
  91  |     await page.getByRole('button', { name: /^Action Board$/i }).click();
  92  |     await expect(page.getByRole('heading', { name: /^Action Board$/i })).toBeVisible();
  93  |     const approveTaskBtn = page.getByRole('button', { name: /^Approve$/i }).first();
  94  |     if (await approveTaskBtn.isVisible()) {
  95  |       await approveTaskBtn.click();
  96  |     }
  97  |     await page.getByRole('button', { name: /^Complete$/i }).first().click();
  98  |     await page.getByPlaceholder(/Wet sweeping done/i).fill('Wet sweeping and tarpaulin check verified');
  99  |     await page.getByPlaceholder(/Field Log/i).fill('Ward Log #804');
  100 |     await page.getByRole('button', { name: /Save Update/i }).click();
  101 |     await expect(page.getByText(/COMPLETED/i).first()).toBeVisible();
  102 | 
  103 |     // 8. Evidence Map & Targeted Alerts: approve alert -> mark outcome reviewed
  104 |     await page.getByRole('button', { name: /^Evidence Map & Alerts$/i }).click();
  105 |     await expect(page.getByRole('heading', { name: /Evidence Map & Targeted Alerts/i })).toBeVisible();
  106 |     const approveAlertBtn = page.getByRole('button', { name: /Approve & Prepare Alert/i }).first();
  107 |     if (await approveAlertBtn.isVisible()) {
  108 |       await approveAlertBtn.click();
  109 |       await expect(page.getByText(/targeted recipient/i).first()).toBeVisible();
  110 |       await page.getByRole('button', { name: /Mark Outcome Reviewed/i }).first().click();
  111 |     }
  112 | 
  113 |     // 9. Command Center: verify dynamic situation banner, 3 panels, and Previous vs Current table
  114 |     await page.getByRole('button', { name: /^Command Center$/i }).click();
  115 |     await expect(page.getByRole('heading', { name: /What happened\?/i })).toBeVisible();
  116 |     await expect(page.getByRole('heading', { name: /What must happen now\?/i })).toBeVisible();
  117 |     await expect(page.getByRole('heading', { name: /Who is affected\?/i })).toBeVisible();
  118 |     await expect(page.getByText(/Previous vs\. Current Change/i).first()).toBeVisible();
  119 | 
  120 |     // 10. Evaluator QA & Audit -> Run 12-point self-check -> Wipe workspace -> verify true 0-state
  121 |     await page.getByRole('button', { name: /^Evaluator QA & Audit$/i }).click();
  122 |     await page.getByRole('button', { name: /Run Operational Self-Check Suite/i }).click();
  123 |     await expect(page.getByText(/Passed: 12\/12/i)).toBeVisible({ timeout: 120000 });
  124 | 
  125 |     await page.getByRole('button', { name: /Wipe Local Workspace/i }).click();
  126 |     await page.getByRole('button', { name: /Confirm Wipe/i }).click();
  127 | 
  128 |     await page.getByRole('button', { name: /^Command Center$/i }).click();
  129 |     await expect(page.getByRole('heading', { name: /No analyzed air-quality data yet\./i })).toBeVisible();
  130 | 
  131 |     expect(pageErrors, `Unexpected page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  132 |     expect(consoleErrors, `Unexpected console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  133 |   });
  134 | });
  135 | 
```
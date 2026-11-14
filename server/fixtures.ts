export interface TestFixtureDefinition {
  id: string;
  label: string;
  disclaimer: string;
  title: string;
  sourceType: 'CSV' | 'TSV' | 'PASTE_TEXT';
  rawText: string;
  description: string;
}

export const EVALUATOR_TEST_FIXTURES: TestFixtureDefinition[] = [
  {
    id: 'fixture_1_baseline',
    label: 'TEST FIXTURE — NOT LIVE AIR-QUALITY DATA',
    disclaimer:
      'Synthetic evaluation dataset representing a baseline prior reporting period for testing Briefing #1 and task lifecycle.',
    title: 'Baseline Period — Ward 14, Ward 7, Greenpark RWA & Sunrise School (Test Fixture)',
    sourceType: 'CSV',
    description:
      '8 locations with verified coordinates across municipal wards, housing societies, and school zones. Establishes baseline AQI before field actions.',
    rawText: `Station,Ward,Timestamp,Lat,Lng,Zone_Type,PM2.5 (ug/m3),PM10 (ug/m3),NO2 (ug/m3),SO2 (ug/m3),CO (mg/m3),O3 (ug/m3)
Ward 14 Metro Construction Gate,Ward 14,2026-11-12T08:00:00Z,28.6139,77.2090,COMMERCIAL_TRAFFIC,165,395,72,28,2.1,42
Sunrise Public School Courtyard,Ward 14,2026-11-12T08:30:00Z,28.6168,77.2135,SCHOOL_ZONE,112,240,68,20,1.9,38
Greenpark Residency Gate 2,Ward 14,2026-11-12T09:00:00Z,28.6192,77.2054,RESIDENTIAL_RWA,104,210,55,22,1.6,45
Senior Citizens Park Sector B,Ward 14,2026-11-12T10:00:00Z,28.6215,77.2110,SENIOR_PARK_HOSPITAL,98,195,52,18,1.5,48
Ward 7 Market Junction,Ward 7,2026-11-12T09:30:00Z,28.6304,77.2177,COMMERCIAL_TRAFFIC,114,245,84,32,2.4,40
Lotus Enclave Housing Society,Ward 7,2026-11-12T10:30:00Z,28.6330,77.2210,RESIDENTIAL_RWA,92,188,60,24,1.7,44
St. Xavier Primary Campus,Ward 7,2026-11-12T14:00:00Z,28.6285,77.2145,SCHOOL_ZONE,68,145,45,16,1.2,52
Civic General Hospital Wing,Ward 14,2026-11-12T15:00:00Z,28.6180,77.2180,SENIOR_PARK_HOSPITAL,64,138,42,15,1.1,50`,
  },
  {
    id: 'fixture_2_messy_current',
    label: 'TEST FIXTURE — NOT LIVE AIR-QUALITY DATA',
    disclaimer:
      'Synthetic messy evaluation dataset with mixed mg/m³ & µg/m³ units, missing readings, outlier 9999, PM2.5 > PM10 inconsistency, sharp drop flag, duplicate row, Ward 14 improvement, and Ward 7 escalation.',
    title: 'Current Messy Period — Mixed Units, Anomalies & Hotspot Shift (Test Fixture)',
    sourceType: 'PASTE_TEXT',
    description:
      'Demonstrates messy WhatsApp/Excel table normalization, unit conversion, anomaly detection, and Before-vs-After comparison against Baseline.',
    rawText: `Monitoring Station | Ward | Reading_Time | Lat | Lng | Facility_Type | PM2.5 | PM10 | NO2 | SO2 | CO | O3
Ward 14 Metro Construction Gate | Ward 14 | 13/11/2026 08:00 | 28.6139 | 77.2090 | COMMERCIAL_TRAFFIC | 0.088 mg/m3 | 228 ug/m3 | 58 ug/m3 | 22 | 1.4 mg/m3 | 44
Sunrise Public School Courtyard | Ward 14 | 13/11/2026 08:30 | 28.6168 | 77.2135 | SCHOOL_ZONE | 148 ug/m3 | 195 ug/m3 | 94 ug/m3 | 52 ug/m3 | 2.8 mg/m3 | 36
Greenpark Residency Gate 2 | Ward 14 | 13/11/2026 09:00 | 28.6192 | 77.2054 | RESIDENTIAL_RWA | 124 ug/m3 | 162 ug/m3 | 66 | 48 | 2.1 | 40
Senior Citizens Park Sector B | Ward 14 | 13/11/2026 10:00 | 28.6215 | 77.2110 | SENIOR_PARK_HOSPITAL | N/A | 184 ug/m3 | 54 | 20 | 1.5 | 46
Ward 7 Market Junction | Ward 7 | 13/11/2026 09:30 | 28.6304 | 77.2177 | COMMERCIAL_TRAFFIC | 0.168 mg/m3 | 342 ug/m3 | 112 ug/m3 | 38 | 3.1 | 39
Ward 7 Market Junction | Ward 7 | 13/11/2026 09:30 | 28.6304 | 77.2177 | COMMERCIAL_TRAFFIC | 0.168 mg/m3 | 342 ug/m3 | 112 ug/m3 | 38 | 3.1 | 39
Lotus Enclave Housing Society | Ward 7 | 13/11/2026 10:30 | 28.6330 | 77.2210 | RESIDENTIAL_RWA | 185 ug/m3 | 140 ug/m3 | 64 | 26 | 1.8 | 42
Ward 7 South Sensor Node | Ward 7 | 13/11/2026 11:00 | 28.6272 | 77.2235 | COMMERCIAL_TRAFFIC | 9999 | 410 | 78 | 28 | 2.2 | 41
St. Xavier Primary Campus | Ward 7 | 13/11/2026 14:00 | 28.6285 | 77.2145 | SCHOOL_ZONE | 118 | 168 | 74 | 24 | 2.0 | 49
Ward 14 East Curb Sensor | Ward 14 | 13/11/2026 11:30 | 28.6152 | 77.2158 | COMMERCIAL_TRAFFIC | 36 | 42 | 88 | 26 | 2.5 | 38
Civic General Hospital Wing | Ward 14 | 13/11/2026 15:00 | 28.6180 | 77.2180 | SENIOR_PARK_HOSPITAL | 58 | 124 | 0.045 ppm | 16 | 1100 ug/m3 | 48`,
  },
  {
    id: 'fixture_3_malformed',
    label: 'TEST FIXTURE — NOT LIVE AIR-QUALITY DATA',
    disclaimer:
      'Synthetic malformed input designed to verify graceful validation failure without crashing.',
    title: 'Malformed Stress-Test Input (Test Fixture)',
    sourceType: 'PASTE_TEXT',
    description:
      'Unstructured corrupt text without usable headers or valid table structure.',
    rawText: `WhatsApp forward from sensor group - check later!!
no headers here just broken text ::: ???
12345 missing columns`,
  },
];

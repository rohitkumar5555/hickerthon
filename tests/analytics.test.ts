import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  computeAreaTrajectories,
  computeCpcbAqi,
  computeOutcomeScorecard,
  normalizeAndAuditBatch,
  optimizeFieldResources,
  parseRawTableInput,
  parseUploadedFileBuffer,
  sanitizeText,
} from '../server/analytics.js';
import { EVALUATOR_TEST_FIXTURES } from '../server/fixtures.js';

import { computeClientTrajectories, sanitizeText as clientSanitizeText } from '../src/utils/civicMath.js';

describe('Civic Air Quality Analytics Engine', () => {
  it('sanitizes XSS script tags and event handlers cleanly on server and client', () => {
    const dirty = `<script>alert('xss')</script><img src=x onerror=alert(1)>Ward 14 Gate`;
    const clean = sanitizeText(dirty);
    expect(clean).not.toContain('<script>');
    expect(clean).not.toContain('onerror=');
    expect(clean).toContain('Ward 14 Gate');

    const cleanClient = clientSanitizeText(dirty);
    expect(cleanClient).not.toContain('<script>');
    expect(cleanClient).toContain('Ward 14 Gate');
  });

  it('parses messy CSV, TSV, Markdown pipe tables, JSON, and XLSX without crashing', () => {
    const csv = `Location,PM2.5,PM10\nWard 14,120,240`;
    expect(parseRawTableInput(csv, 'CSV').rows).toHaveLength(1);

    const tsv = `Station\tPM2.5\tPM10\nSunrise School\t95\t180`;
    expect(parseRawTableInput(tsv, 'TSV').detectedDelimiter).toBe('TAB');

    const md = `| Station | PM2.5 | PM10 |\n|---|---|---|\n| Greenpark RWA | 140 | 260 |`;
    const mdParsed = parseRawTableInput(md, 'PASTE_TEXT');
    expect(mdParsed.detectedDelimiter).toBe('|');
    expect(mdParsed.rows[0].Station).toBe('Greenpark RWA');

    const json = JSON.stringify([{ location: 'Senior Park', pm25: 110, pm10: 205 }]);
    expect(parseRawTableInput(json, 'JSON').rows[0].location).toBe('Senior Park');

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([{ Location: 'Hospital Gate', 'PM2.5': 88, PM10: 150 }]);
    XLSX.utils.book_append_sheet(wb, ws, 'Readings');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const xlsxParsed = parseUploadedFileBuffer(buf, 'ward_readings.xlsx');
    expect(xlsxParsed.sourceType).toBe('XLSX');
    expect(xlsxParsed.parsed.rows[0].Location).toBe('Hospital Gate');
  });

  it('normalizes mg/m3 to ug/m3 for PM/gases, ug/m3 to mg/m3 for CO, and flags ppm/ppb conversion unavailable', () => {
    const raw = [
      'Location,Ward,PM2.5,PM10,NO2,CO,Unit',
      'Sector 5 Gate,Ward 14,0.18 mg/m3,0.34 mg/m3,90,2200 ug/m3,',
      'Gas Monitor B,Ward 7,75,160,45 ppb,1.2,',
    ].join('\n');

    const parsed = parseRawTableInput(raw, 'CSV');
    const { readings } = normalizeAndAuditBatch({
      batchId: 'b_conv',
      title: 'Unit Conversion Test',
      sourceType: 'CSV',
      storagePath: 'test',
      storageProvider: 'INDEXEDDB_DEXIE',
      rawInputText: raw,
      parsed,
      createdBy: 'test',
    });

    expect(readings[0].pm25).toBe(180);
    expect(readings[0].pm10).toBe(340);
    expect(readings[0].co).toBe(2.2);
    expect(readings[0].reliabilityStatus).toBe('UNIT_CONVERTED');
    expect(readings[0].conversionFormulas.length).toBeGreaterThanOrEqual(3);

    expect(readings[1].no2).toBeNull();
    expect(readings[1].reliabilityStatus).toBe('CONVERSION_UNAVAILABLE');
  });

  it('flags PM2.5 > PM10, negative values, extreme outliers, and duplicates, and excludes them from stats', () => {
    const fixture2 = EVALUATOR_TEST_FIXTURES.find((f) => f.id === 'fixture_2_messy_current')!;
    const fixture1 = EVALUATOR_TEST_FIXTURES.find((f) => f.id === 'fixture_1_baseline')!;

    const p1 = parseRawTableInput(fixture1.rawText, 'CSV');
    const b1 = normalizeAndAuditBatch({
      batchId: 'b1',
      title: fixture1.title,
      sourceType: 'TEST_FIXTURE',
      storagePath: 'fixture',
      storageProvider: 'INDEXEDDB_DEXIE',
      rawInputText: fixture1.rawText,
      parsed: p1,
      createdBy: 'test',
      isTestFixture: true,
    });

    const p2 = parseRawTableInput(fixture2.rawText, 'PASTE_TEXT');
    const b2 = normalizeAndAuditBatch({
      batchId: 'b2',
      title: fixture2.title,
      sourceType: 'TEST_FIXTURE',
      storagePath: 'fixture',
      storageProvider: 'INDEXEDDB_DEXIE',
      rawInputText: fixture2.rawText,
      parsed: p2,
      createdBy: 'test',
      isTestFixture: true,
      previousBatchReadings: b1.readings,
    });

    const statuses = new Set(b2.readings.map((r) => r.reliabilityStatus));
    expect(statuses.has('INCONSISTENT_MEASUREMENT_PM25_GT_PM10')).toBe(true);
    expect(statuses.has('OUTLIER_REQUIRES_VERIFICATION')).toBe(true);
    expect(statuses.has('DUPLICATE_ROW')).toBe(true);
    expect(statuses.has('CONVERSION_UNAVAILABLE')).toBe(true);
    expect(b2.batch.excludedRows).toBeGreaterThanOrEqual(3);

    const negCsv = 'Location,PM2.5,PM10\nBroken Sensor,-12,80';
    const negBatch = normalizeAndAuditBatch({
      batchId: 'bneg',
      title: 'Neg Check',
      sourceType: 'CSV',
      storagePath: 'inline',
      storageProvider: 'INDEXEDDB_DEXIE',
      rawInputText: negCsv,
      parsed: parseRawTableInput(negCsv, 'CSV'),
      createdBy: 'test',
    });
    expect(negBatch.readings[0].reliabilityStatus).toBe('NEGATIVE_VALUE_INVALID');
    expect(negBatch.readings[0].excludeFromStatistics).toBe(true);
  });

  it('computes CPCB NAQI sub-indices accurately and refuses to invent AQI when all pollutants are null', () => {
    const valid = computeCpcbAqi({ pm25: 125, pm10: 260, no2: 45, so2: null, co: null, o3: null });
    expect(valid.aqi).toBeGreaterThanOrEqual(301);
    expect(valid.alertLevel).toBe('RED_EMERGENCY_ZONE');
    expect(valid.dominantPollutant).toBe('PM2.5');

    const empty = computeCpcbAqi({ pm25: null, pm10: null, no2: null, so2: null, co: null, o3: null });
    expect(empty.aqi).toBeNull();
    expect(empty.alertLevel).toBe('AQI_UNAVAILABLE');
  });

  it('computes trajectories (server & client), skips water sprinklers on fine-smoke contraindication, and computes outcome scorecard', () => {
    const prevCsv = `Location,Ward,PM2.5,PM10,Timestamp\nSunrise Public School,Ward 14,72,130,2026-11-10 08:00\nMarket Flyover,Ward 14,195,410,2026-11-10 08:00`;
    const currCsv = `Location,Ward,PM2.5,PM10,Timestamp\nSunrise Public School,Ward 14,148,195,2026-11-11 08:00\nMarket Flyover,Ward 14,85,220,2026-11-11 08:00`;

    const bPrev = normalizeAndAuditBatch({
      batchId: 'bp',
      title: 'Prev',
      sourceType: 'CSV',
      storagePath: 'p',
      storageProvider: 'INDEXEDDB_DEXIE',
      rawInputText: prevCsv,
      parsed: parseRawTableInput(prevCsv, 'CSV'),
      createdBy: 'u',
    });

    const bCurr = normalizeAndAuditBatch({
      batchId: 'bc',
      title: 'Curr',
      sourceType: 'CSV',
      storagePath: 'c',
      storageProvider: 'INDEXEDDB_DEXIE',
      rawInputText: currCsv,
      parsed: parseRawTableInput(currCsv, 'CSV'),
      createdBy: 'u',
      previousBatchReadings: bPrev.readings,
    });

    const trajectories = computeAreaTrajectories(bCurr.readings, bPrev.readings);
    const clientTraj = computeClientTrajectories(bCurr.readings, bPrev.readings);
    expect(clientTraj).toHaveLength(trajectories.length);

    const schoolTraj = trajectories.find((t) => t.locationName === 'Sunrise Public School')!;
    expect(schoolTraj.isRedZoneNow).toBe(true);
    expect(schoolTraj.aqiDelta).toBeGreaterThan(0);

    const schedule = optimizeFieldResources({
      trajectories,
      readings: bCurr.readings,
      waterSprinklers: 1,
      enforcementSquads: 1,
      trafficMarshals: 1,
      patrolTeams: 1,
    });
    const schoolStop = schedule.find((s) => s.locationName === 'Sunrise Public School')!;
    expect(schoolStop.assignedResourceType).not.toBe('WATER_SPRINKLER');
    expect(schoolStop.contraindicationSkipped).toContain('Water Sprinkler skipped');

    const scorecard = computeOutcomeScorecard(trajectories, [
      { locationName: 'Market Flyover', title: 'Wet sweeping', status: 'COMPLETED' },
    ]);
    expect(scorecard).toHaveLength(1);
    expect(scorecard[0].outcomeCategory).toBe('COMPLETED_TASK_AREA');
    expect(scorecard[0].aqiDelta).toBeLessThan(0);
  });
});

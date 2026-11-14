import crypto from 'node:crypto';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type {
  AlertLevel,
  AreaTrajectoryRecord,
  BatchRecord,
  BriefingRecord,
  ColumnMappingConfig,
  OutcomeComparisonEntry,
  ReadingRecord,
  ReliabilityStatus,
  ResourceAllocationStop,
  VulnerableZoneType,
} from '../src/types/civic.js';

export function sanitizeText(value: string): string {
  return value
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '[removed-script]')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/[<>]/g, (ch) => (ch === '<' ? '&lt;' : '&gt;'))
    .trim();
}

const MISSING_TOKENS = new Set([
  '',
  'na',
  'n/a',
  'null',
  'none',
  'nil',
  '-',
  '--',
  'nd',
  'bdl',
  'missing',
  'unavailable',
  'nan',
  'undefined',
]);

export function isMissingCell(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  const s = String(raw).trim().toLowerCase();
  return MISSING_TOKENS.has(s);
}

// Header alias detection
const HEADER_ALIASES: Record<keyof ColumnMappingConfig, string[]> = {
  location: ['location', 'station', 'site', 'area', 'locality', 'monitoring station', 'sensor location', 'place', 'school/society'],
  ward: ['ward', 'ward_zone', 'ward zone', 'zone', 'sector', 'district'],
  timestamp: ['timestamp', 'recorded_at', 'date', 'datetime', 'time', 'reading_time', 'observed_at', 'logged_at'],
  latitude: ['lat', 'latitude', 'y'],
  longitude: ['lng', 'lon', 'long', 'longitude', 'x'],
  vulnerableZone: ['vulnerable_zone', 'vulnerable zone', 'zone_type', 'facility_type', 'sensitive_receptor'],
  pm25: ['pm2.5', 'pm25', 'pm_25', 'pm 2.5', 'fine_pm', 'fine particulate'],
  pm10: ['pm10', 'pm_10', 'pm 10', 'coarse_pm'],
  no2: ['no2', 'no_2', 'nitrogen dioxide'],
  so2: ['so2', 'so_2', 'sulfur dioxide', 'sulphur dioxide'],
  co: ['co', 'carbon monoxide'],
  o3: ['o3', 'o_3', 'ozone'],
  unit: ['unit', 'units', 'measurement_unit'],
  reportedAqi: ['aqi', 'reported_aqi', 'station_aqi'],
};

export function detectColumnMapping(headers: string[]): ColumnMappingConfig {
  const mapping: ColumnMappingConfig = {};
  const normalizedHeaders = headers.map((h) => ({
    raw: h,
    clean: h.toLowerCase().replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').replace(/\s+/g, ' ').trim(),
  }));

  (Object.keys(HEADER_ALIASES) as (keyof ColumnMappingConfig)[]).forEach((field) => {
    const aliases = HEADER_ALIASES[field];
    const match = normalizedHeaders.find(
      (h) => aliases.includes(h.clean) || aliases.some((a) => h.clean.startsWith(a) || h.clean.includes(a))
    );
    if (match) {
      mapping[field] = match.raw;
    }
  });
  return mapping;
}

export interface ParsedRawTable {
  headers: string[];
  rows: Record<string, string>[];
  detectedDelimiter: string;
  proposedMapping: ColumnMappingConfig;
}

function parseMarkdownOrPipeTable(text: string): { headers: string[]; rows: Record<string, string>[] } | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return null;
  const pipeLines = lines.filter((l) => l.includes('|'));
  if (pipeLines.length < 2) return null;

  const splitPipe = (line: string) =>
    line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());

  const headers = splitPipe(pipeLines[0]).filter((h) => h.length > 0);
  if (headers.length < 2) return null;

  const dataRows: Record<string, string>[] = [];
  for (let i = 1; i < pipeLines.length; i++) {
    const line = pipeLines[i];
    if (/^[\s|:-]+$/.test(line)) continue; // skip markdown separator row
    const cells = splitPipe(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] ?? '';
    });
    dataRows.push(obj);
  }
  return { headers, rows: dataRows };
}

export function parseRawTableInput(rawText: string, sourceTypeHint?: string): ParsedRawTable {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error('Input text is empty. Paste a table or upload a supported CSV, TSV, JSON, or XLSX file.');
  }

  // Try JSON array first if looks like JSON
  if (sourceTypeHint === 'JSON' || trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.readings) ? parsed.readings : Array.isArray(parsed?.data) ? parsed.data : null;
      if (arr && arr.length > 0 && typeof arr[0] === 'object') {
        const headerSet = new Set<string>();
        arr.forEach((row: Record<string, unknown>) => Object.keys(row).forEach((k) => headerSet.add(k)));
        const headers = Array.from(headerSet);
        const rows = arr.map((row: Record<string, unknown>) => {
          const rec: Record<string, string> = {};
          headers.forEach((h) => {
            rec[h] = row[h] === null || row[h] === undefined ? '' : String(row[h]);
          });
          return rec;
        });
        return {
          headers,
          rows,
          detectedDelimiter: 'json',
          proposedMapping: detectColumnMapping(headers),
        };
      }
    } catch {
      if (sourceTypeHint === 'JSON') {
        throw new Error('Malformed JSON file: unable to parse array of reading objects.');
      }
    }
  }

  // Check Markdown / pipe table
  if (trimmed.includes('|') && (trimmed.match(/\|/g)?.length ?? 0) >= 4) {
    const md = parseMarkdownOrPipeTable(trimmed);
    if (md && md.rows.length > 0) {
      return {
        headers: md.headers,
        rows: md.rows,
        detectedDelimiter: '|',
        proposedMapping: detectColumnMapping(md.headers),
      };
    }
  }

  // Filter out conversational prefix lines (e.g. WhatsApp preamble before header)
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('Input must contain at least one header row and one data row.');
  }

  const candidateText = lines.join('\n');
  const firstLine = lines[0];
  let delimiter = ',';
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const semiCount = (firstLine.match(/;/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  if (tabCount >= commaCount && tabCount >= semiCount && tabCount > 0) delimiter = '\t';
  else if (semiCount > commaCount && semiCount > 0) delimiter = ';';

  const result = Papa.parse<Record<string, string>>(candidateText, {
    header: true,
    delimiter,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = (result.meta.fields ?? []).filter((h) => h.length > 0);
  if (headers.length < 2 || result.data.length === 0) {
    throw new Error('No usable table header and data rows found. Verify column delimiters or use [AI Parse Broken Table].');
  }

  const rows = result.data.map((r) => {
    const cleanRow: Record<string, string> = {};
    headers.forEach((h) => {
      cleanRow[h] = r[h] !== undefined && r[h] !== null ? String(r[h]).trim() : '';
    });
    return cleanRow;
  });

  return {
    headers,
    rows,
    detectedDelimiter: delimiter === '\t' ? 'TAB' : delimiter,
    proposedMapping: detectColumnMapping(headers),
  };
}

export function parseUploadedFileBuffer(
  buffer: Buffer,
  filename: string
): { rawText: string; sourceType: 'CSV' | 'TSV' | 'JSON' | 'XLSX'; parsed: ParsedRawTable } {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('XLSX workbook contains no sheets.');
    }
    const sheet = workbook.Sheets[firstSheetName];
    const csvText = XLSX.utils.sheet_to_csv(sheet);
    const parsed = parseRawTableInput(csvText, 'CSV');
    return { rawText: csvText, sourceType: 'XLSX', parsed };
  }

  const text = buffer.toString('utf8');
  if (lower.endsWith('.json')) {
    const parsed = parseRawTableInput(text, 'JSON');
    return { rawText: text, sourceType: 'JSON', parsed };
  }
  if (lower.endsWith('.tsv')) {
    const parsed = parseRawTableInput(text, 'TSV');
    return { rawText: text, sourceType: 'TSV', parsed };
  }
  if (lower.endsWith('.csv')) {
    const parsed = parseRawTableInput(text, 'CSV');
    return { rawText: text, sourceType: 'CSV', parsed };
  }
  throw new Error('Unsupported file extension. Supported formats: .csv, .tsv, .json, .xlsx');
}

interface NormalizedPollutantResult {
  value: number | null;
  rawStr: string;
  formula: string | null;
  converted: boolean;
  nonNumeric: boolean;
  negative: boolean;
  conversionUnavailable: boolean;
}

function parseNumericWithUnit(
  rawCell: string,
  headerName: string,
  rowUnitHint: string,
  pollutant: 'pm25' | 'pm10' | 'no2' | 'so2' | 'co' | 'o3'
): NormalizedPollutantResult {
  const rawStr = (rawCell ?? '').trim();
  if (isMissingCell(rawStr)) {
    return {
      value: null,
      rawStr,
      formula: null,
      converted: false,
      nonNumeric: false,
      negative: false,
      conversionUnavailable: false,
    };
  }

  // Extract inline unit if present (e.g., "0.32 mg/m3", "185 ug/m3", "45 ppb")
  const match = rawStr.match(/^([+-]?\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) {
    return {
      value: null,
      rawStr,
      formula: null,
      converted: false,
      nonNumeric: true,
      negative: false,
      conversionUnavailable: false,
    };
  }

  const num = Number(match[1]);
  if (!Number.isFinite(num)) {
    return {
      value: null,
      rawStr,
      formula: null,
      converted: false,
      nonNumeric: true,
      negative: false,
      conversionUnavailable: false,
    };
  }

  if (num < 0) {
    return {
      value: null,
      rawStr,
      formula: null,
      converted: false,
      nonNumeric: false,
      negative: true,
      conversionUnavailable: false,
    };
  }

  const combinedUnitHint = `${match[2]} ${headerName} ${rowUnitHint}`.toLowerCase();
  const isMgPerM3 = /mg\s*\/\s*m3|mg\s*\/\s*m³|mgm-3/.test(combinedUnitHint);
  const isUgPerM3 = /ug\s*\/\s*m3|µg\s*\/\s*m3|µg\s*\/\s*m³|ugm-3|mcg\/m3/.test(combinedUnitHint);
  const isPpm = /\bppm\b/.test(combinedUnitHint);
  const isPpb = /\bppb\b/.test(combinedUnitHint);

  if (isPpm || isPpb) {
    // Scientific guardrail: ppm/ppb to µg/m³ depends on temperature and pressure; preserve raw and flag unavailable
    return {
      value: null,
      rawStr,
      formula: `${pollutant.toUpperCase()} ${rawStr} -> conversion unavailable (temperature & pressure required for ppm/ppb)`,
      converted: false,
      nonNumeric: false,
      negative: false,
      conversionUnavailable: true,
    };
  }

  if (pollutant === 'co') {
    // CPCB CO standard unit is mg/m³
    if (isUgPerM3) {
      const convertedVal = Number((num / 1000).toFixed(3));
      return {
        value: convertedVal,
        rawStr,
        formula: `CO: ${num} µg/m³ ÷ 1000 = ${convertedVal} mg/m³`,
        converted: true,
        nonNumeric: false,
        negative: false,
        conversionUnavailable: false,
      };
    }
    return {
      value: Number(num.toFixed(3)),
      rawStr,
      formula: null,
      converted: false,
      nonNumeric: false,
      negative: false,
      conversionUnavailable: false,
    };
  }

  // Particulate & gas pollutants standardized to µg/m³
  if (isMgPerM3) {
    const convertedVal = Number((num * 1000).toFixed(2));
    return {
      value: convertedVal,
      rawStr,
      formula: `${pollutant.toUpperCase()}: ${num} mg/m³ × 1000 = ${convertedVal} µg/m³`,
      converted: true,
      nonNumeric: false,
      negative: false,
      conversionUnavailable: false,
    };
  }

  return {
    value: Number(num.toFixed(2)),
    rawStr,
    formula: null,
    converted: false,
    nonNumeric: false,
    negative: false,
    conversionUnavailable: false,
  };
}

// Official Indian CPCB NAQI Linear Sub-Index Breakpoints
type Breakpoint = [number, number, number, number];
const CPCB_BREAKPOINTS: Record<string, Breakpoint[]> = {
  PM25: [
    [0, 30, 0, 50],
    [31, 60, 51, 100],
    [61, 90, 101, 200],
    [91, 120, 201, 300],
    [121, 250, 301, 400],
    [251, 500, 401, 500],
  ],
  PM10: [
    [0, 50, 0, 50],
    [51, 100, 51, 100],
    [101, 250, 101, 200],
    [251, 350, 201, 300],
    [351, 430, 301, 400],
    [431, 650, 401, 500],
  ],
  NO2: [
    [0, 40, 0, 50],
    [41, 80, 51, 100],
    [81, 180, 101, 200],
    [181, 280, 201, 300],
    [281, 400, 301, 400],
    [401, 600, 401, 500],
  ],
  SO2: [
    [0, 40, 0, 50],
    [41, 80, 51, 100],
    [81, 380, 101, 200],
    [381, 800, 201, 300],
    [801, 1600, 301, 400],
    [1601, 2200, 401, 500],
  ],
  CO: [
    [0, 1.0, 0, 50],
    [1.1, 2.0, 51, 100],
    [2.1, 10.0, 101, 200],
    [10.1, 17.0, 201, 300],
    [17.1, 34.0, 301, 400],
    [34.1, 50.0, 401, 500],
  ],
  O3: [
    [0, 50, 0, 50],
    [51, 100, 51, 100],
    [101, 168, 101, 200],
    [169, 208, 201, 300],
    [209, 748, 301, 400],
    [749, 1000, 401, 500],
  ],
};

function computeSubIndex(val: number, breakpoints: Breakpoint[]): number {
  for (const [cLo, cHi, iLo, iHi] of breakpoints) {
    if (val <= cHi) {
      return Math.round(((iHi - iLo) / (cHi - cLo)) * Math.max(0, val - cLo) + iLo);
    }
  }
  return 500;
}

export function computeCpcbAqi(pollutants: {
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
  o3: number | null;
}): {
  aqi: number | null;
  category: string;
  alertLevel: AlertLevel;
  dominantPollutant: string;
} {
  const candidates: { name: string; subIndex: number }[] = [];
  if (pollutants.pm25 !== null) candidates.push({ name: 'PM2.5', subIndex: computeSubIndex(pollutants.pm25, CPCB_BREAKPOINTS.PM25) });
  if (pollutants.pm10 !== null) candidates.push({ name: 'PM10', subIndex: computeSubIndex(pollutants.pm10, CPCB_BREAKPOINTS.PM10) });
  if (pollutants.no2 !== null) candidates.push({ name: 'NO2', subIndex: computeSubIndex(pollutants.no2, CPCB_BREAKPOINTS.NO2) });
  if (pollutants.so2 !== null) candidates.push({ name: 'SO2', subIndex: computeSubIndex(pollutants.so2, CPCB_BREAKPOINTS.SO2) });
  if (pollutants.co !== null) candidates.push({ name: 'CO', subIndex: computeSubIndex(pollutants.co, CPCB_BREAKPOINTS.CO) });
  if (pollutants.o3 !== null) candidates.push({ name: 'O3', subIndex: computeSubIndex(pollutants.o3, CPCB_BREAKPOINTS.O3) });

  if (candidates.length === 0) {
    return {
      aqi: null,
      category: 'AQI unavailable from supplied data',
      alertLevel: 'AQI_UNAVAILABLE',
      dominantPollutant: 'Unavailable',
    };
  }

  candidates.sort((a, b) => b.subIndex - a.subIndex);
  const max = candidates[0];
  const aqi = max.subIndex;

  let category = 'Good (0-50)';
  let alertLevel: AlertLevel = 'GREEN_SAFE';
  if (aqi >= 401) {
    category = 'Severe (401-500)';
    alertLevel = 'RED_EMERGENCY_ZONE';
  } else if (aqi >= 301) {
    category = 'Very Poor (301-400)';
    alertLevel = 'RED_EMERGENCY_ZONE';
  } else if (aqi >= 201) {
    category = 'Poor (201-300)';
    alertLevel = 'ORANGE_WARNING';
  } else if (aqi >= 101) {
    category = 'Moderate (101-200)';
    alertLevel = 'YELLOW_WATCH';
  } else if (aqi >= 51) {
    category = 'Satisfactory (51-100)';
    alertLevel = 'GREEN_SAFE';
  }

  return { aqi, category, alertLevel, dominantPollutant: max.name };
}

function parseFlexibleDate(rawDate: string): { iso: string | null; hour: number | null } {
  const s = (rawDate ?? '').trim();
  if (isMissingCell(s)) return { iso: null, hour: null };

  // DD/MM/YYYY HH:mm or DD-MM-YYYY HH:mm
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    const hour = dmyMatch[4] ? Number(dmyMatch[4]) : 12;
    const min = dmyMatch[5] ? Number(dmyMatch[5]) : 0;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour >= 0 && hour <= 23) {
      const dt = new Date(Date.UTC(year, month - 1, day, hour, min));
      if (!Number.isNaN(dt.getTime())) {
        return { iso: dt.toISOString(), hour };
      }
    }
  }

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return { iso: parsed.toISOString(), hour: parsed.getUTCHours() };
  }
  return { iso: null, hour: null };
}

function inferVulnerableZone(location: string, rawZoneType: string): VulnerableZoneType {
  const combined = `${location} ${rawZoneType}`.toLowerCase();
  if (/school|academy|college|campus|kindergarten|vidyalaya/.test(combined)) return 'SCHOOL_ZONE';
  if (/senior|park|hospital|clinic|elder|old age/.test(combined)) return 'SENIOR_PARK_HOSPITAL';
  if (/rwa|society|enclave|apartments|residency|housing|greens/.test(combined)) return 'RESIDENTIAL_RWA';
  return 'COMMERCIAL_TRAFFIC';
}

function inferSourceAndContraindication(p: {
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
}): { ratio: number | null; sourcePattern: string; warning: string | null } {
  const ratio =
    p.pm25 !== null && p.pm10 !== null && p.pm10 > 0
      ? Number((p.pm25 / p.pm10).toFixed(2))
      : null;

  if (ratio !== null && ratio >= 0.68 && (p.pm25 ?? 0) >= 120) {
    return {
      ratio,
      sourcePattern: 'Possible fine-smoke / biomass combustion pattern',
      warning:
        'POLICY GUARDRAIL: Avoid water misting or fogging when fine-smoke ratio >= 0.68 and PM2.5 >= 120 µg/m³ — added moisture can trap fine combustion particles; prioritize source shutdown.',
    };
  }
  if (ratio !== null && ratio <= 0.45 && (p.pm10 ?? 0) >= 150) {
    return {
      ratio,
      sourcePattern: 'Possible coarse construction / road-dust resuspension pattern',
      warning: null,
    };
  }
  if ((p.so2 ?? 0) >= 45 && (p.no2 ?? 0) >= 60) {
    return {
      ratio,
      sourcePattern: 'Possible diesel generator (DG) / fuel combustion pattern',
      warning: null,
    };
  }
  if ((p.no2 ?? 0) >= 80 || (p.co ?? 0) >= 2.2) {
    return {
      ratio,
      sourcePattern: 'Possible vehicular traffic idling / corridor congestion pattern',
      warning: null,
    };
  }
  return {
    ratio,
    sourcePattern: 'Mixed urban particulate pattern',
    warning: null,
  };
}

export function normalizeAndAuditBatch(params: {
  batchId: string;
  title: string;
  sourceType: BatchRecord['sourceType'];
  storagePath: string;
  storageProvider: BatchRecord['storageProvider'];
  rawInputText: string;
  parsed: ParsedRawTable;
  customMapping?: ColumnMappingConfig;
  createdBy: string;
  isTestFixture?: boolean;
  fixtureLabel?: string;
  previousBatchReadings?: ReadingRecord[];
}): { batch: BatchRecord; readings: ReadingRecord[] } {
  const mapping: ColumnMappingConfig = {
    ...params.parsed.proposedMapping,
    ...(params.customMapping ?? {}),
  };

  const seenFingerprints = new Set<string>();
  const readings: ReadingRecord[] = [];
  const prevByLocation = new Map<string, ReadingRecord>();
  (params.previousBatchReadings ?? []).forEach((r) => {
    if (!r.excludeFromStatistics) {
      prevByLocation.set(r.locationName.toLowerCase(), r);
    }
  });

  let cleanRows = 0;
  let convertedRows = 0;
  let missingRows = 0;
  let unreliableRows = 0;
  let duplicateRows = 0;
  let excludedRows = 0;

  const hourlySum = new Map<number, { totalAqi: number; count: number }>();

  params.parsed.rows.forEach((rawRow, index) => {
    const rowIndex = index + 1;
    const rawCells: Record<string, string> = {};
    Object.entries(rawRow).forEach(([k, v]) => {
      rawCells[sanitizeText(k)] = sanitizeText(String(v ?? ''));
    });

    const locationName =
      sanitizeText((mapping.location ? rawRow[mapping.location] : '') || '') || `Unlabelled Station #${rowIndex}`;
    const wardZone = sanitizeText((mapping.ward ? rawRow[mapping.ward] : '') || '') || 'Unassigned Ward';
    const rawDateStr = sanitizeText((mapping.timestamp ? rawRow[mapping.timestamp] : '') || '');
    const { iso: recordedAt, hour } = parseFlexibleDate(rawDateStr);

    const latRaw = mapping.latitude ? rawRow[mapping.latitude] : '';
    const lngRaw = mapping.longitude ? rawRow[mapping.longitude] : '';
    const latNum = latRaw && !isMissingCell(latRaw) ? Number(latRaw) : NaN;
    const lngNum = lngRaw && !isMissingCell(lngRaw) ? Number(lngRaw) : NaN;
    const hasCoords =
      Number.isFinite(latNum) &&
      Number.isFinite(lngNum) &&
      latNum >= -90 &&
      latNum <= 90 &&
      lngNum >= -180 &&
      lngNum <= 180;

    const unitHint = mapping.unit ? rawRow[mapping.unit] ?? '' : '';

    const pm25Res = parseNumericWithUnit(mapping.pm25 ? rawRow[mapping.pm25] : '', mapping.pm25 ?? '', unitHint, 'pm25');
    const pm10Res = parseNumericWithUnit(mapping.pm10 ? rawRow[mapping.pm10] : '', mapping.pm10 ?? '', unitHint, 'pm10');
    const no2Res = parseNumericWithUnit(mapping.no2 ? rawRow[mapping.no2] : '', mapping.no2 ?? '', unitHint, 'no2');
    const so2Res = parseNumericWithUnit(mapping.so2 ? rawRow[mapping.so2] : '', mapping.so2 ?? '', unitHint, 'so2');
    const coRes = parseNumericWithUnit(mapping.co ? rawRow[mapping.co] : '', mapping.co ?? '', unitHint, 'co');
    const o3Res = parseNumericWithUnit(mapping.o3 ? rawRow[mapping.o3] : '', mapping.o3 ?? '', unitHint, 'o3');

    const flags: string[] = [];
    const conversionFormulas: string[] = [];
    const rawValuesAndUnits: Record<string, string> = {};

    const results = [
      ['PM2.5', pm25Res],
      ['PM10', pm10Res],
      ['NO2', no2Res],
      ['SO2', so2Res],
      ['CO', coRes],
      ['O3', o3Res],
    ] as const;

    let anyMissing = false;
    let anyConverted = false;
    let anyNonNumeric = false;
    let anyNegative = false;
    let anyConversionUnavailable = false;

    results.forEach(([label, res]) => {
      rawValuesAndUnits[label] = res.rawStr || 'missing';
      if (res.formula) conversionFormulas.push(res.formula);
      if (res.converted) anyConverted = true;
      if (res.nonNumeric) {
        anyNonNumeric = true;
        flags.push(`Non-numeric value in ${label}: "${res.rawStr}"`);
      }
      if (res.negative) {
        anyNegative = true;
        flags.push(`Negative reading invalid in ${label}: "${res.rawStr}"`);
      }
      if (res.conversionUnavailable) {
        anyConversionUnavailable = true;
        flags.push(`${label} conversion unavailable (${res.rawStr})`);
      }
      if (!res.rawStr || isMissingCell(res.rawStr)) {
        if (label === 'PM2.5' || label === 'PM10') {
          anyMissing = true;
          flags.push(`Missing ${label} reading`);
        }
      }
    });

    if (!recordedAt && rawDateStr) {
      flags.push(`Unparseable timestamp preserved: "${rawDateStr}"`);
    }

    // Outlier check
    const isOutlier =
      (pm25Res.value !== null && pm25Res.value > 1500) ||
      (pm10Res.value !== null && pm10Res.value > 2500) ||
      (no2Res.value !== null && no2Res.value > 1500) ||
      (coRes.value !== null && coRes.value > 60);
    if (isOutlier) {
      flags.push('Extreme outlier requiring field verification (> threshold)');
    }

    // Physical inconsistency: PM2.5 > PM10
    const isPmInconsistent =
      pm25Res.value !== null && pm10Res.value !== null && pm25Res.value > pm10Res.value;
    if (isPmInconsistent) {
      flags.push(`Inconsistent measurement: PM2.5 (${pm25Res.value} µg/m³) exceeds PM10 (${pm10Res.value} µg/m³)`);
    }

    // Duplicate check (same location + timestamp + PM2.5/PM10)
    const fp = `${locationName.toLowerCase()}|${rawDateStr.toLowerCase()}|${pm25Res.value}|${pm10Res.value}`;
    const isDuplicate = seenFingerprints.has(fp);
    seenFingerprints.add(fp);
    if (isDuplicate) {
      flags.push('Exact/near duplicate reading row');
    }

    // Sharp local drop check vs previous reading while co-pollutants remain high
    let isSharpDrop = false;
    const prev = prevByLocation.get(locationName.toLowerCase());
    if (
      prev &&
      prev.pm10 !== null &&
      prev.pm10 > 180 &&
      pm10Res.value !== null &&
      pm10Res.value < prev.pm10 * 0.3 &&
      ((coRes.value !== null && coRes.value >= 1.8) || (no2Res.value !== null && no2Res.value >= 65))
    ) {
      isSharpDrop = true;
      flags.push(
        `Abrupt PM10 drop (${prev.pm10} -> ${pm10Res.value} µg/m³) while CO/NO2 remain elevated — requires field verification`
      );
    }

    // Determine primary reliabilityStatus
    let reliabilityStatus: ReliabilityStatus = 'CLEAN';
    let excludeFromStatistics = false;

    if (anyNegative) {
      reliabilityStatus = 'NEGATIVE_VALUE_INVALID';
      excludeFromStatistics = true;
    } else if (isOutlier) {
      reliabilityStatus = 'OUTLIER_REQUIRES_VERIFICATION';
      excludeFromStatistics = true;
    } else if (isPmInconsistent) {
      reliabilityStatus = 'INCONSISTENT_MEASUREMENT_PM25_GT_PM10';
      excludeFromStatistics = true;
    } else if (isDuplicate) {
      reliabilityStatus = 'DUPLICATE_ROW';
      excludeFromStatistics = true;
    } else if (anyNonNumeric) {
      reliabilityStatus = 'NON_NUMERIC_CELL';
    } else if (isSharpDrop) {
      reliabilityStatus = 'SHARP_DROP_REQUIRES_VERIFICATION';
    } else if (anyConversionUnavailable) {
      reliabilityStatus = 'CONVERSION_UNAVAILABLE';
    } else if (anyMissing) {
      reliabilityStatus = 'MISSING_DATA_GAP';
    } else if (anyConverted) {
      reliabilityStatus = 'UNIT_CONVERTED';
    }

    if (reliabilityStatus === 'CLEAN') cleanRows++;
    if (anyConverted) convertedRows++;
    if (anyMissing) missingRows++;
    if (isDuplicate) duplicateRows++;
    if (
      excludeFromStatistics ||
      reliabilityStatus === 'NON_NUMERIC_CELL' ||
      reliabilityStatus === 'SHARP_DROP_REQUIRES_VERIFICATION' ||
      reliabilityStatus === 'CONVERSION_UNAVAILABLE'
    ) {
      unreliableRows++;
    }
    if (excludeFromStatistics) excludedRows++;

    const aqiRes = computeCpcbAqi({
      pm25: pm25Res.value,
      pm10: pm10Res.value,
      no2: no2Res.value,
      so2: so2Res.value,
      co: coRes.value,
      o3: o3Res.value,
    });

    const sourceInfo = inferSourceAndContraindication({
      pm25: pm25Res.value,
      pm10: pm10Res.value,
      no2: no2Res.value,
      so2: so2Res.value,
      co: coRes.value,
    });

    if (!excludeFromStatistics && aqiRes.aqi !== null && hour !== null) {
      const curr = hourlySum.get(hour) ?? { totalAqi: 0, count: 0 };
      curr.totalAqi += aqiRes.aqi;
      curr.count += 1;
      hourlySum.set(hour, curr);
    }

    const vulnerableZoneType = inferVulnerableZone(
      locationName,
      mapping.vulnerableZone ? rawRow[mapping.vulnerableZone] ?? '' : ''
    );

    readings.push({
      id: crypto.randomUUID(),
      batchId: params.batchId,
      rowIndex,
      exactRawCells: rawCells,
      locationName,
      wardZone,
      vulnerableZoneType,
      latitude: hasCoords ? latNum : null,
      longitude: hasCoords ? lngNum : null,
      coordinateConfidence: hasCoords ? 'IMPORTED_EXACT' : 'UNVERIFIED_MISSING',
      recordedAt,
      rawDateStr,
      pm25: pm25Res.value,
      pm10: pm10Res.value,
      no2: no2Res.value,
      so2: so2Res.value,
      co: coRes.value,
      o3: o3Res.value,
      rawValuesAndUnits,
      conversionFormulas,
      calculatedAqi: aqiRes.aqi,
      aqiCategory: aqiRes.category,
      alertLevel: aqiRes.alertLevel,
      dominantPollutant: aqiRes.dominantPollutant,
      pm25Pm10Ratio: sourceInfo.ratio,
      possibleSourcePattern: sourceInfo.sourcePattern,
      contraindicatedWarning: sourceInfo.warning,
      flags,
      reliabilityStatus,
      excludeFromStatistics,
      reviewHistory: [],
      createdAt: new Date().toISOString(),
    });
  });

  // Compute safe outdoor & peak danger hours from hourly averages
  let safestHour: number | null = null;
  let safestVal = Infinity;
  let peakHour: number | null = null;
  let peakVal = -Infinity;
  hourlySum.forEach((v, hr) => {
    const avg = v.totalAqi / v.count;
    if (avg < safestVal) {
      safestVal = avg;
      safestHour = hr;
    }
    if (avg > peakVal) {
      peakVal = avg;
      peakHour = hr;
    }
  });

  const formatHourRange = (hr: number | null) => {
    if (hr === null) return 'Insufficient hourly timestamps';
    const next = (hr + 2) % 24;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(hr)}:00–${pad(next)}:00`;
  };

  const totalRows = readings.length;
  const completenessPercent =
    totalRows === 0 ? 0 : Math.round(((totalRows - missingRows) / totalRows) * 100);

  const batch: BatchRecord = {
    id: params.batchId,
    title: sanitizeText(params.title),
    sourceType: params.sourceType,
    storagePath: params.storagePath,
    storageProvider: params.storageProvider,
    rawInputText: params.rawInputText,
    totalRows,
    cleanRows,
    convertedRows,
    missingRows,
    unreliableRows,
    duplicateRows,
    excludedRows,
    completenessPercent,
    safestOutdoorWindow: formatHourRange(safestHour),
    peakDangerWindow: formatHourRange(peakHour),
    windowVentilationAdvice:
      safestHour !== null && peakHour !== null
        ? `Lowest observed average AQI near ${formatHourRange(safestHour)}; keep windows sealed during peak window ${formatHourRange(peakHour)}.`
        : 'Insufficient timestamped readings to isolate safe ventilation hours.',
    isTestFixture: Boolean(params.isTestFixture),
    fixtureLabel: params.fixtureLabel,
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
  };

  return { batch, readings };
}

export function computeAreaTrajectories(
  currentReadings: ReadingRecord[],
  previousReadings: ReadingRecord[]
): AreaTrajectoryRecord[] {
  const prevMap = new Map<string, { aqis: number[]; zone: string; vuln: VulnerableZoneType }>();
  previousReadings.forEach((r) => {
    if (r.excludeFromStatistics || r.calculatedAqi === null) return;
    const key = r.locationName.toLowerCase();
    const curr = prevMap.get(key) ?? { aqis: [], zone: r.wardZone, vuln: r.vulnerableZoneType };
    curr.aqis.push(r.calculatedAqi);
    prevMap.set(key, curr);
  });

  const currentByLoc = new Map<string, ReadingRecord[]>();
  currentReadings.forEach((r) => {
    const key = r.locationName.toLowerCase();
    const list = currentByLoc.get(key) ?? [];
    list.push(r);
    currentByLoc.set(key, list);
  });

  const trajectories: AreaTrajectoryRecord[] = [];
  currentByLoc.forEach((rows) => {
    const first = rows[0];
    const validRows = rows.filter((r) => !r.excludeFromStatistics && r.calculatedAqi !== null);
    const citedRowNumbers = rows.map((r) => r.rowIndex);
    const dataLimitations: string[] = [];
    rows.forEach((r) => {
      if (r.flags.length > 0) {
        dataLimitations.push(`Row #${r.rowIndex}: ${r.flags[0]}`);
      }
    });

    const currentAqi =
      validRows.length > 0
        ? Math.round(validRows.reduce((s, r) => s + (r.calculatedAqi ?? 0), 0) / validRows.length)
        : null;

    const prevEntry = prevMap.get(first.locationName.toLowerCase());
    const previousAqi =
      prevEntry && prevEntry.aqis.length > 0
        ? Math.round(prevEntry.aqis.reduce((s, v) => s + v, 0) / prevEntry.aqis.length)
        : null;

    const aqiDelta = currentAqi !== null && previousAqi !== null ? currentAqi - previousAqi : null;
    // Assume ~24h comparison window if timestamps unavailable, or compute actual hours
    const rateOfChangePerHr = aqiDelta !== null ? Number((aqiDelta / 24).toFixed(2)) : null;

    let shortTermProjection24h: number | null = null;
    let projectionConfidence: AreaTrajectoryRecord['projectionConfidence'] = 'LOW_INSUFFICIENT_HISTORY';
    let projectionNote = 'Insufficient comparable history for short-term data projection.';
    let forecastTrend: AreaTrajectoryRecord['forecastTrend'] = 'INSUFFICIENT_DATA';

    if (currentAqi !== null && aqiDelta !== null) {
      // Damped linear continuation (0.65 damping factor)
      shortTermProjection24h = Math.max(20, Math.min(500, Math.round(currentAqi + aqiDelta * 0.65)));
      projectionConfidence = validRows.length >= 2 ? 'HIGH' : 'MODERATE';
      projectionNote = 'Short-term data projection — not a guaranteed forecast (damped trend from previous period).';
      if (currentAqi < 301 && shortTermProjection24h >= 301) {
        forecastTrend = 'RISING_TO_RED_ALERT';
      } else if (aqiDelta > 15) {
        forecastTrend = 'WORSENING';
      } else if (aqiDelta < -15) {
        forecastTrend = 'IMPROVING';
      } else {
        forecastTrend = 'STABLE';
      }
    } else if (currentAqi !== null) {
      forecastTrend = 'STABLE';
      projectionNote = 'Baseline reading only; import a subsequent batch for short-term data projection.';
    }

    const vulnWeight =
      first.vulnerableZoneType === 'SCHOOL_ZONE'
        ? 1.35
        : first.vulnerableZoneType === 'SENIOR_PARK_HOSPITAL'
        ? 1.3
        : first.vulnerableZoneType === 'RESIDENTIAL_RWA'
        ? 1.15
        : 1.0;

    const isRedZoneNow = currentAqi !== null && currentAqi >= 301;
    const approachingRedZoneAlert =
      currentAqi !== null && currentAqi < 301 && shortTermProjection24h !== null && shortTermProjection24h >= 301;

    let earlyWarningAlert: string | null = null;
    if (isRedZoneNow) {
      earlyWarningAlert = `ACTIVE RED ZONE (AQI ${currentAqi}) — immediate protective measures advised.`;
    } else if (approachingRedZoneAlert) {
      earlyWarningAlert = `Approaching Red Zone (${currentAqi} -> projected ${shortTermProjection24h} within 24h) — preventive action recommended.`;
    }

    trajectories.push({
      id: crypto.randomUUID(),
      batchId: first.batchId,
      locationName: first.locationName,
      wardZone: first.wardZone,
      vulnerableZoneType: first.vulnerableZoneType,
      vulnerablePriorityWeight: vulnWeight,
      previousAqi,
      currentAqi,
      aqiDelta,
      rateOfChangePerHr,
      shortTermProjection24h,
      projectionConfidence,
      projectionNote,
      forecastTrend,
      isRedZoneNow,
      approachingRedZoneAlert,
      earlyWarningAlert,
      dataLimitations,
      citedRowNumbers,
    });
  });

  trajectories.sort((a, b) => (b.currentAqi ?? -1) - (a.currentAqi ?? -1));
  return trajectories;
}

export function optimizeFieldResources(params: {
  trajectories: AreaTrajectoryRecord[];
  readings: ReadingRecord[];
  waterSprinklers: number;
  enforcementSquads: number;
  trafficMarshals: number;
  patrolTeams: number;
}): ResourceAllocationStop[] {
  const readingsByLoc = new Map<string, ReadingRecord[]>();
  params.readings.forEach((r) => {
    const key = r.locationName.toLowerCase();
    const list = readingsByLoc.get(key) ?? [];
    list.push(r);
    readingsByLoc.set(key, list);
  });

  const ranked = params.trajectories
    .filter((t) => t.currentAqi !== null && t.currentAqi >= 101)
    .map((t) => {
      const trajMult = t.approachingRedZoneAlert || (t.aqiDelta ?? 0) > 25 ? 1.25 : 1.0;
      const score = Math.round((t.currentAqi ?? 0) * trajMult * t.vulnerablePriorityWeight);
      return { trajectory: t, score };
    })
    .sort((a, b) => b.score - a.score);

  const schedule: ResourceAllocationStop[] = [];
  let sprinklerIdx = 0;
  let squadIdx = 0;
  let marshalIdx = 0;
  let patrolIdx = 0;
  const slots = ['07:00–09:30', '09:30–12:00', '14:00–16:30', '16:30–19:00'];

  ranked.forEach((item, idx) => {
    const t = item.trajectory;
    const locReadings = readingsByLoc.get(t.locationName.toLowerCase()) ?? [];
    const fineSmokeContraindicated = locReadings.some((r) => Boolean(r.contraindicatedWarning));
    const hasTrafficSignal = locReadings.some((r) => (r.no2 ?? 0) >= 75 || (r.co ?? 0) >= 2.0);
    const hasCoarseDust = locReadings.some((r) => r.pm25Pm10Ratio !== null && r.pm25Pm10Ratio <= 0.55);

    let assignedResource: ResourceAllocationStop['assignedResourceType'] | null = null;
    let unitNumber = 1;
    let instruction = '';
    let contraindicationSkipped: string | null = null;

    if (!fineSmokeContraindicated && hasCoarseDust && sprinklerIdx < params.waterSprinklers) {
      sprinklerIdx++;
      assignedResource = 'WATER_SPRINKLER';
      unitNumber = sprinklerIdx;
      instruction = `Wet sweeping & road-dust suppression along unpaved shoulders near ${t.locationName}.`;
    } else if (fineSmokeContraindicated && params.waterSprinklers > 0) {
      contraindicationSkipped =
        'Water Sprinkler skipped per action policy: high fine-smoke ratio (PM2.5/PM10 >= 0.68) makes misting counter-productive.';
      if (squadIdx < params.enforcementSquads) {
        squadIdx++;
        assignedResource = 'ENFORCEMENT_SQUAD';
        unitNumber = squadIdx;
        instruction = `Inspect & halt open biomass/waste burning or DG exhaust near ${t.locationName}.`;
      } else if (patrolIdx < params.patrolTeams) {
        patrolIdx++;
        assignedResource = 'PATROL_TEAM';
        unitNumber = patrolIdx;
        instruction = `Ground patrol for smoke source identification and compliance check around ${t.locationName}.`;
      }
    } else if (hasTrafficSignal && marshalIdx < params.trafficMarshals) {
      marshalIdx++;
      assignedResource = 'TRAFFIC_MARSHAL';
      unitNumber = marshalIdx;
      instruction = `Enforce no-idling zone and decongest peak traffic bottleneck at ${t.locationName}.`;
    } else if (squadIdx < params.enforcementSquads) {
      squadIdx++;
      assignedResource = 'ENFORCEMENT_SQUAD';
      unitNumber = squadIdx;
      instruction = `Verify construction dust tarpaulins and generator compliance at ${t.locationName}.`;
    } else if (patrolIdx < params.patrolTeams) {
      patrolIdx++;
      assignedResource = 'PATROL_TEAM';
      unitNumber = patrolIdx;
      instruction = `Field verification & vulnerable-zone perimeter inspection at ${t.locationName}.`;
    }

    if (assignedResource) {
      schedule.push({
        priorityRank: schedule.length + 1,
        locationName: t.locationName,
        wardZone: t.wardZone,
        vulnerableZoneType: t.vulnerableZoneType,
        currentAqi: t.currentAqi,
        projection24h: t.shortTermProjection24h,
        priorityScore: item.score,
        assignedResourceType: assignedResource,
        unitNumber,
        timeSlot: slots[idx % slots.length],
        actionPolicyInstruction: instruction,
        contraindicationSkipped,
        citedRows: t.citedRowNumbers,
      });
    }
  });

  return schedule;
}

export function computeOutcomeScorecard(
  trajectories: AreaTrajectoryRecord[],
  tasks: { locationName: string; title: string; status: string }[]
): OutcomeComparisonEntry[] {
  const entries: OutcomeComparisonEntry[] = [];
  const trajMap = new Map<string, AreaTrajectoryRecord>();
  trajectories.forEach((t) => trajMap.set(t.locationName.toLowerCase(), t));

  tasks.forEach((task) => {
    const t = trajMap.get(task.locationName.toLowerCase());
    if (!t || t.previousAqi === null || t.currentAqi === null) return;
    const delta = t.currentAqi - t.previousAqi;
    const isCompleted = task.status === 'COMPLETED';
    entries.push({
      locationName: t.locationName,
      wardZone: t.wardZone,
      previousAqi: t.previousAqi,
      currentAqi: t.currentAqi,
      aqiDelta: delta,
      taskTitle: task.title,
      taskStatus: task.status as OutcomeComparisonEntry['taskStatus'],
      outcomeCategory: isCompleted ? 'COMPLETED_TASK_AREA' : 'PENDING_TASK_AREA',
      summary: isCompleted
        ? `${t.locationName}: AQI moved ${t.previousAqi} -> ${t.currentAqi} (${delta >= 0 ? `+${delta}` : delta}) after task completion.`
        : `${t.locationName}: AQI moved ${t.previousAqi} -> ${t.currentAqi} (${delta >= 0 ? `+${delta}` : delta}) while task remained ${task.status}.`,
      scientificDisclaimer:
        'Observed change after task completion. This reflects measured data change and does not alone prove single-factor causation.',
    });
  });

  return entries;
}

export function recomputeBatchStats(batch: BatchRecord, readings: ReadingRecord[]): BatchRecord {
  let cleanRows = 0;
  let convertedRows = 0;
  let missingRows = 0;
  let unreliableRows = 0;
  let duplicateRows = 0;
  let excludedRows = 0;
  readings.forEach((r) => {
    if (r.reliabilityStatus === 'CLEAN') cleanRows++;
    if (r.conversionFormulas.length > 0) convertedRows++;
    if (r.reliabilityStatus === 'MISSING_DATA_GAP') missingRows++;
    if (r.reliabilityStatus === 'DUPLICATE_ROW') duplicateRows++;
    if (r.excludeFromStatistics) excludedRows++;
    if (
      r.excludeFromStatistics ||
      r.reliabilityStatus === 'NON_NUMERIC_CELL' ||
      r.reliabilityStatus === 'SHARP_DROP_REQUIRES_VERIFICATION' ||
      r.reliabilityStatus === 'CONVERSION_UNAVAILABLE'
    ) {
      unreliableRows++;
    }
  });
  const totalRows = readings.length;
  const completenessPercent =
    totalRows === 0 ? 0 : Math.round(((totalRows - missingRows) / totalRows) * 100);
  return {
    ...batch,
    totalRows,
    cleanRows,
    convertedRows,
    missingRows,
    unreliableRows,
    duplicateRows,
    excludedRows,
    completenessPercent,
  };
}

export function buildDeterministicBriefingFallbackContext(
  readings: ReadingRecord[],
  trajectories: AreaTrajectoryRecord[],
  previousBrief: BriefingRecord | null
) {
  const valid = readings.filter((r) => !r.excludeFromStatistics && r.calculatedAqi !== null);
  const avgAqi =
    valid.length > 0 ? Math.round(valid.reduce((s, r) => s + (r.calculatedAqi ?? 0), 0) / valid.length) : null;
  return {
    totalRows: readings.length,
    eligibleRows: valid.length,
    averageAqi: avgAqi,
    redZonesNow: trajectories.filter((t) => t.isRedZoneNow).map((t) => t.locationName),
    approachingRedZones: trajectories.filter((t) => t.approachingRedZoneAlert).map((t) => t.locationName),
    previousBriefCode: previousBrief?.briefingCode ?? null,
  };
}

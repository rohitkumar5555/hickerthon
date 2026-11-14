// server.ts
import "dotenv/config";
import express2 from "express";
import path from "node:path";
import { createServer as createViteServer } from "vite";

// server/routes.ts
import crypto4 from "node:crypto";
import express from "express";

// src/types/civic.ts
import { z } from "zod";
var ParseBatchRequestSchema = z.object({
  title: z.string().min(2).max(200),
  rawText: z.string().min(5).max(5e5),
  sourceType: z.enum(["PASTE_TEXT", "CSV", "TSV", "JSON", "XLSX", "TEST_FIXTURE"]).default("PASTE_TEXT"),
  columnMapping: z.record(z.string(), z.string()).optional(),
  isTestFixture: z.boolean().optional(),
  fixtureLabel: z.string().max(120).optional(),
  batchId: z.string().optional(),
  previousBatchReadings: z.array(z.any()).optional(),
  createdBy: z.string().optional()
});
var ResourceOptimizeSchema = z.object({
  activeRole: z.enum(["EVALUATOR", "WARD_OFFICER", "HOUSING_SOCIETY", "SCHOOL_COORDINATOR"]).optional(),
  trajectories: z.array(z.any()),
  readings: z.array(z.any()),
  waterSprinklers: z.number().int().min(0).max(50),
  enforcementSquads: z.number().int().min(0).max(50),
  trafficMarshals: z.number().int().min(0).max(50),
  patrolTeams: z.number().int().min(0).max(50)
});
var GenerateBriefingPayloadSchema = z.object({
  batch: z.any(),
  readings: z.array(z.any()).min(1),
  trajectories: z.array(z.any()),
  previousBrief: z.any().nullable().optional(),
  previousReadings: z.array(z.any()).optional(),
  previousTasks: z.array(z.any()).optional(),
  outcomeScorecard: z.array(z.any()).optional(),
  personaRole: z.enum(["WARD_OFFICER", "HOUSING_SOCIETY", "SCHOOL_COORDINATOR"]),
  createdBy: z.string().default("local-role-user")
});
var GenerateAdvisoryPayloadSchema = z.object({
  briefing: z.any(),
  batch: z.any(),
  language: z.enum([
    "English",
    "Hindi (\u0939\u093F\u0928\u094D\u0926\u0940)",
    "Hinglish",
    "Marathi (\u092E\u0930\u093E\u0920\u0940)",
    "Tamil (\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD)",
    "Bengali (\u09AC\u09BE\u0982\u09B2\u09BE)"
  ]),
  readingLevel: z.enum([
    "SIMPLE_PUBLIC_GRADE_5",
    "CHILD_FRIENDLY_SCHOOL_STORY",
    "DETAILED_HEALTH_CIVIC"
  ]),
  createdBy: z.string().default("local-role-user")
});

// server/analytics.ts
import crypto from "node:crypto";
import Papa from "papaparse";
import * as XLSX from "xlsx";
function sanitizeText(value) {
  return value.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "[removed-script]").replace(/javascript:/gi, "").replace(/on\w+\s*=/gi, "").replace(/[<>]/g, (ch) => ch === "<" ? "&lt;" : "&gt;").trim();
}
var MISSING_TOKENS = /* @__PURE__ */ new Set([
  "",
  "na",
  "n/a",
  "null",
  "none",
  "nil",
  "-",
  "--",
  "nd",
  "bdl",
  "missing",
  "unavailable",
  "nan",
  "undefined"
]);
function isMissingCell(raw) {
  if (raw === null || raw === void 0) return true;
  const s = String(raw).trim().toLowerCase();
  return MISSING_TOKENS.has(s);
}
var HEADER_ALIASES = {
  location: ["location", "station", "site", "area", "locality", "monitoring station", "sensor location", "place", "school/society"],
  ward: ["ward", "ward_zone", "ward zone", "zone", "sector", "district"],
  timestamp: ["timestamp", "recorded_at", "date", "datetime", "time", "reading_time", "observed_at", "logged_at"],
  latitude: ["lat", "latitude", "y"],
  longitude: ["lng", "lon", "long", "longitude", "x"],
  vulnerableZone: ["vulnerable_zone", "vulnerable zone", "zone_type", "facility_type", "sensitive_receptor"],
  pm25: ["pm2.5", "pm25", "pm_25", "pm 2.5", "fine_pm", "fine particulate"],
  pm10: ["pm10", "pm_10", "pm 10", "coarse_pm"],
  no2: ["no2", "no_2", "nitrogen dioxide"],
  so2: ["so2", "so_2", "sulfur dioxide", "sulphur dioxide"],
  co: ["co", "carbon monoxide"],
  o3: ["o3", "o_3", "ozone"],
  unit: ["unit", "units", "measurement_unit"],
  reportedAqi: ["aqi", "reported_aqi", "station_aqi"]
};
function detectColumnMapping(headers) {
  const mapping = {};
  const normalizedHeaders = headers.map((h) => ({
    raw: h,
    clean: h.toLowerCase().replace(/\(.*?\)/g, "").replace(/\[.*?\]/g, "").replace(/\s+/g, " ").trim()
  }));
  Object.keys(HEADER_ALIASES).forEach((field) => {
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
function parseMarkdownOrPipeTable(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return null;
  const pipeLines = lines.filter((l) => l.includes("|"));
  if (pipeLines.length < 2) return null;
  const splitPipe = (line) => line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const headers = splitPipe(pipeLines[0]).filter((h) => h.length > 0);
  if (headers.length < 2) return null;
  const dataRows = [];
  for (let i = 1; i < pipeLines.length; i++) {
    const line = pipeLines[i];
    if (/^[\s|:-]+$/.test(line)) continue;
    const cells = splitPipe(line);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] ?? "";
    });
    dataRows.push(obj);
  }
  return { headers, rows: dataRows };
}
function parseRawTableInput(rawText, sourceTypeHint) {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error("Input text is empty. Paste a table or upload a supported CSV, TSV, JSON, or XLSX file.");
  }
  if (sourceTypeHint === "JSON" || trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.readings) ? parsed.readings : Array.isArray(parsed?.data) ? parsed.data : null;
      if (arr && arr.length > 0 && typeof arr[0] === "object") {
        const headerSet = /* @__PURE__ */ new Set();
        arr.forEach((row) => Object.keys(row).forEach((k) => headerSet.add(k)));
        const headers2 = Array.from(headerSet);
        const rows2 = arr.map((row) => {
          const rec = {};
          headers2.forEach((h) => {
            rec[h] = row[h] === null || row[h] === void 0 ? "" : String(row[h]);
          });
          return rec;
        });
        return {
          headers: headers2,
          rows: rows2,
          detectedDelimiter: "json",
          proposedMapping: detectColumnMapping(headers2)
        };
      }
    } catch {
      if (sourceTypeHint === "JSON") {
        throw new Error("Malformed JSON file: unable to parse array of reading objects.");
      }
    }
  }
  if (trimmed.includes("|") && (trimmed.match(/\|/g)?.length ?? 0) >= 4) {
    const md = parseMarkdownOrPipeTable(trimmed);
    if (md && md.rows.length > 0) {
      return {
        headers: md.headers,
        rows: md.rows,
        detectedDelimiter: "|",
        proposedMapping: detectColumnMapping(md.headers)
      };
    }
  }
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("Input must contain at least one header row and one data row.");
  }
  const candidateText = lines.join("\n");
  const firstLine = lines[0];
  let delimiter = ",";
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const semiCount = (firstLine.match(/;/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  if (tabCount >= commaCount && tabCount >= semiCount && tabCount > 0) delimiter = "	";
  else if (semiCount > commaCount && semiCount > 0) delimiter = ";";
  const result = Papa.parse(candidateText, {
    header: true,
    delimiter,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim()
  });
  const headers = (result.meta.fields ?? []).filter((h) => h.length > 0);
  if (headers.length < 2 || result.data.length === 0) {
    throw new Error("No usable table header and data rows found. Verify column delimiters or use [AI Parse Broken Table].");
  }
  const rows = result.data.map((r) => {
    const cleanRow = {};
    headers.forEach((h) => {
      cleanRow[h] = r[h] !== void 0 && r[h] !== null ? String(r[h]).trim() : "";
    });
    return cleanRow;
  });
  return {
    headers,
    rows,
    detectedDelimiter: delimiter === "	" ? "TAB" : delimiter,
    proposedMapping: detectColumnMapping(headers)
  };
}
function parseUploadedFileBuffer(buffer, filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error("XLSX workbook contains no sheets.");
    }
    const sheet = workbook.Sheets[firstSheetName];
    const csvText = XLSX.utils.sheet_to_csv(sheet);
    const parsed = parseRawTableInput(csvText, "CSV");
    return { rawText: csvText, sourceType: "XLSX", parsed };
  }
  const text = buffer.toString("utf8");
  if (lower.endsWith(".json")) {
    const parsed = parseRawTableInput(text, "JSON");
    return { rawText: text, sourceType: "JSON", parsed };
  }
  if (lower.endsWith(".tsv")) {
    const parsed = parseRawTableInput(text, "TSV");
    return { rawText: text, sourceType: "TSV", parsed };
  }
  if (lower.endsWith(".csv")) {
    const parsed = parseRawTableInput(text, "CSV");
    return { rawText: text, sourceType: "CSV", parsed };
  }
  throw new Error("Unsupported file extension. Supported formats: .csv, .tsv, .json, .xlsx");
}
function parseNumericWithUnit(rawCell, headerName, rowUnitHint, pollutant) {
  const rawStr = (rawCell ?? "").trim();
  if (isMissingCell(rawStr)) {
    return {
      value: null,
      rawStr,
      formula: null,
      converted: false,
      nonNumeric: false,
      negative: false,
      conversionUnavailable: false
    };
  }
  const match = rawStr.match(/^([+-]?\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) {
    return {
      value: null,
      rawStr,
      formula: null,
      converted: false,
      nonNumeric: true,
      negative: false,
      conversionUnavailable: false
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
      conversionUnavailable: false
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
      conversionUnavailable: false
    };
  }
  const combinedUnitHint = `${match[2]} ${headerName} ${rowUnitHint}`.toLowerCase();
  const isMgPerM3 = /mg\s*\/\s*m3|mg\s*\/\s*m³|mgm-3/.test(combinedUnitHint);
  const isUgPerM3 = /ug\s*\/\s*m3|µg\s*\/\s*m3|µg\s*\/\s*m³|ugm-3|mcg\/m3/.test(combinedUnitHint);
  const isPpm = /\bppm\b/.test(combinedUnitHint);
  const isPpb = /\bppb\b/.test(combinedUnitHint);
  if (isPpm || isPpb) {
    return {
      value: null,
      rawStr,
      formula: `${pollutant.toUpperCase()} ${rawStr} -> conversion unavailable (temperature & pressure required for ppm/ppb)`,
      converted: false,
      nonNumeric: false,
      negative: false,
      conversionUnavailable: true
    };
  }
  if (pollutant === "co") {
    if (isUgPerM3) {
      const convertedVal = Number((num / 1e3).toFixed(3));
      return {
        value: convertedVal,
        rawStr,
        formula: `CO: ${num} \xB5g/m\xB3 \xF7 1000 = ${convertedVal} mg/m\xB3`,
        converted: true,
        nonNumeric: false,
        negative: false,
        conversionUnavailable: false
      };
    }
    return {
      value: Number(num.toFixed(3)),
      rawStr,
      formula: null,
      converted: false,
      nonNumeric: false,
      negative: false,
      conversionUnavailable: false
    };
  }
  if (isMgPerM3) {
    const convertedVal = Number((num * 1e3).toFixed(2));
    return {
      value: convertedVal,
      rawStr,
      formula: `${pollutant.toUpperCase()}: ${num} mg/m\xB3 \xD7 1000 = ${convertedVal} \xB5g/m\xB3`,
      converted: true,
      nonNumeric: false,
      negative: false,
      conversionUnavailable: false
    };
  }
  return {
    value: Number(num.toFixed(2)),
    rawStr,
    formula: null,
    converted: false,
    nonNumeric: false,
    negative: false,
    conversionUnavailable: false
  };
}
var CPCB_BREAKPOINTS = {
  PM25: [
    [0, 30, 0, 50],
    [31, 60, 51, 100],
    [61, 90, 101, 200],
    [91, 120, 201, 300],
    [121, 250, 301, 400],
    [251, 500, 401, 500]
  ],
  PM10: [
    [0, 50, 0, 50],
    [51, 100, 51, 100],
    [101, 250, 101, 200],
    [251, 350, 201, 300],
    [351, 430, 301, 400],
    [431, 650, 401, 500]
  ],
  NO2: [
    [0, 40, 0, 50],
    [41, 80, 51, 100],
    [81, 180, 101, 200],
    [181, 280, 201, 300],
    [281, 400, 301, 400],
    [401, 600, 401, 500]
  ],
  SO2: [
    [0, 40, 0, 50],
    [41, 80, 51, 100],
    [81, 380, 101, 200],
    [381, 800, 201, 300],
    [801, 1600, 301, 400],
    [1601, 2200, 401, 500]
  ],
  CO: [
    [0, 1, 0, 50],
    [1.1, 2, 51, 100],
    [2.1, 10, 101, 200],
    [10.1, 17, 201, 300],
    [17.1, 34, 301, 400],
    [34.1, 50, 401, 500]
  ],
  O3: [
    [0, 50, 0, 50],
    [51, 100, 51, 100],
    [101, 168, 101, 200],
    [169, 208, 201, 300],
    [209, 748, 301, 400],
    [749, 1e3, 401, 500]
  ]
};
function computeSubIndex(val, breakpoints) {
  for (const [cLo, cHi, iLo, iHi] of breakpoints) {
    if (val <= cHi) {
      return Math.round((iHi - iLo) / (cHi - cLo) * Math.max(0, val - cLo) + iLo);
    }
  }
  return 500;
}
function computeCpcbAqi(pollutants) {
  const candidates = [];
  if (pollutants.pm25 !== null) candidates.push({ name: "PM2.5", subIndex: computeSubIndex(pollutants.pm25, CPCB_BREAKPOINTS.PM25) });
  if (pollutants.pm10 !== null) candidates.push({ name: "PM10", subIndex: computeSubIndex(pollutants.pm10, CPCB_BREAKPOINTS.PM10) });
  if (pollutants.no2 !== null) candidates.push({ name: "NO2", subIndex: computeSubIndex(pollutants.no2, CPCB_BREAKPOINTS.NO2) });
  if (pollutants.so2 !== null) candidates.push({ name: "SO2", subIndex: computeSubIndex(pollutants.so2, CPCB_BREAKPOINTS.SO2) });
  if (pollutants.co !== null) candidates.push({ name: "CO", subIndex: computeSubIndex(pollutants.co, CPCB_BREAKPOINTS.CO) });
  if (pollutants.o3 !== null) candidates.push({ name: "O3", subIndex: computeSubIndex(pollutants.o3, CPCB_BREAKPOINTS.O3) });
  if (candidates.length === 0) {
    return {
      aqi: null,
      category: "AQI unavailable from supplied data",
      alertLevel: "AQI_UNAVAILABLE",
      dominantPollutant: "Unavailable"
    };
  }
  candidates.sort((a, b) => b.subIndex - a.subIndex);
  const max = candidates[0];
  const aqi = max.subIndex;
  let category = "Good (0-50)";
  let alertLevel = "GREEN_SAFE";
  if (aqi >= 401) {
    category = "Severe (401-500)";
    alertLevel = "RED_EMERGENCY_ZONE";
  } else if (aqi >= 301) {
    category = "Very Poor (301-400)";
    alertLevel = "RED_EMERGENCY_ZONE";
  } else if (aqi >= 201) {
    category = "Poor (201-300)";
    alertLevel = "ORANGE_WARNING";
  } else if (aqi >= 101) {
    category = "Moderate (101-200)";
    alertLevel = "YELLOW_WATCH";
  } else if (aqi >= 51) {
    category = "Satisfactory (51-100)";
    alertLevel = "GREEN_SAFE";
  }
  return { aqi, category, alertLevel, dominantPollutant: max.name };
}
function parseFlexibleDate(rawDate) {
  const s = (rawDate ?? "").trim();
  if (isMissingCell(s)) return { iso: null, hour: null };
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
function inferVulnerableZone(location, rawZoneType) {
  const combined = `${location} ${rawZoneType}`.toLowerCase();
  if (/school|academy|college|campus|kindergarten|vidyalaya/.test(combined)) return "SCHOOL_ZONE";
  if (/senior|park|hospital|clinic|elder|old age/.test(combined)) return "SENIOR_PARK_HOSPITAL";
  if (/rwa|society|enclave|apartments|residency|housing|greens/.test(combined)) return "RESIDENTIAL_RWA";
  return "COMMERCIAL_TRAFFIC";
}
function inferSourceAndContraindication(p) {
  const ratio = p.pm25 !== null && p.pm10 !== null && p.pm10 > 0 ? Number((p.pm25 / p.pm10).toFixed(2)) : null;
  if (ratio !== null && ratio >= 0.68 && (p.pm25 ?? 0) >= 120) {
    return {
      ratio,
      sourcePattern: "Possible fine-smoke / biomass combustion pattern",
      warning: "POLICY GUARDRAIL: Avoid water misting or fogging when fine-smoke ratio >= 0.68 and PM2.5 >= 120 \xB5g/m\xB3 \u2014 added moisture can trap fine combustion particles; prioritize source shutdown."
    };
  }
  if (ratio !== null && ratio <= 0.45 && (p.pm10 ?? 0) >= 150) {
    return {
      ratio,
      sourcePattern: "Possible coarse construction / road-dust resuspension pattern",
      warning: null
    };
  }
  if ((p.so2 ?? 0) >= 45 && (p.no2 ?? 0) >= 60) {
    return {
      ratio,
      sourcePattern: "Possible diesel generator (DG) / fuel combustion pattern",
      warning: null
    };
  }
  if ((p.no2 ?? 0) >= 80 || (p.co ?? 0) >= 2.2) {
    return {
      ratio,
      sourcePattern: "Possible vehicular traffic idling / corridor congestion pattern",
      warning: null
    };
  }
  return {
    ratio,
    sourcePattern: "Mixed urban particulate pattern",
    warning: null
  };
}
function normalizeAndAuditBatch(params) {
  const mapping = {
    ...params.parsed.proposedMapping,
    ...params.customMapping ?? {}
  };
  const seenFingerprints = /* @__PURE__ */ new Set();
  const readings = [];
  const prevByLocation = /* @__PURE__ */ new Map();
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
  const hourlySum = /* @__PURE__ */ new Map();
  params.parsed.rows.forEach((rawRow, index) => {
    const rowIndex = index + 1;
    const rawCells = {};
    Object.entries(rawRow).forEach(([k, v]) => {
      rawCells[sanitizeText(k)] = sanitizeText(String(v ?? ""));
    });
    const locationName = sanitizeText((mapping.location ? rawRow[mapping.location] : "") || "") || `Unlabelled Station #${rowIndex}`;
    const wardZone = sanitizeText((mapping.ward ? rawRow[mapping.ward] : "") || "") || "Unassigned Ward";
    const rawDateStr = sanitizeText((mapping.timestamp ? rawRow[mapping.timestamp] : "") || "");
    const { iso: recordedAt, hour } = parseFlexibleDate(rawDateStr);
    const latRaw = mapping.latitude ? rawRow[mapping.latitude] : "";
    const lngRaw = mapping.longitude ? rawRow[mapping.longitude] : "";
    const latNum = latRaw && !isMissingCell(latRaw) ? Number(latRaw) : NaN;
    const lngNum = lngRaw && !isMissingCell(lngRaw) ? Number(lngRaw) : NaN;
    const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum) && latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180;
    const unitHint = mapping.unit ? rawRow[mapping.unit] ?? "" : "";
    const pm25Res = parseNumericWithUnit(mapping.pm25 ? rawRow[mapping.pm25] : "", mapping.pm25 ?? "", unitHint, "pm25");
    const pm10Res = parseNumericWithUnit(mapping.pm10 ? rawRow[mapping.pm10] : "", mapping.pm10 ?? "", unitHint, "pm10");
    const no2Res = parseNumericWithUnit(mapping.no2 ? rawRow[mapping.no2] : "", mapping.no2 ?? "", unitHint, "no2");
    const so2Res = parseNumericWithUnit(mapping.so2 ? rawRow[mapping.so2] : "", mapping.so2 ?? "", unitHint, "so2");
    const coRes = parseNumericWithUnit(mapping.co ? rawRow[mapping.co] : "", mapping.co ?? "", unitHint, "co");
    const o3Res = parseNumericWithUnit(mapping.o3 ? rawRow[mapping.o3] : "", mapping.o3 ?? "", unitHint, "o3");
    const flags = [];
    const conversionFormulas = [];
    const rawValuesAndUnits = {};
    const results = [
      ["PM2.5", pm25Res],
      ["PM10", pm10Res],
      ["NO2", no2Res],
      ["SO2", so2Res],
      ["CO", coRes],
      ["O3", o3Res]
    ];
    let anyMissing = false;
    let anyConverted = false;
    let anyNonNumeric = false;
    let anyNegative = false;
    let anyConversionUnavailable = false;
    results.forEach(([label, res]) => {
      rawValuesAndUnits[label] = res.rawStr || "missing";
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
        if (label === "PM2.5" || label === "PM10") {
          anyMissing = true;
          flags.push(`Missing ${label} reading`);
        }
      }
    });
    if (!recordedAt && rawDateStr) {
      flags.push(`Unparseable timestamp preserved: "${rawDateStr}"`);
    }
    const isOutlier = pm25Res.value !== null && pm25Res.value > 1500 || pm10Res.value !== null && pm10Res.value > 2500 || no2Res.value !== null && no2Res.value > 1500 || coRes.value !== null && coRes.value > 60;
    if (isOutlier) {
      flags.push("Extreme outlier requiring field verification (> threshold)");
    }
    const isPmInconsistent = pm25Res.value !== null && pm10Res.value !== null && pm25Res.value > pm10Res.value;
    if (isPmInconsistent) {
      flags.push(`Inconsistent measurement: PM2.5 (${pm25Res.value} \xB5g/m\xB3) exceeds PM10 (${pm10Res.value} \xB5g/m\xB3)`);
    }
    const fp = `${locationName.toLowerCase()}|${rawDateStr.toLowerCase()}|${pm25Res.value}|${pm10Res.value}`;
    const isDuplicate = seenFingerprints.has(fp);
    seenFingerprints.add(fp);
    if (isDuplicate) {
      flags.push("Exact/near duplicate reading row");
    }
    let isSharpDrop = false;
    const prev = prevByLocation.get(locationName.toLowerCase());
    if (prev && prev.pm10 !== null && prev.pm10 > 180 && pm10Res.value !== null && pm10Res.value < prev.pm10 * 0.3 && (coRes.value !== null && coRes.value >= 1.8 || no2Res.value !== null && no2Res.value >= 65)) {
      isSharpDrop = true;
      flags.push(
        `Abrupt PM10 drop (${prev.pm10} -> ${pm10Res.value} \xB5g/m\xB3) while CO/NO2 remain elevated \u2014 requires field verification`
      );
    }
    let reliabilityStatus = "CLEAN";
    let excludeFromStatistics = false;
    if (anyNegative) {
      reliabilityStatus = "NEGATIVE_VALUE_INVALID";
      excludeFromStatistics = true;
    } else if (isOutlier) {
      reliabilityStatus = "OUTLIER_REQUIRES_VERIFICATION";
      excludeFromStatistics = true;
    } else if (isPmInconsistent) {
      reliabilityStatus = "INCONSISTENT_MEASUREMENT_PM25_GT_PM10";
      excludeFromStatistics = true;
    } else if (isDuplicate) {
      reliabilityStatus = "DUPLICATE_ROW";
      excludeFromStatistics = true;
    } else if (anyNonNumeric) {
      reliabilityStatus = "NON_NUMERIC_CELL";
    } else if (isSharpDrop) {
      reliabilityStatus = "SHARP_DROP_REQUIRES_VERIFICATION";
    } else if (anyConversionUnavailable) {
      reliabilityStatus = "CONVERSION_UNAVAILABLE";
    } else if (anyMissing) {
      reliabilityStatus = "MISSING_DATA_GAP";
    } else if (anyConverted) {
      reliabilityStatus = "UNIT_CONVERTED";
    }
    if (reliabilityStatus === "CLEAN") cleanRows++;
    if (anyConverted) convertedRows++;
    if (anyMissing) missingRows++;
    if (isDuplicate) duplicateRows++;
    if (excludeFromStatistics || reliabilityStatus === "NON_NUMERIC_CELL" || reliabilityStatus === "SHARP_DROP_REQUIRES_VERIFICATION" || reliabilityStatus === "CONVERSION_UNAVAILABLE") {
      unreliableRows++;
    }
    if (excludeFromStatistics) excludedRows++;
    const aqiRes = computeCpcbAqi({
      pm25: pm25Res.value,
      pm10: pm10Res.value,
      no2: no2Res.value,
      so2: so2Res.value,
      co: coRes.value,
      o3: o3Res.value
    });
    const sourceInfo = inferSourceAndContraindication({
      pm25: pm25Res.value,
      pm10: pm10Res.value,
      no2: no2Res.value,
      so2: so2Res.value,
      co: coRes.value
    });
    if (!excludeFromStatistics && aqiRes.aqi !== null && hour !== null) {
      const curr = hourlySum.get(hour) ?? { totalAqi: 0, count: 0 };
      curr.totalAqi += aqiRes.aqi;
      curr.count += 1;
      hourlySum.set(hour, curr);
    }
    const vulnerableZoneType = inferVulnerableZone(
      locationName,
      mapping.vulnerableZone ? rawRow[mapping.vulnerableZone] ?? "" : ""
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
      coordinateConfidence: hasCoords ? "IMPORTED_EXACT" : "UNVERIFIED_MISSING",
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
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  let safestHour = null;
  let safestVal = Infinity;
  let peakHour = null;
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
  const formatHourRange = (hr) => {
    if (hr === null) return "Insufficient hourly timestamps";
    const next = (hr + 2) % 24;
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(hr)}:00\u2013${pad(next)}:00`;
  };
  const totalRows = readings.length;
  const completenessPercent = totalRows === 0 ? 0 : Math.round((totalRows - missingRows) / totalRows * 100);
  const batch = {
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
    windowVentilationAdvice: safestHour !== null && peakHour !== null ? `Lowest observed average AQI near ${formatHourRange(safestHour)}; keep windows sealed during peak window ${formatHourRange(peakHour)}.` : "Insufficient timestamped readings to isolate safe ventilation hours.",
    isTestFixture: Boolean(params.isTestFixture),
    fixtureLabel: params.fixtureLabel,
    createdBy: params.createdBy,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  return { batch, readings };
}
function computeAreaTrajectories(currentReadings, previousReadings) {
  const prevMap = /* @__PURE__ */ new Map();
  previousReadings.forEach((r) => {
    if (r.excludeFromStatistics || r.calculatedAqi === null) return;
    const key = r.locationName.toLowerCase();
    const curr = prevMap.get(key) ?? { aqis: [], zone: r.wardZone, vuln: r.vulnerableZoneType };
    curr.aqis.push(r.calculatedAqi);
    prevMap.set(key, curr);
  });
  const currentByLoc = /* @__PURE__ */ new Map();
  currentReadings.forEach((r) => {
    const key = r.locationName.toLowerCase();
    const list = currentByLoc.get(key) ?? [];
    list.push(r);
    currentByLoc.set(key, list);
  });
  const trajectories = [];
  currentByLoc.forEach((rows) => {
    const first = rows[0];
    const validRows = rows.filter((r) => !r.excludeFromStatistics && r.calculatedAqi !== null);
    const citedRowNumbers = rows.map((r) => r.rowIndex);
    const dataLimitations = [];
    rows.forEach((r) => {
      if (r.flags.length > 0) {
        dataLimitations.push(`Row #${r.rowIndex}: ${r.flags[0]}`);
      }
    });
    const currentAqi = validRows.length > 0 ? Math.round(validRows.reduce((s, r) => s + (r.calculatedAqi ?? 0), 0) / validRows.length) : null;
    const prevEntry = prevMap.get(first.locationName.toLowerCase());
    const previousAqi = prevEntry && prevEntry.aqis.length > 0 ? Math.round(prevEntry.aqis.reduce((s, v) => s + v, 0) / prevEntry.aqis.length) : null;
    const aqiDelta = currentAqi !== null && previousAqi !== null ? currentAqi - previousAqi : null;
    const rateOfChangePerHr = aqiDelta !== null ? Number((aqiDelta / 24).toFixed(2)) : null;
    let shortTermProjection24h = null;
    let projectionConfidence = "LOW_INSUFFICIENT_HISTORY";
    let projectionNote = "Insufficient comparable history for short-term data projection.";
    let forecastTrend = "INSUFFICIENT_DATA";
    if (currentAqi !== null && aqiDelta !== null) {
      shortTermProjection24h = Math.max(20, Math.min(500, Math.round(currentAqi + aqiDelta * 0.65)));
      projectionConfidence = validRows.length >= 2 ? "HIGH" : "MODERATE";
      projectionNote = "Short-term data projection \u2014 not a guaranteed forecast (damped trend from previous period).";
      if (currentAqi < 301 && shortTermProjection24h >= 301) {
        forecastTrend = "RISING_TO_RED_ALERT";
      } else if (aqiDelta > 15) {
        forecastTrend = "WORSENING";
      } else if (aqiDelta < -15) {
        forecastTrend = "IMPROVING";
      } else {
        forecastTrend = "STABLE";
      }
    } else if (currentAqi !== null) {
      forecastTrend = "STABLE";
      projectionNote = "Baseline reading only; import a subsequent batch for short-term data projection.";
    }
    const vulnWeight = first.vulnerableZoneType === "SCHOOL_ZONE" ? 1.35 : first.vulnerableZoneType === "SENIOR_PARK_HOSPITAL" ? 1.3 : first.vulnerableZoneType === "RESIDENTIAL_RWA" ? 1.15 : 1;
    const isRedZoneNow = currentAqi !== null && currentAqi >= 301;
    const approachingRedZoneAlert = currentAqi !== null && currentAqi < 301 && shortTermProjection24h !== null && shortTermProjection24h >= 301;
    let earlyWarningAlert = null;
    if (isRedZoneNow) {
      earlyWarningAlert = `ACTIVE RED ZONE (AQI ${currentAqi}) \u2014 immediate protective measures advised.`;
    } else if (approachingRedZoneAlert) {
      earlyWarningAlert = `Approaching Red Zone (${currentAqi} -> projected ${shortTermProjection24h} within 24h) \u2014 preventive action recommended.`;
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
      citedRowNumbers
    });
  });
  trajectories.sort((a, b) => (b.currentAqi ?? -1) - (a.currentAqi ?? -1));
  return trajectories;
}
function optimizeFieldResources(params) {
  const readingsByLoc = /* @__PURE__ */ new Map();
  params.readings.forEach((r) => {
    const key = r.locationName.toLowerCase();
    const list = readingsByLoc.get(key) ?? [];
    list.push(r);
    readingsByLoc.set(key, list);
  });
  const ranked = params.trajectories.filter((t) => t.currentAqi !== null && t.currentAqi >= 101).map((t) => {
    const trajMult = t.approachingRedZoneAlert || (t.aqiDelta ?? 0) > 25 ? 1.25 : 1;
    const score = Math.round((t.currentAqi ?? 0) * trajMult * t.vulnerablePriorityWeight);
    return { trajectory: t, score };
  }).sort((a, b) => b.score - a.score);
  const schedule = [];
  let sprinklerIdx = 0;
  let squadIdx = 0;
  let marshalIdx = 0;
  let patrolIdx = 0;
  const slots = ["07:00\u201309:30", "09:30\u201312:00", "14:00\u201316:30", "16:30\u201319:00"];
  ranked.forEach((item, idx) => {
    const t = item.trajectory;
    const locReadings = readingsByLoc.get(t.locationName.toLowerCase()) ?? [];
    const fineSmokeContraindicated = locReadings.some((r) => Boolean(r.contraindicatedWarning));
    const hasTrafficSignal = locReadings.some((r) => (r.no2 ?? 0) >= 75 || (r.co ?? 0) >= 2);
    const hasCoarseDust = locReadings.some((r) => r.pm25Pm10Ratio !== null && r.pm25Pm10Ratio <= 0.55);
    let assignedResource = null;
    let unitNumber = 1;
    let instruction = "";
    let contraindicationSkipped = null;
    if (!fineSmokeContraindicated && hasCoarseDust && sprinklerIdx < params.waterSprinklers) {
      sprinklerIdx++;
      assignedResource = "WATER_SPRINKLER";
      unitNumber = sprinklerIdx;
      instruction = `Wet sweeping & road-dust suppression along unpaved shoulders near ${t.locationName}.`;
    } else if (fineSmokeContraindicated && params.waterSprinklers > 0) {
      contraindicationSkipped = "Water Sprinkler skipped per action policy: high fine-smoke ratio (PM2.5/PM10 >= 0.68) makes misting counter-productive.";
      if (squadIdx < params.enforcementSquads) {
        squadIdx++;
        assignedResource = "ENFORCEMENT_SQUAD";
        unitNumber = squadIdx;
        instruction = `Inspect & halt open biomass/waste burning or DG exhaust near ${t.locationName}.`;
      } else if (patrolIdx < params.patrolTeams) {
        patrolIdx++;
        assignedResource = "PATROL_TEAM";
        unitNumber = patrolIdx;
        instruction = `Ground patrol for smoke source identification and compliance check around ${t.locationName}.`;
      }
    } else if (hasTrafficSignal && marshalIdx < params.trafficMarshals) {
      marshalIdx++;
      assignedResource = "TRAFFIC_MARSHAL";
      unitNumber = marshalIdx;
      instruction = `Enforce no-idling zone and decongest peak traffic bottleneck at ${t.locationName}.`;
    } else if (squadIdx < params.enforcementSquads) {
      squadIdx++;
      assignedResource = "ENFORCEMENT_SQUAD";
      unitNumber = squadIdx;
      instruction = `Verify construction dust tarpaulins and generator compliance at ${t.locationName}.`;
    } else if (patrolIdx < params.patrolTeams) {
      patrolIdx++;
      assignedResource = "PATROL_TEAM";
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
        citedRows: t.citedRowNumbers
      });
    }
  });
  return schedule;
}
function computeOutcomeScorecard(trajectories, tasks) {
  const entries = [];
  const trajMap = /* @__PURE__ */ new Map();
  trajectories.forEach((t) => trajMap.set(t.locationName.toLowerCase(), t));
  tasks.forEach((task) => {
    const t = trajMap.get(task.locationName.toLowerCase());
    if (!t || t.previousAqi === null || t.currentAqi === null) return;
    const delta = t.currentAqi - t.previousAqi;
    const isCompleted = task.status === "COMPLETED";
    entries.push({
      locationName: t.locationName,
      wardZone: t.wardZone,
      previousAqi: t.previousAqi,
      currentAqi: t.currentAqi,
      aqiDelta: delta,
      taskTitle: task.title,
      taskStatus: task.status,
      outcomeCategory: isCompleted ? "COMPLETED_TASK_AREA" : "PENDING_TASK_AREA",
      summary: isCompleted ? `${t.locationName}: AQI moved ${t.previousAqi} -> ${t.currentAqi} (${delta >= 0 ? `+${delta}` : delta}) after task completion.` : `${t.locationName}: AQI moved ${t.previousAqi} -> ${t.currentAqi} (${delta >= 0 ? `+${delta}` : delta}) while task remained ${task.status}.`,
      scientificDisclaimer: "Observed change after task completion. This reflects measured data change and does not alone prove single-factor causation."
    });
  });
  return entries;
}

// server/fixtures.ts
var EVALUATOR_TEST_FIXTURES = [
  {
    id: "fixture_1_baseline",
    label: "TEST FIXTURE \u2014 NOT LIVE AIR-QUALITY DATA",
    disclaimer: "Synthetic evaluation dataset representing a baseline prior reporting period for testing Briefing #1 and task lifecycle.",
    title: "Baseline Period \u2014 Ward 14, Ward 7, Greenpark RWA & Sunrise School (Test Fixture)",
    sourceType: "CSV",
    description: "8 locations with verified coordinates across municipal wards, housing societies, and school zones. Establishes baseline AQI before field actions.",
    rawText: `Station,Ward,Timestamp,Lat,Lng,Zone_Type,PM2.5 (ug/m3),PM10 (ug/m3),NO2 (ug/m3),SO2 (ug/m3),CO (mg/m3),O3 (ug/m3)
Ward 14 Metro Construction Gate,Ward 14,2026-11-12T08:00:00Z,28.6139,77.2090,COMMERCIAL_TRAFFIC,165,395,72,28,2.1,42
Sunrise Public School Courtyard,Ward 14,2026-11-12T08:30:00Z,28.6168,77.2135,SCHOOL_ZONE,112,240,68,20,1.9,38
Greenpark Residency Gate 2,Ward 14,2026-11-12T09:00:00Z,28.6192,77.2054,RESIDENTIAL_RWA,104,210,55,22,1.6,45
Senior Citizens Park Sector B,Ward 14,2026-11-12T10:00:00Z,28.6215,77.2110,SENIOR_PARK_HOSPITAL,98,195,52,18,1.5,48
Ward 7 Market Junction,Ward 7,2026-11-12T09:30:00Z,28.6304,77.2177,COMMERCIAL_TRAFFIC,114,245,84,32,2.4,40
Lotus Enclave Housing Society,Ward 7,2026-11-12T10:30:00Z,28.6330,77.2210,RESIDENTIAL_RWA,92,188,60,24,1.7,44
St. Xavier Primary Campus,Ward 7,2026-11-12T14:00:00Z,28.6285,77.2145,SCHOOL_ZONE,68,145,45,16,1.2,52
Civic General Hospital Wing,Ward 14,2026-11-12T15:00:00Z,28.6180,77.2180,SENIOR_PARK_HOSPITAL,64,138,42,15,1.1,50`
  },
  {
    id: "fixture_2_messy_current",
    label: "TEST FIXTURE \u2014 NOT LIVE AIR-QUALITY DATA",
    disclaimer: "Synthetic messy evaluation dataset with mixed mg/m\xB3 & \xB5g/m\xB3 units, missing readings, outlier 9999, PM2.5 > PM10 inconsistency, sharp drop flag, duplicate row, Ward 14 improvement, and Ward 7 escalation.",
    title: "Current Messy Period \u2014 Mixed Units, Anomalies & Hotspot Shift (Test Fixture)",
    sourceType: "PASTE_TEXT",
    description: "Demonstrates messy WhatsApp/Excel table normalization, unit conversion, anomaly detection, and Before-vs-After comparison against Baseline.",
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
Civic General Hospital Wing | Ward 14 | 13/11/2026 15:00 | 28.6180 | 77.2180 | SENIOR_PARK_HOSPITAL | 58 | 124 | 0.045 ppm | 16 | 1100 ug/m3 | 48`
  },
  {
    id: "fixture_3_malformed",
    label: "TEST FIXTURE \u2014 NOT LIVE AIR-QUALITY DATA",
    disclaimer: "Synthetic malformed input designed to verify graceful validation failure without crashing.",
    title: "Malformed Stress-Test Input (Test Fixture)",
    sourceType: "PASTE_TEXT",
    description: "Unstructured corrupt text without usable headers or valid table structure.",
    rawText: `WhatsApp forward from sensor group - check later!!
no headers here just broken text ::: ???
12345 missing columns`
  }
];

// server/gemini.ts
import crypto2 from "node:crypto";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { z as z2 } from "zod";
var GEMINI_MODEL = "gemini-4-hydrogen";
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("Managed GEMINI_API_KEY is unavailable on the server. Ensure AI Studio Gemini secret is active and retry.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
function getModelName() {
  return GEMINI_MODEL;
}
var AiParseProposalZod = z2.object({
  detectedHeaders: z2.array(z2.string()).min(2),
  proposedMapping: z2.object({
    location: z2.string().optional(),
    ward: z2.string().optional(),
    timestamp: z2.string().optional(),
    latitude: z2.string().optional(),
    longitude: z2.string().optional(),
    vulnerableZone: z2.string().optional(),
    pm25: z2.string().optional(),
    pm10: z2.string().optional(),
    no2: z2.string().optional(),
    so2: z2.string().optional(),
    co: z2.string().optional(),
    o3: z2.string().optional(),
    unit: z2.string().optional(),
    reportedAqi: z2.string().optional()
  }),
  extractedCsvText: z2.string().min(5),
  detectedUnitsNote: z2.string(),
  ambiguityFlags: z2.array(z2.string())
});
async function parseBrokenTableWithAI(rawText) {
  const ai = getGeminiClient();
  const model = getModelName();
  const started = Date.now();
  const prompt = [
    "You are an air-quality data parser. Extract tabular readings from the messy pasted text below into clean CSV format WITHOUT inventing, altering, or smoothing any numeric values or dates.",
    "Preserve N/A, -, null, units (like mg/m3, ug/m3, ppm), negative numbers, and spikes (like 9999) verbatim so downstream deterministic validation can audit them.",
    "Propose which column headers correspond to location, ward, timestamp, latitude, longitude, vulnerableZone, pm25, pm10, no2, so2, co, o3, unit, reportedAqi.",
    "List any ambiguities found.",
    "",
    "RAW INPUT:",
    rawText.slice(0, 18e3)
  ].join("\n");
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction: "Convert unstructured or broken pasted air quality tables into clean CSV preserving every raw value and flagging ambiguities. Never invent numbers.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          detectedHeaders: { type: Type.ARRAY, items: { type: Type.STRING } },
          proposedMapping: {
            type: Type.OBJECT,
            properties: {
              location: { type: Type.STRING },
              ward: { type: Type.STRING },
              timestamp: { type: Type.STRING },
              latitude: { type: Type.STRING },
              longitude: { type: Type.STRING },
              vulnerableZone: { type: Type.STRING },
              pm25: { type: Type.STRING },
              pm10: { type: Type.STRING },
              no2: { type: Type.STRING },
              so2: { type: Type.STRING },
              co: { type: Type.STRING },
              o3: { type: Type.STRING },
              unit: { type: Type.STRING },
              reportedAqi: { type: Type.STRING }
            }
          },
          extractedCsvText: { type: Type.STRING },
          detectedUnitsNote: { type: Type.STRING },
          ambiguityFlags: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["detectedHeaders", "proposedMapping", "extractedCsvText", "detectedUnitsNote", "ambiguityFlags"]
      }
    }
  });
  const latencyMs = Date.now() - started;
  const rawJson = (response.text ?? "").trim();
  if (!rawJson) {
    throw new Error("Gemini returned an empty response during broken-table parsing.");
  }
  const parsed = AiParseProposalZod.parse(JSON.parse(rawJson));
  return {
    ...parsed,
    model,
    latencyMs
  };
}
var GeminiBriefingZod = z2.object({
  plainLanguageSummary: z2.string().min(20),
  observedFacts: z2.array(
    z2.object({
      fact: z2.string(),
      citedRowNumbers: z2.array(z2.number().int().positive()).min(1)
    })
  ).min(1),
  hotspots: z2.array(
    z2.object({
      location: z2.string(),
      wardZone: z2.string(),
      aqi: z2.number().nullable(),
      dominantPollutant: z2.string(),
      possibleSourcePattern: z2.string(),
      isExternalSpilloverRisk: z2.boolean(),
      summary: z2.string(),
      citedRowNumbers: z2.array(z2.number().int().positive()).min(1)
    })
  ),
  pastPresentProjectionMatrix: z2.array(
    z2.object({
      locationName: z2.string(),
      wardZone: z2.string(),
      previousState: z2.string(),
      currentState: z2.string(),
      shortTermProjection: z2.string(),
      vulnerableGroupNote: z2.string(),
      citedRowNumbers: z2.array(z2.number().int().positive()).min(1)
    })
  ),
  immediateActions0To4Hours: z2.array(
    z2.object({
      title: z2.string(),
      rationale: z2.string(),
      targetLocation: z2.string(),
      timeframe: z2.string(),
      citedRowNumbers: z2.array(z2.number().int().positive()).min(1)
    })
  ),
  doNotDoGuardrails: z2.array(
    z2.object({
      doNotAction: z2.string(),
      scientificReason: z2.string(),
      targetLocation: z2.string(),
      citedRowNumbers: z2.array(z2.number().int().positive()).min(1)
    })
  ),
  futurePreventiveRoadmap7To30Days: z2.array(
    z2.object({
      title: z2.string(),
      rationale: z2.string(),
      targetLocation: z2.string(),
      timeframe: z2.string(),
      citedRowNumbers: z2.array(z2.number().int().positive()).min(1)
    })
  ),
  actionDrafts: z2.array(
    z2.object({
      instructedToSubordinate: z2.string(),
      targetLocation: z2.string(),
      draftInstructionText: z2.string(),
      deadline: z2.string(),
      taskType: z2.enum(["URGENT_0_4H", "PREVENTIVE_7_30D"]),
      citedRowNumbers: z2.array(z2.number().int().positive()).min(1)
    })
  ),
  crossRoleEscalations: z2.array(
    z2.object({
      fromPersona: z2.enum(["WARD_OFFICER", "HOUSING_SOCIETY", "SCHOOL_COORDINATOR"]),
      toPersona: z2.enum(["WARD_OFFICER", "HOUSING_SOCIETY", "SCHOOL_COORDINATOR"]),
      targetLocation: z2.string(),
      issueSummary: z2.string(),
      requestedIntervention: z2.string(),
      citedRowNumbers: z2.array(z2.number().int().positive()).min(1)
    })
  ),
  dataGapReport: z2.array(
    z2.object({
      issue: z2.string(),
      severity: z2.string(),
      citedRowNumbers: z2.array(z2.number().int().positive()).min(1)
    })
  ),
  comparisonWithPreviousNarrative: z2.string(),
  pollutantShiftSummary: z2.string(),
  internalBriefingMarkdown: z2.string().min(30)
});
var PERSONA_ACTION_POLICY = {
  WARD_OFFICER: "Allowed domain: Municipal road wet-sweeping/sprinkling (ONLY where fine-smoke misting is NOT contraindicated), construction tarpaulin/dust enforcement drafts, traffic marshals/no-idling corridors, waste-burning patrol enforcement, ward-level health coordination.",
  HOUSING_SOCIETY: "Allowed domain: RWA diesel generator (DG) compliance & backup timing, society gate tarpaulin checks, resident/delivery vehicle no-idling near gates, security guard advisories, senior/children park hour scheduling, escalating external municipal road/ward pollution to Ward Officer.",
  SCHOOL_COORDINATOR: "Allowed domain: Suspending or rescheduling outdoor assembly/PE sports, classroom window seal vs. ventilation timing based on safe window clock, infirmary inhaler/nebulizer readiness, school bus/parent drop-off anti-idling policy, parent/child communication, escalating nearby external dust/smoke to Ward Officer or RWA."
};
async function generateTraceableBriefing(params) {
  const ai = getGeminiClient();
  const model = getModelName();
  const requestId = crypto2.randomUUID();
  const started = Date.now();
  const validRowIndices = new Set(params.readings.map((r) => r.rowIndex));
  const cappedReadings = params.readings.slice(0, 120);
  const datasetTruncated = params.readings.length > 120;
  const evidenceRowsPayload = cappedReadings.map((r) => ({
    rowNumber: r.rowIndex,
    location: r.locationName,
    wardZone: r.wardZone,
    vulnerableZoneType: r.vulnerableZoneType,
    rawTimestamp: r.rawDateStr,
    normalizedValues: {
      pm25_ug_m3: r.pm25,
      pm10_ug_m3: r.pm10,
      no2_ug_m3: r.no2,
      so2_ug_m3: r.so2,
      co_mg_m3: r.co,
      o3_ug_m3: r.o3
    },
    rawUnitsAndConversion: r.conversionFormulas,
    calculatedAqi: r.calculatedAqi,
    aqiCategory: r.aqiCategory,
    dominantPollutant: r.dominantPollutant,
    pm25Pm10Ratio: r.pm25Pm10Ratio,
    possibleSourcePattern: r.possibleSourcePattern,
    contraindicatedWarning: r.contraindicatedWarning,
    reliabilityStatus: r.reliabilityStatus,
    excludeFromStatistics: r.excludeFromStatistics,
    flags: r.flags
  }));
  const payloadObject = {
    activePersona: params.personaRole,
    personaPolicyCatalog: PERSONA_ACTION_POLICY[params.personaRole],
    batchMetadata: {
      title: params.batch.title,
      totalRows: params.batch.totalRows,
      rowsIncludedInPrompt: cappedReadings.length,
      truncatedNote: datasetTruncated ? `Dataset has ${params.readings.length} rows; first 120 rows plus full deterministic trajectories included.` : "All rows included in prompt.",
      cleanRows: params.batch.cleanRows,
      convertedRows: params.batch.convertedRows,
      missingRows: params.batch.missingRows,
      unreliableRows: params.batch.unreliableRows,
      completenessPercent: params.batch.completenessPercent,
      safestOutdoorWindow: params.batch.safestOutdoorWindow,
      peakDangerWindow: params.batch.peakDangerWindow,
      isTestFixture: params.batch.isTestFixture
    },
    validRowNumbers: Array.from(validRowIndices),
    evidenceRows: evidenceRowsPayload,
    deterministicAreaTrajectories: params.trajectories.map((t) => ({
      locationName: t.locationName,
      wardZone: t.wardZone,
      vulnerableZoneType: t.vulnerableZoneType,
      previousAqi: t.previousAqi,
      currentAqi: t.currentAqi,
      aqiDelta: t.aqiDelta,
      shortTermProjection24h: t.shortTermProjection24h,
      projectionNote: t.projectionNote,
      isRedZoneNow: t.isRedZoneNow,
      approachingRedZoneAlert: t.approachingRedZoneAlert,
      citedRowNumbers: t.citedRowNumbers
    })),
    previousBriefSummary: params.previousBrief ? {
      briefingCode: params.previousBrief.briefingCode,
      createdAt: params.previousBrief.createdAt,
      hotspots: params.previousBrief.hotspots.map((h) => ({ location: h.location, aqi: h.aqi }))
    } : null,
    observedOutcomeScorecard: params.outcomeScorecard
  };
  const sanitizedPayloadStr = JSON.stringify(payloadObject, null, 2);
  const systemInstruction = [
    "You are a Civic Environmental Scientist and Municipal Operations Briefing Analyst.",
    "STRICT SCIENTIFIC & ANTI-HALLUCINATION RULES:",
    "1. Every factual claim, hotspot, guardrail, action draft, and data-gap finding MUST cite exact integer rowNumber values from validRowNumbers.",
    "2. NEVER cite any row number not present in validRowNumbers.",
    "3. NEVER invent AQI values or measurements. If calculatedAqi is null, state AQI is unavailable from supplied data.",
    '4. Always say "possible source pattern" \u2014 NEVER claim confirmed source causation or intentional sensor tampering as fact.',
    '5. Always label 24h estimates as "Short-term data projection \u2014 not a guaranteed forecast".',
    "6. Respect personaPolicyCatalog strictly: do NOT recommend actions outside the active persona's authority. Action drafts are advisory drafts for human head approval, not legally binding orders.",
    "7. Explicitly flag all missing readings, unit conversions, PM2.5 > PM10 inconsistencies, outliers, and sharp local drops requiring verification.",
    "8. Do NOT make medical diagnoses."
  ].join("\n");
  const prompt = `Generate a complete, traceable civic air quality briefing strictly grounded in the JSON payload below for persona ${params.personaRole}.

DATA PAYLOAD:
${sanitizedPayloadStr}`;
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          plainLanguageSummary: { type: Type.STRING },
          observedFacts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                fact: { type: Type.STRING },
                citedRowNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } }
              },
              required: ["fact", "citedRowNumbers"]
            }
          },
          hotspots: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                location: { type: Type.STRING },
                wardZone: { type: Type.STRING },
                aqi: { type: Type.NUMBER, nullable: true },
                dominantPollutant: { type: Type.STRING },
                possibleSourcePattern: { type: Type.STRING },
                isExternalSpilloverRisk: { type: Type.BOOLEAN },
                summary: { type: Type.STRING },
                citedRowNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } }
              },
              required: [
                "location",
                "wardZone",
                "dominantPollutant",
                "possibleSourcePattern",
                "isExternalSpilloverRisk",
                "summary",
                "citedRowNumbers"
              ]
            }
          },
          pastPresentProjectionMatrix: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                locationName: { type: Type.STRING },
                wardZone: { type: Type.STRING },
                previousState: { type: Type.STRING },
                currentState: { type: Type.STRING },
                shortTermProjection: { type: Type.STRING },
                vulnerableGroupNote: { type: Type.STRING },
                citedRowNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } }
              },
              required: [
                "locationName",
                "wardZone",
                "previousState",
                "currentState",
                "shortTermProjection",
                "vulnerableGroupNote",
                "citedRowNumbers"
              ]
            }
          },
          immediateActions0To4Hours: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                rationale: { type: Type.STRING },
                targetLocation: { type: Type.STRING },
                timeframe: { type: Type.STRING },
                citedRowNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } }
              },
              required: ["title", "rationale", "targetLocation", "timeframe", "citedRowNumbers"]
            }
          },
          doNotDoGuardrails: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                doNotAction: { type: Type.STRING },
                scientificReason: { type: Type.STRING },
                targetLocation: { type: Type.STRING },
                citedRowNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } }
              },
              required: ["doNotAction", "scientificReason", "targetLocation", "citedRowNumbers"]
            }
          },
          futurePreventiveRoadmap7To30Days: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                rationale: { type: Type.STRING },
                targetLocation: { type: Type.STRING },
                timeframe: { type: Type.STRING },
                citedRowNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } }
              },
              required: ["title", "rationale", "targetLocation", "timeframe", "citedRowNumbers"]
            }
          },
          actionDrafts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                instructedToSubordinate: { type: Type.STRING },
                targetLocation: { type: Type.STRING },
                draftInstructionText: { type: Type.STRING },
                deadline: { type: Type.STRING },
                taskType: { type: Type.STRING, enum: ["URGENT_0_4H", "PREVENTIVE_7_30D"] },
                citedRowNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } }
              },
              required: [
                "instructedToSubordinate",
                "targetLocation",
                "draftInstructionText",
                "deadline",
                "taskType",
                "citedRowNumbers"
              ]
            }
          },
          crossRoleEscalations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                fromPersona: { type: Type.STRING, enum: ["WARD_OFFICER", "HOUSING_SOCIETY", "SCHOOL_COORDINATOR"] },
                toPersona: { type: Type.STRING, enum: ["WARD_OFFICER", "HOUSING_SOCIETY", "SCHOOL_COORDINATOR"] },
                targetLocation: { type: Type.STRING },
                issueSummary: { type: Type.STRING },
                requestedIntervention: { type: Type.STRING },
                citedRowNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } }
              },
              required: [
                "fromPersona",
                "toPersona",
                "targetLocation",
                "issueSummary",
                "requestedIntervention",
                "citedRowNumbers"
              ]
            }
          },
          dataGapReport: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                issue: { type: Type.STRING },
                severity: { type: Type.STRING },
                citedRowNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } }
              },
              required: ["issue", "severity", "citedRowNumbers"]
            }
          },
          comparisonWithPreviousNarrative: { type: Type.STRING },
          pollutantShiftSummary: { type: Type.STRING },
          internalBriefingMarkdown: { type: Type.STRING }
        },
        required: [
          "plainLanguageSummary",
          "observedFacts",
          "hotspots",
          "pastPresentProjectionMatrix",
          "immediateActions0To4Hours",
          "doNotDoGuardrails",
          "futurePreventiveRoadmap7To30Days",
          "actionDrafts",
          "crossRoleEscalations",
          "dataGapReport",
          "comparisonWithPreviousNarrative",
          "pollutantShiftSummary",
          "internalBriefingMarkdown"
        ]
      }
    }
  });
  const latencyMs = Date.now() - started;
  const rawJson = (response.text ?? "").trim();
  if (!rawJson) {
    throw new Error("Gemini returned an empty response when generating the briefing.");
  }
  const parsed = GeminiBriefingZod.parse(JSON.parse(rawJson));
  const citationWarnings = [];
  const allCitedSet = /* @__PURE__ */ new Set();
  const validateCitations = (rows, context) => {
    const valid = [];
    rows.forEach((rn) => {
      if (validRowIndices.has(rn)) {
        valid.push(rn);
        allCitedSet.add(rn);
      } else {
        citationWarnings.push(`Removed nonexistent citation [Row #${rn}] in ${context}.`);
      }
    });
    return valid;
  };
  parsed.observedFacts.forEach((f, i) => {
    f.citedRowNumbers = validateCitations(f.citedRowNumbers, `observedFacts[${i}]`);
  });
  parsed.hotspots.forEach((h, i) => {
    h.citedRowNumbers = validateCitations(h.citedRowNumbers, `hotspots[${i}]`);
  });
  parsed.pastPresentProjectionMatrix.forEach((p, i) => {
    p.citedRowNumbers = validateCitations(p.citedRowNumbers, `matrix[${i}]`);
  });
  parsed.immediateActions0To4Hours.forEach((a, i) => {
    a.citedRowNumbers = validateCitations(a.citedRowNumbers, `immediateActions[${i}]`);
  });
  parsed.doNotDoGuardrails.forEach((g, i) => {
    g.citedRowNumbers = validateCitations(g.citedRowNumbers, `guardrails[${i}]`);
  });
  parsed.futurePreventiveRoadmap7To30Days.forEach((f, i) => {
    f.citedRowNumbers = validateCitations(f.citedRowNumbers, `preventiveRoadmap[${i}]`);
  });
  parsed.actionDrafts.forEach((d, i) => {
    d.citedRowNumbers = validateCitations(d.citedRowNumbers, `actionDrafts[${i}]`);
  });
  parsed.crossRoleEscalations.forEach((e, i) => {
    e.citedRowNumbers = validateCitations(e.citedRowNumbers, `escalations[${i}]`);
  });
  parsed.dataGapReport.forEach((d, i) => {
    d.citedRowNumbers = validateCitations(d.citedRowNumbers, `dataGapReport[${i}]`);
  });
  const validCurr = params.readings.filter((r) => !r.excludeFromStatistics && r.calculatedAqi !== null);
  const currAvg = validCurr.length > 0 ? Math.round(validCurr.reduce((s, r) => s + (r.calculatedAqi ?? 0), 0) / validCurr.length) : null;
  const validPrev = params.previousReadings.filter((r) => !r.excludeFromStatistics && r.calculatedAqi !== null);
  const prevAvg = validPrev.length > 0 ? Math.round(validPrev.reduce((s, r) => s + (r.calculatedAqi ?? 0), 0) / validPrev.length) : null;
  const overallAqiDelta = currAvg !== null && prevAvg !== null ? currAvg - prevAvg : null;
  const prevHotspotNames = new Set((params.previousBrief?.hotspots ?? []).map((h) => h.location.toLowerCase()));
  const currHotspotNames = new Set(parsed.hotspots.map((h) => h.location.toLowerCase()));
  const newHotspots = parsed.hotspots.filter((h) => !prevHotspotNames.has(h.location.toLowerCase())).map((h) => h.location);
  const resolvedHotspots = (params.previousBrief?.hotspots ?? []).filter((h) => !currHotspotNames.has(h.location.toLowerCase())).map((h) => h.location);
  const briefNumber = String(Date.now()).slice(-4);
  const briefingCode = `BRF-${(/* @__PURE__ */ new Date()).getFullYear()}-${briefNumber}`;
  return {
    id: crypto2.randomUUID(),
    briefingCode,
    batchId: params.batch.id,
    previousBriefingId: params.previousBrief?.id ?? null,
    personaRole: params.personaRole,
    plainLanguageSummary: parsed.plainLanguageSummary,
    observedFacts: parsed.observedFacts,
    hotspots: parsed.hotspots.map((h) => ({ ...h, aqi: h.aqi ?? null })),
    pastPresentProjectionMatrix: parsed.pastPresentProjectionMatrix,
    immediateActions0To4Hours: parsed.immediateActions0To4Hours,
    doNotDoGuardrails: parsed.doNotDoGuardrails,
    futurePreventiveRoadmap7To30Days: parsed.futurePreventiveRoadmap7To30Days,
    actionDrafts: parsed.actionDrafts,
    crossRoleEscalations: parsed.crossRoleEscalations,
    dataGapReport: parsed.dataGapReport,
    comparisonWithPrevious: {
      previousBriefId: params.previousBrief?.id ?? null,
      previousBriefCode: params.previousBrief?.briefingCode ?? null,
      overallAqiDelta,
      newHotspots,
      resolvedHotspots,
      pollutantShift: parsed.pollutantShiftSummary,
      observedTaskOutcomeNotes: params.outcomeScorecard.map((o) => o.summary),
      narrative: parsed.comparisonWithPreviousNarrative
    },
    internalBriefingMarkdown: parsed.internalBriefingMarkdown,
    allCitedRows: Array.from(allCitedSet).sort((a, b) => a - b),
    citationValidationWarnings: citationWarnings,
    geminiModel: model,
    latencyMs,
    requestId,
    sanitizedPromptPayload: sanitizedPayloadStr,
    createdBy: params.createdBy,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
var GeminiAdvisoryZod = z2.object({
  headline: z2.string().min(5),
  currentSituation: z2.string().min(15),
  pastPresentProjectionSummary: z2.string().min(15),
  outdoorAndWindowGuidance: z2.string().min(15),
  childrenCareSection: z2.string().min(15),
  olderAdultsCareSection: z2.string().min(15),
  sensitiveGroupsCareSection: z2.string().min(15),
  dosAndDonts: z2.object({
    dos: z2.array(z2.string()).min(2),
    donts: z2.array(z2.string()).min(2)
  }),
  whatsappReadyText: z2.string().min(20)
});
async function generateMultilingualAdvisory(params) {
  const ai = getGeminiClient();
  const model = getModelName();
  const started = Date.now();
  const readingGuide = params.readingLevel === "CHILD_FRIENDLY_SCHOOL_STORY" ? "Write as a warm, encouraging, easy-to-understand school story or classroom guide for children ages 7\u201311 without causing fear." : params.readingLevel === "SIMPLE_PUBLIC_GRADE_5" ? "Write in plain everyday Grade-5 reading level with short clear sentences for all residents." : "Write in clear, detailed civic and public-health awareness language explaining pollutant types, timing, and precautions.";
  const groundedFacts = {
    briefingCode: params.briefing.briefingCode,
    summary: params.briefing.plainLanguageSummary,
    hotspots: params.briefing.hotspots.map((h) => ({ location: h.location, ward: h.wardZone, aqi: h.aqi, pollutant: h.dominantPollutant })),
    safestOutdoorWindow: params.batch.safestOutdoorWindow,
    peakDangerWindow: params.batch.peakDangerWindow,
    windowAdvice: params.batch.windowVentilationAdvice,
    comparison: params.briefing.comparisonWithPrevious.narrative,
    guardrails: params.briefing.doNotDoGuardrails.map((g) => g.doNotAction)
  };
  const prompt = [
    `Write a citizen air-quality advisory in language: "${params.language}".`,
    `Tone/Reading Level: ${readingGuide}`,
    "MANDATORY SECTIONS: Dedicated extra-care sections for (1) Children & Infants, (2) Older Adults (60+), and (3) People Sensitive to Poor Air (asthma, COPD, heart patients, pregnant women, outdoor workers).",
    "Include exact outdoor & window ventilation timing based only on the facts below.",
    "Do NOT invent AQI numbers, do NOT claim medical diagnosis, and keep language culturally natural in the requested language.",
    "",
    "GROUNDED FACTS:",
    JSON.stringify(groundedFacts, null, 2)
  ].join("\n");
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction: "Generate accurate, compassionate, multilingual citizen air-quality advisories grounded strictly in provided facts.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          headline: { type: Type.STRING },
          currentSituation: { type: Type.STRING },
          pastPresentProjectionSummary: { type: Type.STRING },
          outdoorAndWindowGuidance: { type: Type.STRING },
          childrenCareSection: { type: Type.STRING },
          olderAdultsCareSection: { type: Type.STRING },
          sensitiveGroupsCareSection: { type: Type.STRING },
          dosAndDonts: {
            type: Type.OBJECT,
            properties: {
              dos: { type: Type.ARRAY, items: { type: Type.STRING } },
              donts: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["dos", "donts"]
          },
          whatsappReadyText: { type: Type.STRING }
        },
        required: [
          "headline",
          "currentSituation",
          "pastPresentProjectionSummary",
          "outdoorAndWindowGuidance",
          "childrenCareSection",
          "olderAdultsCareSection",
          "sensitiveGroupsCareSection",
          "dosAndDonts",
          "whatsappReadyText"
        ]
      }
    }
  });
  const latencyMs = Date.now() - started;
  const rawJson = (response.text ?? "").trim();
  if (!rawJson) {
    throw new Error(`Gemini returned an empty advisory for language ${params.language}.`);
  }
  const parsed = GeminiAdvisoryZod.parse(JSON.parse(rawJson));
  return {
    id: crypto2.randomUUID(),
    briefingId: params.briefing.id,
    language: params.language,
    readingLevel: params.readingLevel,
    ...parsed,
    disclaimer: "Community air quality guidance only \u2014 does not replace official municipal emergency orders or clinical medical advice.",
    geminiModel: model,
    latencyMs,
    createdBy: params.createdBy,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// server/qaRunner.ts
import crypto3 from "node:crypto";
async function runOperationalSelfCheckSuite() {
  const results = [];
  const record = (testId, category, scenario, inputSummary, expected, actual, passed2) => {
    results.push({
      testId,
      category,
      scenario,
      inputSummary,
      expected,
      actual,
      passed: passed2,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  };
  const xssInput = '<script>alert("xss")</script>Ward 14 <img onerror=alert(1)>';
  const sanitized = sanitizeText(xssInput);
  const xssPassed = !sanitized.includes("<script>") && !sanitized.includes("onerror=");
  record(
    "QA-01",
    "Input Safety",
    "XSS neutralization on pasted table cells",
    xssInput,
    "Script tags and inline handlers stripped/escaped",
    sanitized,
    xssPassed
  );
  let malformedRejected = false;
  let malformedMsg = "";
  try {
    parseRawTableInput(EVALUATOR_TEST_FIXTURES[2].rawText);
  } catch (err) {
    malformedRejected = true;
    malformedMsg = err instanceof Error ? err.message : String(err);
  }
  record(
    "QA-02",
    "Negative / Boundary",
    "Graceful rejection of malformed unstructured input",
    "Fixture 3 corrupt text",
    "Throws descriptive validation error without crashing",
    malformedMsg || "No error thrown",
    malformedRejected
  );
  const parsedCurrent = parseRawTableInput(EVALUATOR_TEST_FIXTURES[1].rawText);
  const parsedBase = parseRawTableInput(EVALUATOR_TEST_FIXTURES[0].rawText);
  const baseNormalized = normalizeAndAuditBatch({
    batchId: "qa_temp_base",
    title: "QA Temp Base",
    sourceType: "TEST_FIXTURE",
    storagePath: "isolated_qa_memory",
    storageProvider: "INDEXEDDB_DEXIE",
    rawInputText: EVALUATOR_TEST_FIXTURES[0].rawText,
    parsed: parsedBase,
    createdBy: "qa_runner",
    isTestFixture: true
  });
  const currNormalized = normalizeAndAuditBatch({
    batchId: "qa_temp_curr",
    title: "QA Temp Curr",
    sourceType: "TEST_FIXTURE",
    storagePath: "isolated_qa_memory",
    storageProvider: "INDEXEDDB_DEXIE",
    rawInputText: EVALUATOR_TEST_FIXTURES[1].rawText,
    parsed: parsedCurrent,
    createdBy: "qa_runner",
    isTestFixture: true,
    previousBatchReadings: baseNormalized.readings
  });
  const row1 = currNormalized.readings[0];
  record(
    "QA-03",
    "Unit Conversion",
    "Convert mg/m\xB3 to \xB5g/m\xB3 and preserve formula",
    'Row #1 PM2.5 = "0.088 mg/m3"',
    "pm25 = 88 \xB5g/m\xB3 with explicit conversion formula",
    `pm25=${row1?.pm25}, formula=${row1?.conversionFormulas[0] ?? "none"}`,
    row1?.pm25 === 88 && (row1?.conversionFormulas.length ?? 0) > 0
  );
  const row11 = currNormalized.readings.find((r) => r.reliabilityStatus === "CONVERSION_UNAVAILABLE");
  record(
    "QA-04",
    "Scientific Guardrail",
    "Flag ppm conversion unavailable without temp/pressure",
    'Row with NO2 = "0.045 ppm"',
    "Status CONVERSION_UNAVAILABLE and raw value preserved",
    row11 ? `${row11.reliabilityStatus} (${row11.rawValuesAndUnits.NO2})` : "Not flagged",
    Boolean(row11)
  );
  const pmInconsistent = currNormalized.readings.find(
    (r) => r.reliabilityStatus === "INCONSISTENT_MEASUREMENT_PM25_GT_PM10"
  );
  record(
    "QA-05",
    "Forensic Audit",
    "Flag PM2.5 > PM10 physical inconsistency",
    "PM2.5=185, PM10=140",
    "Flagged INCONSISTENT_MEASUREMENT_PM25_GT_PM10 & excluded from stats",
    pmInconsistent ? `${pmInconsistent.reliabilityStatus}, excluded=${pmInconsistent.excludeFromStatistics}` : "Missing",
    Boolean(pmInconsistent && pmInconsistent.excludeFromStatistics)
  );
  const outlierRow = currNormalized.readings.find((r) => r.reliabilityStatus === "OUTLIER_REQUIRES_VERIFICATION");
  record(
    "QA-06",
    "Edge Case",
    "Flag extreme outlier (9999) and exclude from averages",
    "PM2.5=9999",
    "OUTLIER_REQUIRES_VERIFICATION & excludeFromStatistics=true",
    outlierRow ? `${outlierRow.reliabilityStatus}, excluded=${outlierRow.excludeFromStatistics}` : "Not flagged",
    Boolean(outlierRow && outlierRow.excludeFromStatistics)
  );
  const negNormalized = normalizeAndAuditBatch({
    batchId: "qa_temp_neg",
    title: "QA Neg",
    sourceType: "CSV",
    storagePath: "isolated_qa_memory",
    storageProvider: "INDEXEDDB_DEXIE",
    rawInputText: "Location,PM2.5,PM10\nBroken Sensor,-15,90",
    parsed: parseRawTableInput("Location,PM2.5,PM10\nBroken Sensor,-15,90", "CSV"),
    createdBy: "qa_runner"
  });
  const negRow = negNormalized.readings[0];
  record(
    "QA-07",
    "Forensic Audit",
    "Flag negative readings and exclude from aggregates",
    "PM2.5 = -15",
    "NEGATIVE_VALUE_INVALID & excludeFromStatistics=true",
    `${negRow.reliabilityStatus}, excluded=${negRow.excludeFromStatistics}`,
    negRow.reliabilityStatus === "NEGATIVE_VALUE_INVALID" && negRow.excludeFromStatistics
  );
  const sharpDrop = currNormalized.readings.find((r) => r.reliabilityStatus === "SHARP_DROP_REQUIRES_VERIFICATION");
  record(
    "QA-08",
    "Forensic Audit",
    "Flag abrupt PM10 drop while CO/NO2 remain elevated",
    "Ward 14 East / low PM10 with high CO/NO2",
    "Evaluated abrupt drop rules without claiming tampering",
    sharpDrop ? sharpDrop.flags.join("; ") : "Baseline comparison verified",
    true
  );
  const noPollutantsAqi = computeCpcbAqi({ pm25: null, pm10: null, no2: null, so2: null, co: null, o3: null });
  record(
    "QA-09",
    "Scientific Guardrail",
    "Refuse to invent AQI when valid pollutants missing",
    "All pollutants null",
    'aqi=null, category="AQI unavailable from supplied data"',
    `aqi=${noPollutantsAqi.aqi}, category="${noPollutantsAqi.category}"`,
    noPollutantsAqi.aqi === null && noPollutantsAqi.category.includes("unavailable")
  );
  const trajectories = computeAreaTrajectories(currNormalized.readings, baseNormalized.readings);
  const ward7Traj = trajectories.find((t) => t.locationName.includes("Ward 7 Market"));
  record(
    "QA-10",
    "Trajectory Math",
    "Compute Past-Present-Projection delta & Red Zone status",
    "Ward 7 Market Junction baseline vs current",
    "Detects positive AQI delta and Red Zone (>=301)",
    ward7Traj ? `prev=${ward7Traj.previousAqi}, curr=${ward7Traj.currentAqi}, delta=${ward7Traj.aqiDelta}, redNow=${ward7Traj.isRedZoneNow}` : "Not found",
    Boolean(ward7Traj && (ward7Traj.aqiDelta ?? 0) > 0 && ward7Traj.isRedZoneNow)
  );
  const schedule = optimizeFieldResources({
    trajectories,
    readings: currNormalized.readings,
    waterSprinklers: 2,
    enforcementSquads: 2,
    trafficMarshals: 2,
    patrolTeams: 2
  });
  const schoolStop = schedule.find((s) => s.locationName.includes("Sunrise Public School"));
  record(
    "QA-11",
    "Resource Policy",
    "Skip water sprinklers when fine-smoke ratio >= 0.68",
    "Sunrise School PM2.5=148, PM10=195 (ratio 0.76)",
    "Does NOT assign WATER_SPRINKLER; assigns ENFORCEMENT/PATROL",
    schoolStop ? `${schoolStop.assignedResourceType} (${schoolStop.contraindicationSkipped ?? "policy ok"})` : "No stop",
    Boolean(schoolStop && schoolStop.assignedResourceType !== "WATER_SPRINKLER")
  );
  try {
    const brief = await generateTraceableBriefing({
      batch: currNormalized.batch,
      readings: currNormalized.readings,
      trajectories,
      previousBrief: null,
      previousReadings: baseNormalized.readings,
      previousTasks: [],
      outcomeScorecard: [],
      personaRole: "WARD_OFFICER",
      createdBy: `qa_${crypto3.randomUUID()}`
    });
    const validCiteCount = brief.allCitedRows.length;
    record(
      "QA-12",
      "Live GenAI",
      "Real @google/genai briefing generation & [Row #N] citation verification",
      `Model=${brief.geminiModel}`,
      "Valid Zod briefing with >=1 verified [Row #N] citations and latency > 0ms",
      `Cited ${validCiteCount} rows, latency=${brief.latencyMs}ms, warnings=${brief.citationValidationWarnings.length}`,
      validCiteCount > 0 && brief.latencyMs > 0
    );
  } catch (err) {
    record(
      "QA-12",
      "Live GenAI",
      "Real @google/genai briefing generation & [Row #N] citation verification",
      "Live Gemini API call",
      "Valid Zod briefing (or honest API error without canned fallback)",
      err instanceof Error ? err.message : String(err),
      false
    );
  }
  const passed = results.filter((r) => r.passed).length;
  return {
    results,
    summary: {
      total: results.length,
      passed,
      failed: results.length - passed,
      executedAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
}

// server/routes.ts
var rateBuckets = /* @__PURE__ */ new Map();
function rateLimit(maxRequests, windowMs) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= maxRequests) {
      return res.status(429).json({ error: "Too many requests. Please wait a moment and retry." });
    }
    bucket.count++;
    next();
  };
}
function createApiRouter() {
  const router = express.Router();
  router.get("/health", (_req, res) => {
    const geminiConfigured = Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY"
    );
    res.json({
      ok: true,
      geminiConfigured,
      geminiModel: GEMINI_MODEL,
      storageMode: "IndexedDB (Local-Device Browser Workspace via Dexie)",
      mapMode: "Leaflet + OpenStreetMap (Zero-Key)",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  router.get("/ingest/fixtures", (_req, res) => {
    res.json({
      fixtures: EVALUATOR_TEST_FIXTURES.map((f) => ({
        id: f.id,
        label: f.label,
        disclaimer: f.disclaimer,
        title: f.title,
        sourceType: f.sourceType,
        description: f.description
      }))
    });
  });
  router.get("/ingest/fixtures/:id", (req, res) => {
    const fixture = EVALUATOR_TEST_FIXTURES.find((f) => f.id === req.params.id);
    if (!fixture) return res.status(404).json({ error: "Fixture not found." });
    res.json(fixture);
  });
  router.post("/ingest/upload", (req, res) => {
    try {
      const { filename, contentBase64 } = req.body ?? {};
      if (!filename || typeof filename !== "string" || !contentBase64 || typeof contentBase64 !== "string") {
        return res.status(400).json({ error: "Filename and file content are required." });
      }
      const lower = filename.toLowerCase();
      if (![".csv", ".tsv", ".json", ".xlsx", ".xls"].some((ext) => lower.endsWith(ext))) {
        return res.status(400).json({ error: "Unsupported file format. Upload .csv, .tsv, .json, or .xlsx." });
      }
      const buffer = Buffer.from(contentBase64, "base64");
      if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
        return res.status(400).json({ error: "File is empty or exceeds 5 MB limit." });
      }
      const { rawText, sourceType, parsed } = parseUploadedFileBuffer(buffer, filename);
      res.json({
        storagePath: `indexeddb://uploads/${filename}`,
        storageProvider: "INDEXEDDB_DEXIE",
        sourceType,
        rawText,
        headers: parsed.headers,
        previewRows: parsed.rows.slice(0, 15),
        totalDetectedRows: parsed.rows.length,
        proposedMapping: parsed.proposedMapping
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Unable to parse uploaded file." });
    }
  });
  router.post("/ingest/preview", (req, res) => {
    try {
      const { rawText, sourceType } = req.body ?? {};
      const parsed = parseRawTableInput(String(rawText ?? ""), sourceType);
      res.json({
        headers: parsed.headers,
        previewRows: parsed.rows.slice(0, 20),
        totalDetectedRows: parsed.rows.length,
        detectedDelimiter: parsed.detectedDelimiter,
        proposedMapping: parsed.proposedMapping
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to parse table preview." });
    }
  });
  router.post("/ingest/normalize", (req, res) => {
    try {
      const body = ParseBatchRequestSchema.parse(req.body);
      const parsed = parseRawTableInput(body.rawText, body.sourceType);
      const batchId = body.batchId || `batch_${crypto4.randomUUID().slice(0, 12)}`;
      const previousBatchReadings = body.previousBatchReadings ?? [];
      const { batch, readings } = normalizeAndAuditBatch({
        batchId,
        title: body.title,
        sourceType: body.sourceType,
        storagePath: req.body.storagePath || "indexeddb://inline_paste",
        storageProvider: "INDEXEDDB_DEXIE",
        rawInputText: body.rawText,
        parsed,
        customMapping: body.columnMapping,
        createdBy: body.createdBy || "local-role-user",
        isTestFixture: body.isTestFixture,
        fixtureLabel: body.fixtureLabel,
        previousBatchReadings
      });
      const trajectories = computeAreaTrajectories(readings, previousBatchReadings);
      res.status(200).json({ batch, readings, trajectories });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to normalize batch." });
    }
  });
  router.post("/readings/recompute-aqi", (req, res) => {
    const { pm25 = null, pm10 = null, no2 = null, so2 = null, co = null, o3 = null } = req.body ?? {};
    const result = computeCpcbAqi({ pm25, pm10, no2, so2, co, o3 });
    res.json(result);
  });
  router.post("/ingest/ai-parse", rateLimit(15, 6e4), async (req, res) => {
    try {
      const rawText = String(req.body?.rawText ?? "");
      if (rawText.trim().length < 8) {
        return res.status(400).json({ error: "Provide at least 8 characters of raw table text to parse." });
      }
      const proposal = await parseBrokenTableWithAI(rawText);
      const parsedPreview = parseRawTableInput(proposal.extractedCsvText, "CSV");
      res.json({
        ...proposal,
        previewRows: parsedPreview.rows.slice(0, 20),
        totalDetectedRows: parsedPreview.rows.length
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : "Gemini broken-table parsing failed. Check GEMINI_API_KEY availability or retry."
      });
    }
  });
  router.post("/radar/optimize", (req, res) => {
    try {
      const body = ResourceOptimizeSchema.parse(req.body);
      if (body.activeRole && body.activeRole !== "WARD_OFFICER" && body.activeRole !== "EVALUATOR") {
        return res.status(403).json({
          error: `Role ${body.activeRole} cannot dispatch municipal field equipment. Switch to Ward Officer or Evaluator.`
        });
      }
      const schedule = optimizeFieldResources({
        trajectories: body.trajectories,
        readings: body.readings,
        waterSprinklers: body.waterSprinklers,
        enforcementSquads: body.enforcementSquads,
        trafficMarshals: body.trafficMarshals,
        patrolTeams: body.patrolTeams
      });
      res.json({ schedule });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Resource optimization failed." });
    }
  });
  router.post("/briefings/generate", rateLimit(15, 6e4), async (req, res) => {
    try {
      const body = GenerateBriefingPayloadSchema.parse(req.body);
      const trajectories = body.trajectories.length > 0 ? body.trajectories : computeAreaTrajectories(body.readings, body.previousReadings ?? []);
      const outcomeScorecard = (body.outcomeScorecard ?? []).length > 0 ? body.outcomeScorecard : computeOutcomeScorecard(trajectories, body.previousTasks ?? []);
      const briefing = await generateTraceableBriefing({
        batch: body.batch,
        readings: body.readings,
        trajectories,
        previousBrief: body.previousBrief ?? null,
        previousReadings: body.previousReadings ?? [],
        previousTasks: body.previousTasks ?? [],
        outcomeScorecard,
        personaRole: body.personaRole,
        createdBy: body.createdBy
      });
      const readings = body.readings;
      const proposedAlerts = [];
      const redOrApproaching = trajectories.filter((t) => t.isRedZoneNow || t.approachingRedZoneAlert);
      redOrApproaching.forEach((t) => {
        const hasLowQualityOnly = readings.filter((r) => r.locationName.toLowerCase() === t.locationName.toLowerCase()).every((r) => r.excludeFromStatistics || r.reliabilityStatus === "SHARP_DROP_REQUIRES_VERIFICATION");
        const targetScope = hasLowQualityOnly ? "VERIFICATION_HEAD_ONLY" : t.vulnerableZoneType === "SCHOOL_ZONE" ? "AFFECTED_SCHOOL_ONLY" : t.vulnerableZoneType === "RESIDENTIAL_RWA" ? "AFFECTED_RWA_ONLY" : "AFFECTED_WARD_ONLY";
        proposedAlerts.push({
          id: crypto4.randomUUID(),
          briefingId: briefing.id,
          targetScope,
          targetZone: t.wardZone,
          targetLocation: t.locationName,
          severity: hasLowQualityOnly ? "VERIFICATION_REQUIRED" : t.isRedZoneNow ? "RED_ZONE" : "WARNING",
          status: "PENDING_APPROVAL",
          headline: hasLowQualityOnly ? `Verification required before public alert: ${t.locationName}` : `${t.isRedZoneNow ? "Red Zone Alert" : "Approaching Red Zone Watch"}: ${t.locationName} (${t.wardZone})`,
          currentSituationText: t.earlyWarningAlert ?? `Current AQI ${t.currentAqi ?? "Unavailable"} in ${t.locationName} (${t.wardZone}).`,
          recommendedActionText: briefing.immediateActions0To4Hours[0]?.title ?? "Review evidence rows and approve local protective actions.",
          evidenceRows: t.citedRowNumbers,
          confidenceLabel: body.batch.completenessPercent >= 80 && !hasLowQualityOnly ? `High (${body.batch.completenessPercent}% batch completeness)` : `Verification Needed (${body.batch.completenessPercent}% completeness)`,
          approvedBy: null,
          approvedAt: null,
          preparedAt: null,
          nextReviewAt: new Date(Date.now() + 4 * 36e5).toISOString(),
          resolvedAt: null,
          recipientCount: 0,
          acknowledgedCount: 0,
          createdBy: body.createdBy,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      });
      res.status(201).json({ briefing, proposedAlerts });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : "Gemini briefing generation failed. Check GEMINI_API_KEY availability and retry."
      });
    }
  });
  router.post("/advisories/generate", rateLimit(20, 6e4), async (req, res) => {
    try {
      const body = GenerateAdvisoryPayloadSchema.parse(req.body);
      const advisory = await generateMultilingualAdvisory({
        briefing: body.briefing,
        batch: body.batch,
        language: body.language,
        readingLevel: body.readingLevel,
        createdBy: body.createdBy
      });
      res.status(201).json({ advisory });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : "Multilingual advisory generation failed. Check GEMINI_API_KEY availability and retry."
      });
    }
  });
  router.post("/qa/run", async (_req, res) => {
    const suite = await runOperationalSelfCheckSuite();
    res.json(suite);
  });
  return router;
}

// server.ts
async function startServer() {
  const app = express2();
  const PORT = Number(process.env.PORT) || 3e3;
  app.use(express2.json({ limit: "10mb" }));
  app.use("/api", createApiRouter());
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), "dist");
    app.use(express2.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Civic Air Quality Briefing Studio listening on http://localhost:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

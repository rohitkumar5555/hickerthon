import crypto from 'node:crypto';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { z } from 'zod';
import type {
  ActionTaskRecord,
  AdvisoryLanguage,
  AreaTrajectoryRecord,
  BatchRecord,
  BriefingRecord,
  ColumnMappingConfig,
  OutcomeComparisonEntry,
  PersonaRole,
  ReadingLevel,
  ReadingRecord,
} from '../src/types/civic.js';

export const GEMINI_MODEL = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('Managed GEMINI_API_KEY is unavailable on the server. Ensure AI Studio Gemini secret is active and retry.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getModelName(): string {
  return GEMINI_MODEL;
}

// 1. AI Parse Broken / Unstructured Table Proposal
const AiParseProposalZod = z.object({
  detectedHeaders: z.array(z.string()).min(2),
  proposedMapping: z.object({
    location: z.string().optional(),
    ward: z.string().optional(),
    timestamp: z.string().optional(),
    latitude: z.string().optional(),
    longitude: z.string().optional(),
    vulnerableZone: z.string().optional(),
    pm25: z.string().optional(),
    pm10: z.string().optional(),
    no2: z.string().optional(),
    so2: z.string().optional(),
    co: z.string().optional(),
    o3: z.string().optional(),
    unit: z.string().optional(),
    reportedAqi: z.string().optional(),
  }),
  extractedCsvText: z.string().min(5),
  detectedUnitsNote: z.string(),
  ambiguityFlags: z.array(z.string()),
});

export async function parseBrokenTableWithAI(rawText: string): Promise<{
  detectedHeaders: string[];
  proposedMapping: ColumnMappingConfig;
  extractedCsvText: string;
  detectedUnitsNote: string;
  ambiguityFlags: string[];
  model: string;
  latencyMs: number;
}> {
  const ai = getGeminiClient();
  const model = getModelName();
  const started = Date.now();

  const prompt = [
    'You are an air-quality data parser. Extract tabular readings from the messy pasted text below into clean CSV format WITHOUT inventing, altering, or smoothing any numeric values or dates.',
    'Preserve N/A, -, null, units (like mg/m3, ug/m3, ppm), negative numbers, and spikes (like 9999) verbatim so downstream deterministic validation can audit them.',
    'Propose which column headers correspond to location, ward, timestamp, latitude, longitude, vulnerableZone, pm25, pm10, no2, so2, co, o3, unit, reportedAqi.',
    'List any ambiguities found.',
    '',
    'RAW INPUT:',
    rawText.slice(0, 18000),
  ].join('\n');

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction:
        'Convert unstructured or broken pasted air quality tables into clean CSV preserving every raw value and flagging ambiguities. Never invent numbers.',
      responseMimeType: 'application/json',
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
              reportedAqi: { type: Type.STRING },
            },
          },
          extractedCsvText: { type: Type.STRING },
          detectedUnitsNote: { type: Type.STRING },
          ambiguityFlags: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['detectedHeaders', 'proposedMapping', 'extractedCsvText', 'detectedUnitsNote', 'ambiguityFlags'],
      },
    },
  });

  const latencyMs = Date.now() - started;
  const rawJson = (response.text ?? '').trim();
  if (!rawJson) {
    throw new Error('Gemini returned an empty response during broken-table parsing.');
  }
  const parsed = AiParseProposalZod.parse(JSON.parse(rawJson));
  return {
    ...parsed,
    model,
    latencyMs,
  };
}

// 2. Traceable Civic Briefing Generator
const GeminiBriefingZod = z.object({
  plainLanguageSummary: z.string().min(20),
  observedFacts: z
    .array(
      z.object({
        fact: z.string(),
        citedRowNumbers: z.array(z.number().int().positive()).min(1),
      })
    )
    .min(1),
  hotspots: z.array(
    z.object({
      location: z.string(),
      wardZone: z.string(),
      aqi: z.number().nullable(),
      dominantPollutant: z.string(),
      possibleSourcePattern: z.string(),
      isExternalSpilloverRisk: z.boolean(),
      summary: z.string(),
      citedRowNumbers: z.array(z.number().int().positive()).min(1),
    })
  ),
  pastPresentProjectionMatrix: z.array(
    z.object({
      locationName: z.string(),
      wardZone: z.string(),
      previousState: z.string(),
      currentState: z.string(),
      shortTermProjection: z.string(),
      vulnerableGroupNote: z.string(),
      citedRowNumbers: z.array(z.number().int().positive()).min(1),
    })
  ),
  immediateActions0To4Hours: z.array(
    z.object({
      title: z.string(),
      rationale: z.string(),
      targetLocation: z.string(),
      timeframe: z.string(),
      citedRowNumbers: z.array(z.number().int().positive()).min(1),
    })
  ),
  doNotDoGuardrails: z.array(
    z.object({
      doNotAction: z.string(),
      scientificReason: z.string(),
      targetLocation: z.string(),
      citedRowNumbers: z.array(z.number().int().positive()).min(1),
    })
  ),
  futurePreventiveRoadmap7To30Days: z.array(
    z.object({
      title: z.string(),
      rationale: z.string(),
      targetLocation: z.string(),
      timeframe: z.string(),
      citedRowNumbers: z.array(z.number().int().positive()).min(1),
    })
  ),
  actionDrafts: z.array(
    z.object({
      instructedToSubordinate: z.string(),
      targetLocation: z.string(),
      draftInstructionText: z.string(),
      deadline: z.string(),
      taskType: z.enum(['URGENT_0_4H', 'PREVENTIVE_7_30D']),
      citedRowNumbers: z.array(z.number().int().positive()).min(1),
    })
  ),
  crossRoleEscalations: z.array(
    z.object({
      fromPersona: z.enum(['WARD_OFFICER', 'HOUSING_SOCIETY', 'SCHOOL_COORDINATOR']),
      toPersona: z.enum(['WARD_OFFICER', 'HOUSING_SOCIETY', 'SCHOOL_COORDINATOR']),
      targetLocation: z.string(),
      issueSummary: z.string(),
      requestedIntervention: z.string(),
      citedRowNumbers: z.array(z.number().int().positive()).min(1),
    })
  ),
  dataGapReport: z.array(
    z.object({
      issue: z.string(),
      severity: z.string(),
      citedRowNumbers: z.array(z.number().int().positive()).min(1),
    })
  ),
  comparisonWithPreviousNarrative: z.string(),
  pollutantShiftSummary: z.string(),
  internalBriefingMarkdown: z.string().min(30),
});

const PERSONA_ACTION_POLICY: Record<PersonaRole, string> = {
  WARD_OFFICER:
    'Allowed domain: Municipal road wet-sweeping/sprinkling (ONLY where fine-smoke misting is NOT contraindicated), construction tarpaulin/dust enforcement drafts, traffic marshals/no-idling corridors, waste-burning patrol enforcement, ward-level health coordination.',
  HOUSING_SOCIETY:
    'Allowed domain: RWA diesel generator (DG) compliance & backup timing, society gate tarpaulin checks, resident/delivery vehicle no-idling near gates, security guard advisories, senior/children park hour scheduling, escalating external municipal road/ward pollution to Ward Officer.',
  SCHOOL_COORDINATOR:
    'Allowed domain: Suspending or rescheduling outdoor assembly/PE sports, classroom window seal vs. ventilation timing based on safe window clock, infirmary inhaler/nebulizer readiness, school bus/parent drop-off anti-idling policy, parent/child communication, escalating nearby external dust/smoke to Ward Officer or RWA.',
};

export async function generateTraceableBriefing(params: {
  batch: BatchRecord;
  readings: ReadingRecord[];
  trajectories: AreaTrajectoryRecord[];
  previousBrief: BriefingRecord | null;
  previousReadings: ReadingRecord[];
  previousTasks: ActionTaskRecord[];
  outcomeScorecard: OutcomeComparisonEntry[];
  personaRole: PersonaRole;
  createdBy: string;
}): Promise<BriefingRecord> {
  const ai = getGeminiClient();
  const model = getModelName();
  const requestId = crypto.randomUUID();
  const started = Date.now();

  const validRowIndices = new Set(params.readings.map((r) => r.rowIndex));

  // Build deterministic summary payload (for large datasets, cap detailed row dump at 120 rows and disclose explicitly)
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
      o3_ug_m3: r.o3,
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
    flags: r.flags,
  }));

  const payloadObject = {
    activePersona: params.personaRole,
    personaPolicyCatalog: PERSONA_ACTION_POLICY[params.personaRole],
    batchMetadata: {
      title: params.batch.title,
      totalRows: params.batch.totalRows,
      rowsIncludedInPrompt: cappedReadings.length,
      truncatedNote: datasetTruncated
        ? `Dataset has ${params.readings.length} rows; first 120 rows plus full deterministic trajectories included.`
        : 'All rows included in prompt.',
      cleanRows: params.batch.cleanRows,
      convertedRows: params.batch.convertedRows,
      missingRows: params.batch.missingRows,
      unreliableRows: params.batch.unreliableRows,
      completenessPercent: params.batch.completenessPercent,
      safestOutdoorWindow: params.batch.safestOutdoorWindow,
      peakDangerWindow: params.batch.peakDangerWindow,
      isTestFixture: params.batch.isTestFixture,
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
      citedRowNumbers: t.citedRowNumbers,
    })),
    previousBriefSummary: params.previousBrief
      ? {
          briefingCode: params.previousBrief.briefingCode,
          createdAt: params.previousBrief.createdAt,
          hotspots: params.previousBrief.hotspots.map((h) => ({ location: h.location, aqi: h.aqi })),
        }
      : null,
    observedOutcomeScorecard: params.outcomeScorecard,
  };

  const sanitizedPayloadStr = JSON.stringify(payloadObject);

  const systemInstruction = [
    'You are a Civic Environmental Scientist and Municipal Operations Briefing Analyst.',
    'STRICT SCIENTIFIC & ANTI-HALLUCINATION RULES:',
    '1. Every factual claim, hotspot, guardrail, action draft, and data-gap finding MUST cite exact integer rowNumber values from validRowNumbers.',
    '2. NEVER cite any row number not present in validRowNumbers.',
    '3. NEVER invent AQI values or measurements. If calculatedAqi is null, state AQI is unavailable from supplied data.',
    '4. Always say "possible source pattern" — NEVER claim confirmed source causation or intentional sensor tampering as fact.',
    '5. Always label 24h estimates as "Short-term data projection — not a guaranteed forecast".',
    '6. Respect personaPolicyCatalog strictly: do NOT recommend actions outside the active persona\'s authority. Action drafts are advisory drafts for human head approval, not legally binding orders.',
    '7. Explicitly flag all missing readings, unit conversions, PM2.5 > PM10 inconsistencies, outliers, and sharp local drops requiring verification.',
    '8. Do NOT make medical diagnoses.',
    '9. Keep each item concise and operational (1-2 sentences per field, max 3-4 items per array).',
  ].join('\n');

  const prompt = `Generate a complete, traceable civic air quality briefing strictly grounded in the JSON payload below for persona ${params.personaRole}.\n\nDATA PAYLOAD:\n${sanitizedPayloadStr}`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction,
      responseMimeType: 'application/json',
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
                citedRowNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
              },
              required: ['fact', 'citedRowNumbers'],
            },
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
                citedRowNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
              },
              required: [
                'location',
                'wardZone',
                'dominantPollutant',
                'possibleSourcePattern',
                'isExternalSpilloverRisk',
                'summary',
                'citedRowNumbers',
              ],
            },
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
                citedRowNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
              },
              required: [
                'locationName',
                'wardZone',
                'previousState',
                'currentState',
                'shortTermProjection',
                'vulnerableGroupNote',
                'citedRowNumbers',
              ],
            },
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
                citedRowNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
              },
              required: ['title', 'rationale', 'targetLocation', 'timeframe', 'citedRowNumbers'],
            },
          },
          doNotDoGuardrails: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                doNotAction: { type: Type.STRING },
                scientificReason: { type: Type.STRING },
                targetLocation: { type: Type.STRING },
                citedRowNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
              },
              required: ['doNotAction', 'scientificReason', 'targetLocation', 'citedRowNumbers'],
            },
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
                citedRowNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
              },
              required: ['title', 'rationale', 'targetLocation', 'timeframe', 'citedRowNumbers'],
            },
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
                taskType: { type: Type.STRING, enum: ['URGENT_0_4H', 'PREVENTIVE_7_30D'] },
                citedRowNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
              },
              required: [
                'instructedToSubordinate',
                'targetLocation',
                'draftInstructionText',
                'deadline',
                'taskType',
                'citedRowNumbers',
              ],
            },
          },
          crossRoleEscalations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                fromPersona: { type: Type.STRING, enum: ['WARD_OFFICER', 'HOUSING_SOCIETY', 'SCHOOL_COORDINATOR'] },
                toPersona: { type: Type.STRING, enum: ['WARD_OFFICER', 'HOUSING_SOCIETY', 'SCHOOL_COORDINATOR'] },
                targetLocation: { type: Type.STRING },
                issueSummary: { type: Type.STRING },
                requestedIntervention: { type: Type.STRING },
                citedRowNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
              },
              required: [
                'fromPersona',
                'toPersona',
                'targetLocation',
                'issueSummary',
                'requestedIntervention',
                'citedRowNumbers',
              ],
            },
          },
          dataGapReport: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                issue: { type: Type.STRING },
                severity: { type: Type.STRING },
                citedRowNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
              },
              required: ['issue', 'severity', 'citedRowNumbers'],
            },
          },
          comparisonWithPreviousNarrative: { type: Type.STRING },
          pollutantShiftSummary: { type: Type.STRING },
          internalBriefingMarkdown: { type: Type.STRING },
        },
        required: [
          'plainLanguageSummary',
          'observedFacts',
          'hotspots',
          'pastPresentProjectionMatrix',
          'immediateActions0To4Hours',
          'doNotDoGuardrails',
          'futurePreventiveRoadmap7To30Days',
          'actionDrafts',
          'crossRoleEscalations',
          'dataGapReport',
          'comparisonWithPreviousNarrative',
          'pollutantShiftSummary',
          'internalBriefingMarkdown',
        ],
      },
    },
  });

  const latencyMs = Date.now() - started;
  const rawJson = (response.text ?? '').trim();
  if (!rawJson) {
    throw new Error('Gemini returned an empty response when generating the briefing.');
  }

  const parsed = GeminiBriefingZod.parse(JSON.parse(rawJson));

  // Verify every cited row number actually exists in the dataset
  const citationWarnings: string[] = [];
  const allCitedSet = new Set<number>();

  const validateCitations = (rows: number[], context: string): number[] => {
    const valid: number[] = [];
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

  // Compute deterministic comparison deltas against previous brief
  const validCurr = params.readings.filter((r) => !r.excludeFromStatistics && r.calculatedAqi !== null);
  const currAvg =
    validCurr.length > 0
      ? Math.round(validCurr.reduce((s, r) => s + (r.calculatedAqi ?? 0), 0) / validCurr.length)
      : null;

  const validPrev = params.previousReadings.filter((r) => !r.excludeFromStatistics && r.calculatedAqi !== null);
  const prevAvg =
    validPrev.length > 0
      ? Math.round(validPrev.reduce((s, r) => s + (r.calculatedAqi ?? 0), 0) / validPrev.length)
      : null;

  const overallAqiDelta = currAvg !== null && prevAvg !== null ? currAvg - prevAvg : null;

  const prevHotspotNames = new Set((params.previousBrief?.hotspots ?? []).map((h) => h.location.toLowerCase()));
  const currHotspotNames = new Set(parsed.hotspots.map((h) => h.location.toLowerCase()));
  const newHotspots = parsed.hotspots
    .filter((h) => !prevHotspotNames.has(h.location.toLowerCase()))
    .map((h) => h.location);
  const resolvedHotspots = (params.previousBrief?.hotspots ?? [])
    .filter((h) => !currHotspotNames.has(h.location.toLowerCase()))
    .map((h) => h.location);

  const briefNumber = String(Date.now()).slice(-4);
  const briefingCode = `BRF-${new Date().getFullYear()}-${briefNumber}`;

  return {
    id: crypto.randomUUID(),
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
      narrative: parsed.comparisonWithPreviousNarrative,
    },
    internalBriefingMarkdown: parsed.internalBriefingMarkdown,
    allCitedRows: Array.from(allCitedSet).sort((a, b) => a - b),
    citationValidationWarnings: citationWarnings,
    geminiModel: model,
    latencyMs,
    requestId,
    sanitizedPromptPayload: sanitizedPayloadStr,
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
  };
}

// 3. Multilingual & Multi-Reading-Level Citizen Advisory Generator
const GeminiAdvisoryZod = z.object({
  headline: z.string().min(5),
  currentSituation: z.string().min(15),
  pastPresentProjectionSummary: z.string().min(15),
  outdoorAndWindowGuidance: z.string().min(15),
  childrenCareSection: z.string().min(15),
  olderAdultsCareSection: z.string().min(15),
  sensitiveGroupsCareSection: z.string().min(15),
  dosAndDonts: z.object({
    dos: z.array(z.string()).min(2),
    donts: z.array(z.string()).min(2),
  }),
  whatsappReadyText: z.string().min(20),
});

export async function generateMultilingualAdvisory(params: {
  briefing: BriefingRecord;
  batch: BatchRecord;
  language: AdvisoryLanguage;
  readingLevel: ReadingLevel;
  createdBy: string;
}): Promise<{
  id: string;
  briefingId: string;
  language: AdvisoryLanguage;
  readingLevel: ReadingLevel;
  headline: string;
  currentSituation: string;
  pastPresentProjectionSummary: string;
  outdoorAndWindowGuidance: string;
  childrenCareSection: string;
  olderAdultsCareSection: string;
  sensitiveGroupsCareSection: string;
  dosAndDonts: { dos: string[]; donts: string[] };
  whatsappReadyText: string;
  disclaimer: string;
  geminiModel: string;
  latencyMs: number;
  createdBy: string;
  createdAt: string;
}> {
  const ai = getGeminiClient();
  const model = getModelName();
  const started = Date.now();

  const readingGuide =
    params.readingLevel === 'CHILD_FRIENDLY_SCHOOL_STORY'
      ? 'Write as a warm, encouraging, easy-to-understand school story or classroom guide for children ages 7–11 without causing fear.'
      : params.readingLevel === 'SIMPLE_PUBLIC_GRADE_5'
      ? 'Write in plain everyday Grade-5 reading level with short clear sentences for all residents.'
      : 'Write in clear, detailed civic and public-health awareness language explaining pollutant types, timing, and precautions.';

  const groundedFacts = {
    briefingCode: params.briefing.briefingCode,
    summary: params.briefing.plainLanguageSummary,
    hotspots: params.briefing.hotspots.map((h) => ({ location: h.location, ward: h.wardZone, aqi: h.aqi, pollutant: h.dominantPollutant })),
    safestOutdoorWindow: params.batch.safestOutdoorWindow,
    peakDangerWindow: params.batch.peakDangerWindow,
    windowAdvice: params.batch.windowVentilationAdvice,
    comparison: params.briefing.comparisonWithPrevious.narrative,
    guardrails: params.briefing.doNotDoGuardrails.map((g) => g.doNotAction),
  };

  const prompt = [
    `Write a citizen air-quality advisory in language: "${params.language}".`,
    `Tone/Reading Level: ${readingGuide}`,
    'MANDATORY SECTIONS: Dedicated extra-care sections for (1) Children & Infants, (2) Older Adults (60+), and (3) People Sensitive to Poor Air (asthma, COPD, heart patients, pregnant women, outdoor workers).',
    'Include exact outdoor & window ventilation timing based only on the facts below.',
    'Do NOT invent AQI numbers, do NOT claim medical diagnosis, and keep language culturally natural in the requested language.',
    '',
    'GROUNDED FACTS:',
    JSON.stringify(groundedFacts),
  ].join('\n');

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction:
        'Generate accurate, compassionate, multilingual citizen air-quality advisories grounded strictly in provided facts.',
      responseMimeType: 'application/json',
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
              donts: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['dos', 'donts'],
          },
          whatsappReadyText: { type: Type.STRING },
        },
        required: [
          'headline',
          'currentSituation',
          'pastPresentProjectionSummary',
          'outdoorAndWindowGuidance',
          'childrenCareSection',
          'olderAdultsCareSection',
          'sensitiveGroupsCareSection',
          'dosAndDonts',
          'whatsappReadyText',
        ],
      },
    },
  });

  const latencyMs = Date.now() - started;
  const rawJson = (response.text ?? '').trim();
  if (!rawJson) {
    throw new Error(`Gemini returned an empty advisory for language ${params.language}.`);
  }

  const parsed = GeminiAdvisoryZod.parse(JSON.parse(rawJson));
  return {
    id: crypto.randomUUID(),
    briefingId: params.briefing.id,
    language: params.language,
    readingLevel: params.readingLevel,
    ...parsed,
    disclaimer:
      'Community air quality guidance only — does not replace official municipal emergency orders or clinical medical advice.',
    geminiModel: model,
    latencyMs,
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
  };
}

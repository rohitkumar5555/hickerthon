import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  GenerateAdvisoryPayloadSchema,
  GenerateBriefingPayloadSchema,
  ParseBatchRequestSchema,
  ResourceOptimizeSchema,
  type AlertRecord,
  type AreaTrajectoryRecord,
  type OutcomeComparisonEntry,
  type ReadingRecord,
} from '../src/types/civic.js';
import {
  computeAreaTrajectories,
  computeCpcbAqi,
  computeOutcomeScorecard,
  normalizeAndAuditBatch,
  optimizeFieldResources,
  parseRawTableInput,
  parseUploadedFileBuffer,
} from './analytics.js';
import { EVALUATOR_TEST_FIXTURES } from './fixtures.js';
import {
  GEMINI_MODEL,
  generateMultilingualAdvisory,
  generateTraceableBriefing,
  parseBrokenTableWithAI,
} from './gemini.js';
import { runOperationalSelfCheckSuite } from './qaRunner.js';

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Please wait a moment and retry.' });
    }
    bucket.count++;
    next();
  };
}

export function createApiRouter() {
  const router = express.Router();

  // Health Check (zero-config mode: only GEMINI_API_KEY managed by AI Studio)
  router.get('/health', (_req, res) => {
    const geminiConfigured = Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    );
    res.json({
      ok: true,
      geminiConfigured,
      geminiModel: GEMINI_MODEL,
      storageMode: 'IndexedDB (Local-Device Browser Workspace via Dexie)',
      mapMode: 'Leaflet + OpenStreetMap (Zero-Key)',
      timestamp: new Date().toISOString(),
    });
  });

  // Labelled Test Fixtures
  router.get('/ingest/fixtures', (_req, res) => {
    res.json({
      fixtures: EVALUATOR_TEST_FIXTURES.map((f) => ({
        id: f.id,
        label: f.label,
        disclaimer: f.disclaimer,
        title: f.title,
        sourceType: f.sourceType,
        description: f.description,
      })),
    });
  });

  router.get('/ingest/fixtures/:id', (req, res) => {
    const fixture = EVALUATOR_TEST_FIXTURES.find((f) => f.id === req.params.id);
    if (!fixture) return res.status(404).json({ error: 'Fixture not found.' });
    res.json(fixture);
  });

  // Upload Data File (.csv, .tsv, .json, .xlsx) -> stateless parse for IndexedDB persistence
  router.post('/ingest/upload', (req, res) => {
    try {
      const { filename, contentBase64 } = req.body ?? {};
      if (!filename || typeof filename !== 'string' || !contentBase64 || typeof contentBase64 !== 'string') {
        return res.status(400).json({ error: 'Filename and file content are required.' });
      }
      const lower = filename.toLowerCase();
      if (!['.csv', '.tsv', '.json', '.xlsx', '.xls'].some((ext) => lower.endsWith(ext))) {
        return res.status(400).json({ error: 'Unsupported file format. Upload .csv, .tsv, .json, or .xlsx.' });
      }
      const buffer = Buffer.from(contentBase64, 'base64');
      if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
        return res.status(400).json({ error: 'File is empty or exceeds 5 MB limit.' });
      }
      const { rawText, sourceType, parsed } = parseUploadedFileBuffer(buffer, filename);

      res.json({
        storagePath: `indexeddb://uploads/${filename}`,
        storageProvider: 'INDEXEDDB_DEXIE',
        sourceType,
        rawText,
        headers: parsed.headers,
        previewRows: parsed.rows.slice(0, 15),
        totalDetectedRows: parsed.rows.length,
        proposedMapping: parsed.proposedMapping,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to parse uploaded file.' });
    }
  });

  // Preview Raw Table (deterministic)
  router.post('/ingest/preview', (req, res) => {
    try {
      const { rawText, sourceType } = req.body ?? {};
      const parsed = parseRawTableInput(String(rawText ?? ''), sourceType);
      res.json({
        headers: parsed.headers,
        previewRows: parsed.rows.slice(0, 20),
        totalDetectedRows: parsed.rows.length,
        detectedDelimiter: parsed.detectedDelimiter,
        proposedMapping: parsed.proposedMapping,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to parse table preview.' });
    }
  });

  // Normalize & Audit Batch deterministically (returns normalized batch, readings, trajectories for IndexedDB commit)
  router.post('/ingest/normalize', (req, res) => {
    try {
      const body = ParseBatchRequestSchema.parse(req.body);
      const parsed = parseRawTableInput(body.rawText, body.sourceType);
      const batchId = body.batchId || `batch_${crypto.randomUUID().slice(0, 12)}`;
      const previousBatchReadings = (body.previousBatchReadings ?? []) as ReadingRecord[];

      const { batch, readings } = normalizeAndAuditBatch({
        batchId,
        title: body.title,
        sourceType: body.sourceType,
        storagePath: req.body.storagePath || 'indexeddb://inline_paste',
        storageProvider: 'INDEXEDDB_DEXIE',
        rawInputText: body.rawText,
        parsed,
        customMapping: body.columnMapping,
        createdBy: body.createdBy || 'local-role-user',
        isTestFixture: body.isTestFixture,
        fixtureLabel: body.fixtureLabel,
        previousBatchReadings,
      });

      const trajectories = computeAreaTrajectories(readings, previousBatchReadings);
      res.status(200).json({ batch, readings, trajectories });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to normalize batch.' });
    }
  });

  // Recompute single reading CPCB AQI deterministically after inline human review
  router.post('/readings/recompute-aqi', (req, res) => {
    const { pm25 = null, pm10 = null, no2 = null, so2 = null, co = null, o3 = null } = req.body ?? {};
    const result = computeCpcbAqi({ pm25, pm10, no2, so2, co, o3 });
    res.json(result);
  });

  // AI Parse Broken Table (Real @google/genai Call — Human Review Required Before Commit)
  router.post('/ingest/ai-parse', rateLimit(15, 60_000), async (req, res) => {
    try {
      const rawText = String(req.body?.rawText ?? '');
      if (rawText.trim().length < 8) {
        return res.status(400).json({ error: 'Provide at least 8 characters of raw table text to parse.' });
      }
      const proposal = await parseBrokenTableWithAI(rawText);
      const parsedPreview = parseRawTableInput(proposal.extractedCsvText, 'CSV');
      res.json({
        ...proposal,
        previewRows: parsedPreview.rows.slice(0, 20),
        totalDetectedRows: parsedPreview.rows.length,
      });
    } catch (err) {
      res.status(502).json({
        error:
          err instanceof Error
            ? err.message
            : 'Gemini broken-table parsing failed. Check GEMINI_API_KEY availability or retry.',
      });
    }
  });

  // Constrained Field Resource Optimizer (Ward Officer / Evaluator role check)
  router.post('/radar/optimize', (req, res) => {
    try {
      const body = ResourceOptimizeSchema.parse(req.body);
      if (body.activeRole && body.activeRole !== 'WARD_OFFICER' && body.activeRole !== 'EVALUATOR') {
        return res.status(403).json({
          error: `Role ${body.activeRole} cannot dispatch municipal field equipment. Switch to Ward Officer or Evaluator.`,
        });
      }

      const schedule = optimizeFieldResources({
        trajectories: body.trajectories as AreaTrajectoryRecord[],
        readings: body.readings as ReadingRecord[],
        waterSprinklers: body.waterSprinklers,
        enforcementSquads: body.enforcementSquads,
        trafficMarshals: body.trafficMarshals,
        patrolTeams: body.patrolTeams,
      });

      res.json({ schedule });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Resource optimization failed.' });
    }
  });

  // Real Gemini Traceable Briefing Generation
  router.post('/briefings/generate', rateLimit(15, 60_000), async (req, res) => {
    try {
      const body = GenerateBriefingPayloadSchema.parse(req.body);
      const trajectories = (body.trajectories as AreaTrajectoryRecord[]).length > 0
        ? (body.trajectories as AreaTrajectoryRecord[])
        : computeAreaTrajectories(body.readings as ReadingRecord[], (body.previousReadings ?? []) as ReadingRecord[]);

      const outcomeScorecard: OutcomeComparisonEntry[] =
        (body.outcomeScorecard ?? []).length > 0
          ? (body.outcomeScorecard as OutcomeComparisonEntry[])
          : computeOutcomeScorecard(trajectories, body.previousTasks ?? []);

      const briefing = await generateTraceableBriefing({
        batch: body.batch,
        readings: body.readings as ReadingRecord[],
        trajectories,
        previousBrief: body.previousBrief ?? null,
        previousReadings: (body.previousReadings ?? []) as ReadingRecord[],
        previousTasks: body.previousTasks ?? [],
        outcomeScorecard,
        personaRole: body.personaRole,
        createdBy: body.createdBy,
      });

      // Build PENDING_APPROVAL targeted zone alert proposals ONLY for confirmed affected zones or verification warnings
      const readings = body.readings as ReadingRecord[];
      const proposedAlerts: AlertRecord[] = [];
      const redOrApproaching = trajectories.filter((t) => t.isRedZoneNow || t.approachingRedZoneAlert);

      redOrApproaching.forEach((t) => {
        const hasLowQualityOnly = readings
          .filter((r) => r.locationName.toLowerCase() === t.locationName.toLowerCase())
          .every((r) => r.excludeFromStatistics || r.reliabilityStatus === 'SHARP_DROP_REQUIRES_VERIFICATION');

        const targetScope: AlertRecord['targetScope'] = hasLowQualityOnly
          ? 'VERIFICATION_HEAD_ONLY'
          : t.vulnerableZoneType === 'SCHOOL_ZONE'
          ? 'AFFECTED_SCHOOL_ONLY'
          : t.vulnerableZoneType === 'RESIDENTIAL_RWA'
          ? 'AFFECTED_RWA_ONLY'
          : 'AFFECTED_WARD_ONLY';

        proposedAlerts.push({
          id: crypto.randomUUID(),
          briefingId: briefing.id,
          targetScope,
          targetZone: t.wardZone,
          targetLocation: t.locationName,
          severity: hasLowQualityOnly ? 'VERIFICATION_REQUIRED' : t.isRedZoneNow ? 'RED_ZONE' : 'WARNING',
          status: 'PENDING_APPROVAL',
          headline: hasLowQualityOnly
            ? `Verification required before public alert: ${t.locationName}`
            : `${t.isRedZoneNow ? 'Red Zone Alert' : 'Approaching Red Zone Watch'}: ${t.locationName} (${t.wardZone})`,
          currentSituationText:
            t.earlyWarningAlert ??
            `Current AQI ${t.currentAqi ?? 'Unavailable'} in ${t.locationName} (${t.wardZone}).`,
          recommendedActionText:
            briefing.immediateActions0To4Hours[0]?.title ??
            'Review evidence rows and approve local protective actions.',
          evidenceRows: t.citedRowNumbers,
          confidenceLabel:
            body.batch.completenessPercent >= 80 && !hasLowQualityOnly
              ? `High (${body.batch.completenessPercent}% batch completeness)`
              : `Verification Needed (${body.batch.completenessPercent}% completeness)`,
          approvedBy: null,
          approvedAt: null,
          preparedAt: null,
          nextReviewAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
          resolvedAt: null,
          recipientCount: 0,
          acknowledgedCount: 0,
          createdBy: body.createdBy,
          createdAt: new Date().toISOString(),
        });
      });

      res.status(201).json({ briefing, proposedAlerts });
    } catch (err) {
      res.status(502).json({
        error:
          err instanceof Error
            ? err.message
            : 'Gemini briefing generation failed. Check GEMINI_API_KEY availability and retry.',
      });
    }
  });

  // Multilingual Citizen Advisory (Real Gemini Call)
  router.post('/advisories/generate', rateLimit(20, 60_000), async (req, res) => {
    try {
      const body = GenerateAdvisoryPayloadSchema.parse(req.body);
      const advisory = await generateMultilingualAdvisory({
        briefing: body.briefing,
        batch: body.batch,
        language: body.language,
        readingLevel: body.readingLevel,
        createdBy: body.createdBy,
      });
      res.status(201).json({ advisory });
    } catch (err) {
      res.status(502).json({
        error:
          err instanceof Error
            ? err.message
            : 'Multilingual advisory generation failed. Check GEMINI_API_KEY availability and retry.',
      });
    }
  });

  // Isolated Server-Side Operational Self-Check Suite
  router.post('/qa/run', async (_req, res) => {
    const suite = await runOperationalSelfCheckSuite();
    res.json(suite);
  });

  return router;
}

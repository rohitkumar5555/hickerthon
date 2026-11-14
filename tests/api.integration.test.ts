import http from 'node:http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiRouter } from '../server/routes.js';

let server: http.Server;
let baseUrl = '';

async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', createApiRouter());

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('Civic Studio Zero-Config Stateless API Integration', () => {
  it('returns zero-config health diagnostics with active Gemini model and no leaked secrets', async () => {
    const health = await apiFetch('/api/health');
    expect(health.status).toBe(200);
    expect(health.json.ok).toBe(true);
    expect(health.json.geminiModel).toBe('gemini-4-hydrogen');
    expect(health.json.mapMode).toContain('Leaflet');
    expect(health.json.storageMode).toContain('IndexedDB');
    expect(JSON.stringify(health.json)).not.toContain('MY_GEMINI_API_KEY');
  });

  it('normalizes fixture 1 & fixture 2 cleanly with unit conversions, anomaly flags, and trajectory math', async () => {
    const f1 = await apiFetch('/api/ingest/fixtures/fixture_1_baseline');
    expect(f1.status).toBe(200);

    const n1 = await apiFetch('/api/ingest/normalize', {
      method: 'POST',
      body: JSON.stringify({
        title: f1.json.title,
        rawText: f1.json.rawText,
        sourceType: 'TEST_FIXTURE',
        isTestFixture: true,
        fixtureLabel: f1.json.label,
        createdBy: 'EVALUATOR',
      }),
    });
    expect(n1.status).toBe(200);
    const readings1 = n1.json.readings as Array<Record<string, unknown>>;
    expect(readings1.length).toBeGreaterThan(0);

    const f2 = await apiFetch('/api/ingest/fixtures/fixture_2_messy_current');
    expect(f2.status).toBe(200);

    const n2 = await apiFetch('/api/ingest/normalize', {
      method: 'POST',
      body: JSON.stringify({
        title: f2.json.title,
        rawText: f2.json.rawText,
        sourceType: 'TEST_FIXTURE',
        isTestFixture: true,
        fixtureLabel: f2.json.label,
        previousBatchReadings: readings1,
        createdBy: 'EVALUATOR',
      }),
    });
    expect(n2.status).toBe(200);
    const batch2 = n2.json.batch as { excludedRows: number; convertedRows: number };
    const readings2 = n2.json.readings as Array<{ reliabilityStatus: string }>;
    const trajectories2 = n2.json.trajectories as Array<Record<string, unknown>>;
    expect(batch2.convertedRows).toBeGreaterThanOrEqual(1);
    expect(batch2.excludedRows).toBeGreaterThanOrEqual(3);
    expect(readings2.some((r) => r.reliabilityStatus === 'CONVERSION_UNAVAILABLE')).toBe(true);
    expect(trajectories2.length).toBeGreaterThan(0);
  });

  it('enforces operating-role restriction on municipal field resource optimization', async () => {
    const forbiddenRes = await apiFetch('/api/radar/optimize', {
      method: 'POST',
      body: JSON.stringify({
        activeRole: 'SCHOOL_COORDINATOR',
        trajectories: [],
        readings: [],
        waterSprinklers: 1,
        enforcementSquads: 1,
        trafficMarshals: 1,
        patrolTeams: 1,
      }),
    });
    expect(forbiddenRes.status).toBe(403);

    const f2 = await apiFetch('/api/ingest/fixtures/fixture_2_messy_current');
    const norm = await apiFetch('/api/ingest/normalize', {
      method: 'POST',
      body: JSON.stringify({
        title: f2.json.title,
        rawText: f2.json.rawText,
        sourceType: 'TEST_FIXTURE',
        isTestFixture: true,
      }),
    });

    const okRes = await apiFetch('/api/radar/optimize', {
      method: 'POST',
      body: JSON.stringify({
        activeRole: 'WARD_OFFICER',
        trajectories: norm.json.trajectories,
        readings: norm.json.readings,
        waterSprinklers: 1,
        enforcementSquads: 1,
        trafficMarshals: 1,
        patrolTeams: 1,
      }),
    });
    expect(okRes.status).toBe(200);
    expect(Array.isArray(okRes.json.schedule)).toBe(true);
  });

  it('recomputes CPCB AQI deterministically and runs the 12-point operational QA self-check', async () => {
    const aqiRes = await apiFetch('/api/readings/recompute-aqi', {
      method: 'POST',
      body: JSON.stringify({ pm25: 130, pm10: 210, no2: 40, so2: null, co: null, o3: null }),
    });
    expect(aqiRes.status).toBe(200);
    expect(Number(aqiRes.json.aqi)).toBeGreaterThanOrEqual(301);

    const health = await apiFetch('/api/health');
    const geminiConfigured = Boolean(health.json.geminiConfigured);

    const qaRes = await apiFetch('/api/qa/run', { method: 'POST' });
    expect(qaRes.status).toBe(200);
    const summary = qaRes.json.summary as { passed: number; failed: number };
    const results = qaRes.json.results as Array<{ testId: string; passed: boolean; actual: string }>;
    const deterministic = results.filter((r) => r.testId !== 'QA-12');
    expect(deterministic.every((r) => r.passed)).toBe(true);

    if (geminiConfigured) {
      expect(summary.failed).toBe(0);
      expect(summary.passed).toBe(12);
    } else {
      const qa12 = results.find((r) => r.testId === 'QA-12')!;
      expect(qa12.passed).toBe(false);
      expect(qa12.actual).toContain('GEMINI_API_KEY');
    }
  });
});

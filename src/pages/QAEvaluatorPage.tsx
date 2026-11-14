import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  Map as MapIcon,
  Play,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { wipeLocalWorkspaceTransaction } from '../db/civicDexie';
import type { QATestResult } from '../types/civic';

interface QASuiteResponse {
  summary: { total: number; passed: number; failed: number; executedAt: string };
  results: QATestResult[];
}

export const QAEvaluatorPage: React.FC = () => {
  const { activeRole, workspace, refreshWorkspace, logLocalAudit, notify } = useStudio();
  const [running, setRunning] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [qaSuite, setQaSuite] = useState<QASuiteResponse | null>(null);
  const [health, setHealth] = useState<{
    ok: boolean;
    geminiConfigured: boolean;
    geminiModel: string;
    mapEngine?: string;
    persistence?: { clientWorkspace: string; serverMode: string };
  } | null>(null);

  const auditLogs = workspace?.auditLogs ?? [];

  const loadDiagnostics = useCallback(async () => {
    try {
      const hRes = await fetch('/api/health');
      if (hRes.ok) setHealth(await hRes.json());
    } catch {
      // Ignore transient load error
    }
  }, []);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);

  const handleRunQA = async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/qa/run', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        notify('error', data.error || 'QA self-check execution failed.');
        return;
      }
      setQaSuite(data);
      await logLocalAudit('QA_SELF_CHECK_EXECUTED', 'qa_suite', 'self_check', {
        passed: data.summary.passed,
        failed: data.summary.failed,
      });
      await loadDiagnostics();
      notify(
        data.summary.failed === 0 ? 'success' : 'error',
        `Operational self-check finished: ${data.summary.passed}/${data.summary.total} checks passed.`
      );
    } catch {
      notify('error', 'Network error running QA self-check.');
    } finally {
      setRunning(false);
    }
  };

  const handleWipeLocalWorkspace = async () => {
    if (!activeRole) return;
    setWiping(true);
    try {
      await wipeLocalWorkspaceTransaction(activeRole);
      setConfirmWipe(false);
      await refreshWorkspace();
      await loadDiagnostics();
      notify('success', 'Local IndexedDB workspace wiped. System verified in true 0-state.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to wipe local workspace.');
    } finally {
      setWiping(false);
    }
  };

  if (activeRole !== 'EVALUATOR') {
    return (
      <div className="bg-white border border-red-200 rounded-xl p-6 text-sm text-red-900">
        403 Forbidden: QA Evaluator Diagnostics are restricted to the EVALUATOR operating role. Use &quot;Switch Role&quot; in the header to evaluate.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">QA Evaluator &amp; Audit Console</h1>
          <p className="text-xs text-slate-600 mt-1">
            Isolated server-side operational verification suite, local IndexedDB persistence diagnostics, audit trail, and true 0-state reset.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={running}
            onClick={() => void handleRunQA()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-60"
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Running Self-Check...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" aria-hidden="true" />
                <span>Run Operational Self-Check Suite</span>
              </>
            )}
          </button>

          {!confirmWipe ? (
            <button
              type="button"
              onClick={() => setConfirmWipe(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-red-300 bg-red-50 text-red-800 text-xs font-semibold rounded-lg hover:bg-red-100"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              <span>Wipe Local Workspace</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-red-50 border border-red-300 rounded-lg px-3 py-1.5 text-xs">
              <span className="font-semibold text-red-900">Confirm 0-state wipe?</span>
              <button
                type="button"
                disabled={wiping}
                onClick={() => void handleWipeLocalWorkspace()}
                className="px-2.5 py-1 bg-red-700 text-white rounded font-semibold hover:bg-red-800"
              >
                {wiping ? 'Wiping...' : 'Confirm Wipe'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmWipe(false)}
                className="px-2 py-1 border border-slate-300 bg-white rounded text-slate-700"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Live Runtime & Persistence Verification */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="font-semibold text-slate-500 uppercase">Gemini AI Service</div>
          <div className="text-sm font-bold text-slate-900">
            {health
              ? health.geminiConfigured
                ? `Configured (${health.geminiModel})`
                : 'Managed GEMINI_API_KEY unavailable'
              : 'Checking...'}
          </div>
          <div className="text-[11px] text-slate-500">Server-side @google/genai · Zero user config</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="font-semibold text-slate-500 uppercase flex items-center gap-1">
            <MapIcon className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Evidence Map Engine</span>
          </div>
          <div className="text-sm font-bold text-slate-900">
            {health?.mapEngine ?? 'Leaflet + OpenStreetMap (Zero-Key)'}
          </div>
          <div className="text-[11px] text-slate-500">Plots only verified imported coordinates</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="font-semibold text-slate-500 uppercase flex items-center gap-1">
            <Database className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Local Workspace Storage</span>
          </div>
          <div className="text-sm font-bold text-slate-900 font-mono tabular-nums">
            {workspace?.batches.length ?? 0} batches · {workspace?.readings.length ?? 0} rows
          </div>
          <div className="text-[11px] text-slate-500">
            IndexedDB (Dexie ACID) · Stored in this browser only
          </div>
        </div>
      </section>

      {/* QA Self-Check Output Table */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-700" aria-hidden="true" />
            <span>Automated 12-Point Operational Self-Check Results</span>
          </h2>
          {qaSuite && (
            <span className="text-xs font-mono tabular-nums font-semibold text-slate-800">
              Passed: {qaSuite.summary.passed}/{qaSuite.summary.total} · Executed{' '}
              {new Date(qaSuite.summary.executedAt).toLocaleTimeString()}
            </span>
          )}
        </div>

        {!qaSuite ? (
          <div className="text-xs text-slate-600 py-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
            <span>
              Click &quot;Run Operational Self-Check Suite&quot; to execute live unit conversion, CPCB AQI, trajectory,
              contraindication, XSS sanitization, and live Gemini checks on the server without mutating local workspace data.
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-semibold">Test ID</th>
                  <th className="px-3 py-2 font-semibold">Category</th>
                  <th className="px-3 py-2 font-semibold">Scenario</th>
                  <th className="px-3 py-2 font-semibold">Expected</th>
                  <th className="px-3 py-2 font-semibold">Actual</th>
                  <th className="px-3 py-2 font-semibold">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {qaSuite.results.map((r) => (
                  <tr key={r.testId}>
                    <td className="px-3 py-2 font-mono font-semibold text-slate-900 whitespace-nowrap">{r.testId}</td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.category}</td>
                    <td className="px-3 py-2 text-slate-800">{r.scenario}</td>
                    <td className="px-3 py-2 text-slate-600">{r.expected}</td>
                    <td className="px-3 py-2 font-mono text-slate-700">{r.actual}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.passed ? (
                        <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>PASS</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-800 font-semibold">
                          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>FAIL</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Live Local Audit Log Stream */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          Local Workspace Audit Log ({auditLogs.length})
        </h2>
        <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-96 overflow-y-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
              <tr>
                <th className="px-3 py-2 font-semibold">Timestamp</th>
                <th className="px-3 py-2 font-semibold">Operating Role</th>
                <th className="px-3 py-2 font-semibold">Action</th>
                <th className="px-3 py-2 font-semibold">Entity</th>
                <th className="px-3 py-2 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-slate-800 whitespace-nowrap">{log.actorRole}</td>
                  <td className="px-3 py-2 font-mono font-semibold text-slate-900 whitespace-nowrap">{log.action}</td>
                  <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                    {log.entityType}:{log.entityId.slice(0, 12)}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-600 max-w-md truncate">
                    {JSON.stringify(log.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

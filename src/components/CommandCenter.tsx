import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock,
  Copy,
  FileSpreadsheet,
  HelpCircle,
  Loader2,
  MapPin,
  OctagonAlert,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import type { AppRoute } from './Layout';
import { AqiStatusIndicator, CitationChip } from './StatusBadge';
import {
  alertActionTransaction,
  commitBatchTransaction,
  saveBriefingAndAlertsTransaction,
} from '../db/civicDexie';

export const CommandCenter: React.FC<{ onNavigate: (r: AppRoute) => void }> = ({ onNavigate }) => {
  const { workspace, activePersona, activeRole, openEvidenceRow, refreshWorkspace, notify } = useStudio();
  const [busyAlertId, setBusyAlertId] = useState<string | null>(null);
  const [loadingFixture, setLoadingFixture] = useState(false);
  const [analyzingBrief, setAnalyzingBrief] = useState(false);

  const stats = useMemo(() => {
    const batches = workspace?.batches ?? [];
    const latestBatch = batches[0] ?? null;
    const latestReadings = latestBatch
      ? (workspace?.readings ?? []).filter((r) => r.batchId === latestBatch.id)
      : [];
    const validReadings = latestReadings.filter((r) => !r.excludeFromStatistics && r.calculatedAqi !== null);
    const maxAqi =
      validReadings.length > 0 ? Math.max(...validReadings.map((r) => r.calculatedAqi ?? 0)) : null;
    const avgAqi =
      validReadings.length > 0
        ? Math.round(validReadings.reduce((s, r) => s + (r.calculatedAqi ?? 0), 0) / validReadings.length)
        : null;
    const trajectories = workspace?.trajectories ?? [];
    const affectedAreas = trajectories.filter((t) => (t.currentAqi ?? 0) >= 201 || t.approachingRedZoneAlert);
    const topHotspot = trajectories[0] ?? null;
    const latestBrief = workspace?.briefings[0] ?? null;
    const tasks = workspace?.actionTasks ?? [];
    const activeTasks = tasks.filter(
      (t) => t.status === 'DISPATCHED' || t.status === 'IN_PROGRESS' || t.status === 'OPEN'
    );
    const alerts = workspace?.alerts ?? [];
    const outcomeScorecard = workspace?.outcomeScorecard ?? [];
    const mappedReadings = latestReadings.filter(
      (r) =>
        r.latitude !== null &&
        r.longitude !== null &&
        Number.isFinite(r.latitude) &&
        Number.isFinite(r.longitude)
    );

    return {
      batches,
      latestBatch,
      latestReadings,
      validReadings,
      maxAqi,
      avgAqi,
      trajectories,
      affectedAreas,
      topHotspot,
      latestBrief,
      tasks,
      activeTasks,
      alerts,
      outcomeScorecard,
      mappedReadings,
    };
  }, [workspace]);

  const handleLoadEvaluatorFixture = async () => {
    if (!activeRole) return;
    setLoadingFixture(true);
    try {
      const f1Res = await fetch('/api/ingest/fixtures/fixture_1_baseline');
      const f2Res = await fetch('/api/ingest/fixtures/fixture_2_messy_current');
      if (!f1Res.ok || !f2Res.ok) {
        notify('error', 'Failed to load test fixture.');
        return;
      }
      const f1 = await f1Res.json();
      const f2 = await f2Res.json();

      const n1Res = await fetch('/api/ingest/normalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: f1.title,
          rawText: f1.rawText,
          sourceType: 'TEST_FIXTURE',
          isTestFixture: true,
          fixtureLabel: f1.label,
          createdBy: activeRole,
        }),
      });
      const n1 = await n1Res.json();
      if (!n1Res.ok) {
        notify('error', n1.error || 'Failed to normalize baseline fixture.');
        return;
      }
      await commitBatchTransaction(activeRole, n1.batch, n1.readings);

      const n2Res = await fetch('/api/ingest/normalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: f2.title,
          rawText: f2.rawText,
          sourceType: 'TEST_FIXTURE',
          isTestFixture: true,
          fixtureLabel: f2.label,
          previousBatchReadings: n1.readings,
          createdBy: activeRole,
        }),
      });
      const n2 = await n2Res.json();
      if (!n2Res.ok) {
        notify('error', n2.error || 'Failed to normalize test fixture.');
        return;
      }
      await commitBatchTransaction(activeRole, n2.batch, n2.readings);
      await refreshWorkspace();
      notify('success', 'Loaded labelled baseline and current test fixtures.');
    } catch {
      notify('error', 'Unable to load test fixture.');
    } finally {
      setLoadingFixture(false);
    }
  };

  const handleQuickAnalyzeGemini = async () => {
    if (!activeRole || !stats.latestBatch || stats.latestReadings.length === 0) return;
    setAnalyzingBrief(true);
    try {
      const prevBatch = stats.batches[1] ?? null;
      const previousReadings = prevBatch
        ? (workspace?.readings ?? []).filter((r) => r.batchId === prevBatch.id)
        : [];
      const res = await fetch('/api/briefings/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch: stats.latestBatch,
          readings: stats.latestReadings,
          trajectories: stats.trajectories,
          previousBrief: stats.latestBrief,
          previousReadings,
          previousTasks: stats.tasks,
          outcomeScorecard: stats.outcomeScorecard,
          personaRole: activePersona,
          createdBy: activeRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify('error', data.error || 'Gemini briefing generation failed.');
        return;
      }
      await saveBriefingAndAlertsTransaction(activeRole, data.briefing, data.proposedAlerts ?? []);
      await refreshWorkspace();
      notify('success', `Briefing ${data.briefing.briefingCode} generated.`);
    } catch {
      notify('error', 'Unable to reach Gemini briefing service.');
    } finally {
      setAnalyzingBrief(false);
    }
  };

  const handleAlertAction = async (
    alertId: string,
    action: 'APPROVE_AND_PREPARE' | 'REQUEST_VERIFICATION' | 'REJECT' | 'RESOLVE' | 'ACKNOWLEDGE'
  ) => {
    if (!activeRole) return;
    setBusyAlertId(alertId);
    try {
      const updated = await alertActionTransaction(activeRole, alertId, action);
      await refreshWorkspace();
      notify('success', `Alert updated (${updated.status}).`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Alert update failed.');
    } finally {
      setBusyAlertId(null);
    }
  };

  const handleCopyAlert = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify('success', 'Approved alert copied to clipboard.');
    } catch {
      notify('error', 'Clipboard unavailable.');
    }
  };

  // Clean Empty State when no analyzed data exists
  if (!stats.latestBatch) {
    return (
      <div className="max-w-xl mx-auto mt-10 bg-white border border-slate-200 rounded-xl p-8 text-center space-y-5">
        <FileSpreadsheet className="w-10 h-10 text-blue-700 mx-auto" aria-hidden="true" />
        <div className="space-y-1.5">
          <h1 className="text-xl font-bold text-slate-900">No analyzed air-quality data yet.</h1>
          <p className="text-sm text-slate-600">
            Upload or paste local sensor readings to identify hotspots, flag unreliable rows, and generate role-specific actions.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => onNavigate('/ingest')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors"
          >
            <span>Upload or Paste Data</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={loadingFixture}
            onClick={() => void handleLoadEvaluatorFixture()}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-300 bg-white text-slate-800 text-sm font-semibold rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors"
          >
            {loadingFixture ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Loading Fixture...</span>
              </>
            ) : (
              <span>Use Labelled Evaluator Test Fixture</span>
            )}
          </button>
        </div>
        <div className="text-xs text-slate-500">TEST FIXTURE — NOT LIVE DATA</div>
      </div>
    );
  }

  // Situation Status computation from actual rows
  const peakAqi = stats.maxAqi ?? stats.avgAqi;
  const statusBadge =
    peakAqi === null
      ? { label: 'Data Unavailable', cls: 'bg-slate-100 text-slate-800 border-slate-300', Icon: HelpCircle }
      : peakAqi >= 301
      ? { label: 'Emergency', cls: 'bg-red-50 text-red-900 border-red-300', Icon: OctagonAlert }
      : peakAqi >= 201
      ? { label: 'Warning', cls: 'bg-amber-50 text-amber-900 border-amber-300', Icon: AlertTriangle }
      : peakAqi >= 101
      ? { label: 'Watch', cls: 'bg-amber-50 text-amber-900 border-amber-200', Icon: AlertTriangle }
      : { label: 'Safe', cls: 'bg-emerald-50 text-emerald-900 border-emerald-200', Icon: CheckCircle2 };
  const StatusIcon = statusBadge.Icon;

  const affectedAreaText =
    stats.affectedAreas.length > 0
      ? stats.affectedAreas.map((a) => `${a.locationName} (${a.wardZone})`).slice(0, 2).join(', ')
      : stats.topHotspot
      ? `${stats.topHotspot.locationName} (${stats.topHotspot.wardZone})`
      : 'No affected zones';

  const whyRow = stats.topHotspot?.citedRowNumbers[0] ?? stats.latestReadings[0]?.rowIndex ?? 1;

  const roleImmediateActions = stats.latestBrief?.immediateActions0To4Hours ?? [];

  return (
    <div className="space-y-5">
      {/* Top Situation Banner */}
      <section
        aria-label="Current Local Air-Quality Situation"
        className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-sm font-bold border rounded-lg ${statusBadge.cls}`}
            >
              <StatusIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{statusBadge.label}</span>
              {peakAqi !== null && <span className="font-mono tabular-nums">· Peak AQI {peakAqi}</span>}
            </span>
            {stats.latestBatch.isTestFixture && (
              <span className="text-xs font-semibold text-amber-800 border border-amber-200 bg-amber-50 px-2.5 py-1 rounded">
                TEST FIXTURE — NOT LIVE DATA
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openEvidenceRow(stats.latestBatch!.id, whyRow)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-blue-200 bg-blue-50 text-blue-800 rounded-lg hover:bg-blue-100"
            >
              <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Why? (Row #{whyRow})</span>
            </button>
            <button
              type="button"
              disabled={analyzingBrief}
              onClick={() => void handleQuickAnalyzeGemini()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-60"
            >
              {analyzingBrief ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{stats.latestBrief ? 'Refresh Gemini Briefing' : 'Analyze with Gemini AI'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-200 text-xs">
          <div>
            <div className="text-slate-500">Affected area</div>
            <div className="font-semibold text-slate-900 mt-0.5 truncate" title={affectedAreaText}>
              {affectedAreaText}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Data confidence</div>
            <div className="font-semibold text-slate-900 font-mono tabular-nums mt-0.5">
              {stats.latestBatch.completenessPercent}% · {stats.validReadings.length}/{stats.latestBatch.totalRows} valid
              {stats.latestBatch.unreliableRows > 0 ? ` · ${stats.latestBatch.unreliableRows} flagged` : ''}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Safe outdoor window</div>
            <div className="font-semibold text-slate-900 mt-0.5 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-blue-700 shrink-0" aria-hidden="true" />
              <span>{stats.latestBatch.safestOutdoorWindow}</span>
            </div>
          </div>
          <div>
            <div className="text-slate-500">Last updated</div>
            <div className="font-semibold text-slate-900 font-mono tabular-nums mt-0.5">
              {new Date(stats.latestBatch.createdAt).toLocaleString()}
            </div>
          </div>
        </div>
      </section>

      {/* Three Primary Action Panels */}
      <section aria-label="Operational Action Summary" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* A. What happened? */}
        <article className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="space-y-2.5">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">A. What happened?</h2>
            {stats.latestBrief ? (
              <>
                <p className="text-sm text-slate-800 leading-relaxed">{stats.latestBrief.plainLanguageSummary}</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {stats.latestBrief.allCitedRows.slice(0, 6).map((rn) => (
                    <CitationChip key={rn} batchId={stats.latestBrief!.batchId} rowIndex={rn} />
                  ))}
                </div>
              </>
            ) : (
              <div className="space-y-2 text-xs text-slate-700">
                <p className="text-sm text-slate-800">
                  {stats.topHotspot
                    ? `Peak reading at ${stats.topHotspot.locationName} (${stats.topHotspot.wardZone}) is AQI ${
                        stats.topHotspot.currentAqi ?? 'Unavailable'
                      }.`
                    : 'Batch parsed and audited.'}
                </p>
                <p>Run Gemini analysis to generate plain-language hotspot attribution and role-specific orders.</p>
                <div className="flex flex-wrap gap-1.5">
                  {stats.latestReadings.slice(0, 4).map((r) => (
                    <CitationChip key={r.id} batchId={r.batchId} rowIndex={r.rowIndex} />
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/briefing-studio')}
            className="text-xs font-semibold text-blue-700 hover:text-blue-900 inline-flex items-center gap-1 w-fit"
          >
            <span>Open Briefing Studio</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </article>

        {/* B. What must happen now? */}
        <article className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">B. What must happen now?</h2>
              <span className="text-xs font-medium text-slate-500">{activePersona.replace(/_/g, ' ')}</span>
            </div>

            {stats.activeTasks.length > 0 ? (
              <ul className="space-y-2 text-xs">
                {stats.activeTasks.slice(0, 3).map((t) => (
                  <li key={t.id} className="border border-slate-200 rounded-lg p-2.5 bg-slate-50/70 space-y-1">
                    <div className="font-semibold text-slate-900">{t.title}</div>
                    <div className="text-slate-600">
                      Owner: <span className="font-medium text-slate-800">{t.instructedToSubordinate}</span> · Deadline:{' '}
                      <span className="font-medium text-slate-800">{t.deadline}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-blue-800">{t.status}</span>
                      {t.citedRows[0] && <CitationChip batchId={stats.latestBatch!.id} rowIndex={t.citedRows[0]} />}
                    </div>
                  </li>
                ))}
              </ul>
            ) : roleImmediateActions.length > 0 ? (
              <ul className="space-y-2 text-xs">
                {roleImmediateActions.slice(0, 2).map((act, idx) => (
                  <li key={idx} className="border border-slate-200 rounded-lg p-2.5 bg-slate-50/70 space-y-1">
                    <div className="font-semibold text-slate-900">{act.title}</div>
                    <div className="text-slate-600">
                      Owner: {activePersona.replace(/_/g, ' ')} · Deadline: {act.timeframe} · Status: Draft
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-600">
                No immediate actions dispatched yet. Generate a briefing or review the Action Board.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/tasks')}
            className="text-xs font-semibold text-blue-700 hover:text-blue-900 inline-flex items-center gap-1 w-fit"
          >
            <span>Open Action Board</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </article>

        {/* C. Who is affected? */}
        <article className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="space-y-2.5">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">C. Who is affected?</h2>
            {stats.affectedAreas.length === 0 ? (
              <p className="text-xs text-slate-600">No zones currently exceed warning thresholds.</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {stats.affectedAreas.slice(0, 3).map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50/60"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">{a.locationName}</div>
                      <div className="text-slate-500">
                        {a.wardZone} · {a.vulnerableZoneType.replace(/_/g, ' ')}
                      </div>
                    </div>
                    <span className="font-mono tabular-nums font-bold text-red-700 shrink-0">
                      AQI {a.currentAqi ?? 'N/A'}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {stats.alerts.length > 0 && (
              <div className="border border-slate-200 rounded-lg p-2.5 text-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 flex items-center gap-1">
                    <BellRing className="w-3.5 h-3.5 text-blue-700" aria-hidden="true" />
                    <span>Targeted Alert: {stats.alerts[0].targetZone}</span>
                  </span>
                  <span className="font-mono text-slate-700">
                    {stats.alerts[0].status === 'APPROVED_PREPARED'
                      ? 'Prepared for recipients'
                      : stats.alerts[0].status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {stats.alerts[0].status === 'PENDING_APPROVAL' &&
                    (activeRole === 'EVALUATOR' ||
                      activeRole === 'WARD_OFFICER' ||
                      stats.alerts[0].targetScope !== 'AFFECTED_WARD_ONLY') && (
                      <button
                        type="button"
                        disabled={busyAlertId === stats.alerts[0].id}
                        onClick={() => void handleAlertAction(stats.alerts[0].id, 'APPROVE_AND_PREPARE')}
                        className="px-2.5 py-1 bg-blue-700 text-white font-semibold rounded hover:bg-blue-800"
                      >
                        Approve Targeted Alert
                      </button>
                    )}
                  {stats.alerts[0].status === 'APPROVED_PREPARED' && (
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopyAlert(
                          `[${stats.alerts[0].targetZone}] ${stats.alerts[0].headline}\n${stats.alerts[0].currentSituationText}`
                        )
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 bg-white rounded hover:bg-slate-50 font-medium"
                    >
                      <Copy className="w-3 h-3" aria-hidden="true" />
                      <span>Copy Approved Alert</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => onNavigate('/citizen-advisory')}
              className="text-xs font-semibold text-blue-700 hover:text-blue-900 inline-flex items-center gap-1"
            >
              <span>Citizen Advisory</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/map')}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900 inline-flex items-center gap-1"
            >
              <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Map &amp; Alerts</span>
            </button>
          </div>
        </article>
      </section>

      {/* Lower Row: Evidence List / Map Status, Active Actions & Escalations, Previous vs Current Change */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Evidence Summary + Active Actions */}
        <section aria-labelledby="cc-evidence-heading" className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="cc-evidence-heading" className="text-sm font-bold text-slate-900">
              Evidence &amp; Coordinate Coverage ({stats.latestReadings.length} Rows)
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('/map')}
              className="text-xs font-semibold text-blue-700 hover:text-blue-900"
            >
              {stats.mappedReadings.length > 0 ? `${stats.mappedReadings.length} mapped pins` : 'Open Evidence List'}
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-semibold">Location</th>
                  <th className="px-3 py-2 font-semibold">AQI</th>
                  <th className="px-3 py-2 font-semibold">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {stats.latestReadings.slice(0, 5).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{r.locationName}</div>
                      <div className="text-slate-500">{r.wardZone}</div>
                    </td>
                    <td className="px-3 py-2">
                      <AqiStatusIndicator aqi={r.calculatedAqi} alertLevel={r.alertLevel} />
                    </td>
                    <td className="px-3 py-2">
                      <CitationChip batchId={r.batchId} rowIndex={r.rowIndex} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {stats.tasks.filter((t) => t.taskType === 'CROSS_ROLE_ESCALATION').length > 0 && (
            <div className="pt-2 border-t border-slate-200 space-y-1.5 text-xs">
              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
                <span>Cross-Role Escalation Status</span>
              </div>
              {stats.tasks
                .filter((t) => t.taskType === 'CROSS_ROLE_ESCALATION')
                .slice(0, 2)
                .map((esc) => (
                  <div key={esc.id} className="flex items-center justify-between gap-2 bg-amber-50/50 border border-amber-200 rounded px-3 py-1.5">
                    <span className="truncate text-slate-900">{esc.title}</span>
                    <span className="font-mono font-semibold text-amber-900 shrink-0">{esc.status}</span>
                  </div>
                ))}
            </div>
          )}
        </section>

        {/* Previous vs Current Change & Outcome Proof */}
        <section aria-labelledby="cc-change-heading" className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="cc-change-heading" className="text-sm font-bold text-slate-900">
              Previous vs. Current Change
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('/radar')}
              className="text-xs font-semibold text-blue-700 hover:text-blue-900"
            >
              Open Radar &amp; 24h Projection
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-semibold">Location</th>
                  <th className="px-3 py-2 font-semibold">Previous</th>
                  <th className="px-3 py-2 font-semibold">Current</th>
                  <th className="px-3 py-2 font-semibold">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white font-mono tabular-nums">
                {stats.trajectories.slice(0, 5).map((t) => {
                  const delta = t.aqiDelta;
                  return (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-sans font-medium text-slate-900">{t.locationName}</td>
                      <td className="px-3 py-2 text-slate-600">{t.previousAqi ?? '—'}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{t.currentAqi ?? 'N/A'}</td>
                      <td className="px-3 py-2">
                        {delta !== null ? (
                          <span
                            className={`inline-flex items-center gap-1 font-semibold ${
                              delta > 0 ? 'text-red-700' : delta < 0 ? 'text-emerald-700' : 'text-slate-600'
                            }`}
                          >
                            {delta > 0 ? (
                              <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : delta < 0 ? (
                              <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : null}
                            <span>{delta >= 0 ? `+${delta}` : delta}</span>
                          </span>
                        ) : (
                          <span className="font-sans text-slate-500">Baseline only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {stats.outcomeScorecard.length > 0 && (
            <div className="pt-2 border-t border-slate-200 space-y-1.5 text-xs">
              <div className="font-semibold text-slate-800">Observed Task Outcome Comparison</div>
              {stats.outcomeScorecard.slice(0, 2).map((o, i) => (
                <div key={i} className="bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-700">
                  {o.summary}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

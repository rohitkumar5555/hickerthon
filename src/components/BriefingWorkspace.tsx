import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardPlus,
  Code2,
  FileText,
  Loader2,
  Send,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import type { AppRoute } from './Layout';
import { DataQualityPanel } from './DataQualityPanel';
import { AqiStatusIndicator, CitationChip } from './StatusBadge';
import { createTaskTransaction, saveBriefingAndAlertsTransaction } from '../db/civicDexie';
import type { BriefingRecord, CrossRoleEscalationDraft, OfficialActionDraft, PersonaRole } from '../types/civic';

export const BriefingWorkspace: React.FC<{ onNavigate: (r: AppRoute) => void }> = ({ onNavigate }) => {
  const { workspace, activePersona, activeRole, roleProfile, refreshWorkspace, notify } = useStudio();
  const batches = workspace?.batches ?? [];
  const briefings = workspace?.briefings ?? [];

  const [selectedBatchId, setSelectedBatchId] = useState<string>(batches[0]?.id ?? '');
  const [selectedPrevBriefId, setSelectedPrevBriefId] = useState<string>('');
  const [personaRole, setPersonaRole] = useState<PersonaRole>(activePersona);
  const [generating, setGenerating] = useState(false);
  const [activeBriefId, setActiveBriefId] = useState<string>(briefings[0]?.id ?? '');
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showInternalNote, setShowInternalNote] = useState(false);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);

  useEffect(() => {
    setPersonaRole(activePersona);
  }, [activePersona]);

  useEffect(() => {
    if (!selectedBatchId && batches[0]) setSelectedBatchId(batches[0].id);
  }, [batches, selectedBatchId]);

  useEffect(() => {
    if (!activeBriefId && briefings[0]) setActiveBriefId(briefings[0].id);
  }, [briefings, activeBriefId]);

  const activeBrief: BriefingRecord | null =
    briefings.find((b) => b.id === activeBriefId) ?? briefings[0] ?? null;

  const targetBatch = batches.find((b) => b.id === selectedBatchId) ?? batches[0] ?? null;
  const targetBatchReadings = targetBatch
    ? (workspace?.readings ?? []).filter((r) => r.batchId === targetBatch.id)
    : [];

  const handleGenerateBriefing = async (overridePersona?: PersonaRole) => {
    const roleToUse = overridePersona ?? personaRole;
    if (!targetBatch || !activeRole) {
      notify('error', 'Ingest a dataset first.');
      return;
    }
    if (targetBatchReadings.length === 0) {
      notify('error', 'Target batch has no sensor rows.');
      return;
    }

    const previousBrief = selectedPrevBriefId
      ? briefings.find((b) => b.id === selectedPrevBriefId) ?? null
      : briefings.find((b) => b.batchId !== targetBatch.id) ??
        briefings.find((b) => b.personaRole === roleToUse) ??
        null;
    const prevBatch = previousBrief
      ? batches.find((b) => b.id === previousBrief.batchId) ?? null
      : batches.find((b) => b.id !== targetBatch.id) ?? null;
    const previousReadings = prevBatch
      ? (workspace?.readings ?? []).filter((r) => r.batchId === prevBatch.id)
      : [];

    setGenerating(true);
    try {
      const res = await fetch('/api/briefings/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch: targetBatch,
          readings: targetBatchReadings,
          trajectories: targetBatch.id === batches[0]?.id ? (workspace?.trajectories ?? []) : [],
          previousBrief,
          previousReadings,
          previousTasks: workspace?.actionTasks ?? [],
          outcomeScorecard: targetBatch.id === batches[0]?.id ? (workspace?.outcomeScorecard ?? []) : [],
          personaRole: roleToUse,
          createdBy: activeRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify('error', data.error || 'Briefing generation failed.');
        return;
      }
      await saveBriefingAndAlertsTransaction(activeRole, data.briefing, data.proposedAlerts ?? []);
      await refreshWorkspace();
      setActiveBriefId(data.briefing.id);
      notify('success', `Generated ${data.briefing.briefingCode} (${data.briefing.latencyMs} ms).`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Network error calling Gemini.');
    } finally {
      setGenerating(false);
    }
  };

  const handleApproveDraftToTaskBoard = async (draft: OfficialActionDraft, idx: number, approveImmediately: boolean) => {
    if (!activeBrief || !activeRole) return;
    const key = `draft_${idx}`;
    setBusyActionKey(key);
    try {
      const matchedReading = targetBatchReadings.find(
        (r) => r.locationName.toLowerCase() === draft.targetLocation.toLowerCase()
      );
      await createTaskTransaction(activeRole, {
        briefingId: activeBrief.id,
        taskType: draft.taskType,
        sourceRole: activeBrief.personaRole,
        assignedRole: activeBrief.personaRole,
        instructedToSubordinate: draft.instructedToSubordinate,
        locationName: draft.targetLocation,
        wardZone: matchedReading?.wardZone ?? roleProfile?.wardZone ?? 'Ward Zone',
        title: `${draft.instructedToSubordinate}: ${draft.targetLocation}`,
        actionDraftText: draft.draftInstructionText,
        deadline: draft.deadline,
        citedRows: draft.citedRowNumbers.length > 0 ? draft.citedRowNumbers : [1],
        approveImmediately,
      });
      await refreshWorkspace();
      notify('success', approveImmediately ? 'Action approved & dispatched.' : 'Action draft queued.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save action.');
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleSendEscalation = async (esc: CrossRoleEscalationDraft, idx: number) => {
    if (!activeBrief || !activeRole) return;
    const key = `esc_${idx}`;
    setBusyActionKey(key);
    try {
      const matchedReading = targetBatchReadings.find(
        (r) => r.locationName.toLowerCase() === esc.targetLocation.toLowerCase()
      );
      await createTaskTransaction(activeRole, {
        briefingId: activeBrief.id,
        taskType: 'CROSS_ROLE_ESCALATION',
        sourceRole: esc.fromPersona,
        assignedRole: esc.toPersona,
        instructedToSubordinate: `${esc.toPersona.replace(/_/g, ' ')} Desk`,
        locationName: esc.targetLocation,
        wardZone: matchedReading?.wardZone ?? roleProfile?.wardZone ?? 'Ward Zone',
        title: `Escalation (${esc.fromPersona.replace(/_/g, ' ')} → ${esc.toPersona.replace(/_/g, ' ')}): ${esc.targetLocation}`,
        actionDraftText: `${esc.issueSummary} — Requested: ${esc.requestedIntervention}`,
        deadline: 'Within 2 hours',
        citedRows: esc.citedRowNumbers.length > 0 ? esc.citedRowNumbers : [1],
        approveImmediately: true,
      });
      await refreshWorkspace();
      notify('success', `Escalated to ${esc.toPersona.replace(/_/g, ' ')}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Escalation failed.');
    } finally {
      setBusyActionKey(null);
    }
  };

  if (batches.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-xl mx-auto mt-8 space-y-3">
        <Sparkles className="w-9 h-9 text-blue-700 mx-auto" aria-hidden="true" />
        <h1 className="text-lg font-bold text-slate-900">Ingest Air Quality Data First</h1>
        <p className="text-sm text-slate-600">Analyze a dataset before generating a traceable briefing.</p>
        <button
          type="button"
          onClick={() => onNavigate('/ingest')}
          className="px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800"
        >
          Open Data Ingestion
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Compact Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Briefing Studio</h1>
        <div className="flex flex-wrap items-center gap-2">
          {activeBrief && (
            <>
              <button
                type="button"
                onClick={() => setShowInternalNote((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-300 bg-white text-slate-800 rounded-lg hover:bg-slate-50"
              >
                <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{showInternalNote ? 'Hide Internal Brief' : 'Generate Internal Brief'}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/citizen-advisory')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800"
              >
                <span>Citizen Advisory</span>
                <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Generator Bar + 3-Persona Switcher */}
      <section aria-label="Briefing Generator" className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label htmlFor="brief-batch-select" className="block text-xs font-medium text-slate-700 mb-1">
              Dataset
            </label>
            <select
              id="brief-batch-select"
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-900"
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} ({b.totalRows} rows)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="brief-persona-select" className="block text-xs font-medium text-slate-700 mb-1">
              Audience Role
            </label>
            <select
              id="brief-persona-select"
              value={personaRole}
              onChange={(e) => setPersonaRole(e.target.value as PersonaRole)}
              className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-900"
            >
              <option value="WARD_OFFICER">Ward Officer</option>
              <option value="HOUSING_SOCIETY">Housing Society (RWA)</option>
              <option value="SCHOOL_COORDINATOR">School Coordinator</option>
            </select>
          </div>

          <div>
            <label htmlFor="brief-prev-select" className="block text-xs font-medium text-slate-700 mb-1">
              Compare Previous Brief
            </label>
            <select
              id="brief-prev-select"
              value={selectedPrevBriefId}
              onChange={(e) => setSelectedPrevBriefId(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-900"
            >
              <option value="">Auto / Baseline</option>
              {briefings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.briefingCode} · {b.personaRole.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <button
              type="button"
              disabled={generating}
              onClick={() => void handleGenerateBriefing()}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-60"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  <span>Analyze with Gemini AI</span>
                </>
              )}
            </button>
          </div>
        </div>

        {briefings.length > 1 && (
          <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-500">Briefs:</span>
            {briefings.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setActiveBriefId(b.id)}
                className={`px-2 py-1 rounded border font-mono ${
                  b.id === activeBrief?.id
                    ? 'bg-blue-50 border-blue-300 text-blue-900 font-semibold'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {b.briefingCode} · {b.personaRole.split('_')[0]}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Clean Two-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Data Quality, Evidence Rows, Previous vs Current Changes */}
        <div className="lg:col-span-5 space-y-4">
          {targetBatch && <DataQualityPanel batch={targetBatch} readings={targetBatchReadings} />}

          {/* Evidence Rows */}
          <section aria-label="Evidence rows" className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
            <h2 className="text-sm font-semibold text-slate-900">
              Evidence Rows ({targetBatchReadings.length})
            </h2>
            <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-200 text-xs">
              {targetBatchReadings.map((r) => (
                <div key={r.id} className="p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{r.locationName}</div>
                    <div className="text-slate-500 font-mono">
                      PM2.5: {r.pm25 ?? 'N/A'} · PM10: {r.pm10 ?? 'N/A'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <AqiStatusIndicator aqi={r.calculatedAqi} alertLevel={r.alertLevel} />
                    <CitationChip batchId={r.batchId} rowIndex={r.rowIndex} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Previous vs Current Changes */}
          <section aria-label="Previous versus current changes" className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
            <h2 className="text-sm font-semibold text-slate-900">Previous vs. Current Changes</h2>
            {activeBrief ? (
              <div className="space-y-1.5">
                <div className="text-slate-600">
                  Baseline: {activeBrief.comparisonWithPrevious.previousBriefCode ?? 'Initial Batch'}
                  {activeBrief.comparisonWithPrevious.overallAqiDelta !== null &&
                    ` · Overall AQI Delta: ${
                      activeBrief.comparisonWithPrevious.overallAqiDelta >= 0
                        ? `+${activeBrief.comparisonWithPrevious.overallAqiDelta}`
                        : activeBrief.comparisonWithPrevious.overallAqiDelta
                    }`}
                </div>
                <p className="text-slate-800 leading-relaxed">{activeBrief.comparisonWithPrevious.narrative}</p>
                {activeBrief.comparisonWithPrevious.newHotspots.length > 0 && (
                  <div className="text-red-800 font-medium">
                    New hotspots: {activeBrief.comparisonWithPrevious.newHotspots.join(', ')}
                  </div>
                )}
                {activeBrief.comparisonWithPrevious.resolvedHotspots.length > 0 && (
                  <div className="text-emerald-800 font-medium">
                    Improved: {activeBrief.comparisonWithPrevious.resolvedHotspots.join(', ')}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1 text-slate-600">
                {(workspace?.trajectories ?? []).slice(0, 4).map((t) => (
                  <div key={t.id} className="flex justify-between">
                    <span>{t.locationName}</span>
                    <span className="font-mono">
                      {t.previousAqi ?? '—'} → {t.currentAqi ?? 'N/A'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN: Gemini Role-Specific Briefing, Immediate/Preventive/Guardrails, Drafts & Escalations */}
        <div className="lg:col-span-7 space-y-4">
          {!activeBrief ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
              <Sparkles className="w-8 h-8 text-blue-700 mx-auto" aria-hidden="true" />
              <h2 className="text-base font-semibold text-slate-900">Ready to Analyze Batch</h2>
              <p className="text-xs text-slate-600">
                Select an audience role above and click &quot;Analyze with Gemini AI&quot; for traceable findings and prioritized actions.
              </p>
            </div>
          ) : (
            <>
              {/* Small Transparent Metadata Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-slate-100 border border-slate-200 rounded-lg text-[11px] text-slate-600 font-mono">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{activeBrief.briefingCode}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeBrief.geminiModel}</span>
                  <span aria-hidden="true">·</span>
                  <span>{new Date(activeBrief.createdAt).toLocaleString()}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{activeBrief.latencyMs} ms</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeBrief.allCitedRows.length} cited rows</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPromptModal(true)}
                  className="inline-flex items-center gap-1 text-blue-800 hover:underline font-sans font-medium"
                >
                  <Code2 className="w-3 h-3" aria-hidden="true" />
                  <span>Prompt Payload</span>
                </button>
              </div>

              {/* Plain-language Role Summary & Findings */}
              <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <h2 className="text-base font-bold text-slate-900">
                  Role Briefing ({activeBrief.personaRole.replace(/_/g, ' ')})
                </h2>
                <p className="text-sm text-slate-800 leading-relaxed">{activeBrief.plainLanguageSummary}</p>
                <ul className="space-y-2 pt-2 border-t border-slate-200">
                  {activeBrief.observedFacts.map((item, idx) => (
                    <li key={idx} className="flex flex-wrap items-start justify-between gap-2 text-xs text-slate-800 bg-slate-50 p-2.5 rounded border border-slate-200">
                      <span className="flex-1">{item.fact}</span>
                      <div className="flex flex-wrap gap-1 shrink-0">
                        {item.citedRowNumbers.map((rn) => (
                          <CitationChip key={rn} batchId={activeBrief.batchId} rowIndex={rn} />
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Immediate Action, Guardrails & Preventive Action */}
              <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Immediate Action (0–4h)</h3>
                  {activeBrief.immediateActions0To4Hours.map((act, i) => (
                    <div key={i} className="border border-slate-200 rounded-lg p-3 text-xs space-y-1">
                      <div className="font-semibold text-slate-900">{act.title}</div>
                      <div className="text-slate-600">{act.targetLocation} · {act.timeframe}</div>
                      <p className="text-slate-700">{act.rationale}</p>
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {act.citedRowNumbers.map((rn) => (
                          <CitationChip key={rn} batchId={activeBrief.batchId} rowIndex={rn} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {activeBrief.doNotDoGuardrails.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wide flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
                      <span>Do-Not-Do Guardrails</span>
                    </h3>
                    {activeBrief.doNotDoGuardrails.map((g, i) => (
                      <div key={i} className="bg-amber-50/70 border border-amber-200 rounded-lg p-3 text-xs space-y-1">
                        <div className="font-semibold text-amber-950">{g.doNotAction}</div>
                        <p className="text-amber-900">{g.targetLocation}: {g.scientificReason}</p>
                        <div className="flex flex-wrap gap-1">
                          {g.citedRowNumbers.map((rn) => (
                            <CitationChip key={rn} batchId={activeBrief.batchId} rowIndex={rn} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Preventive Action (7–30 Days)</h3>
                  {activeBrief.futurePreventiveRoadmap7To30Days.map((act, i) => (
                    <div key={i} className="border border-slate-200 rounded-lg p-3 text-xs space-y-1">
                      <div className="font-semibold text-slate-900">{act.title}</div>
                      <div className="text-slate-600">{act.targetLocation} · {act.timeframe}</div>
                      <p className="text-slate-700">{act.rationale}</p>
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {act.citedRowNumbers.map((rn) => (
                          <CitationChip key={rn} batchId={activeBrief.batchId} rowIndex={rn} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Official Action Drafts & Cross-Role Escalations */}
              <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-900">Action Drafts &amp; Escalations</h3>
                {activeBrief.actionDrafts.map((d, i) => (
                  <div key={i} className="border border-slate-200 rounded-lg p-3.5 text-xs space-y-2">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-semibold text-slate-900">
                        To: {d.instructedToSubordinate} ({d.targetLocation})
                      </span>
                      <span className="text-slate-600">Due {d.deadline}</span>
                    </div>
                    <p className="text-slate-800 bg-slate-50 p-2 rounded border border-slate-200">
                      {d.draftInstructionText}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1">
                        {d.citedRowNumbers.map((rn) => (
                          <CitationChip key={rn} batchId={activeBrief.batchId} rowIndex={rn} />
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busyActionKey === `draft_${i}`}
                          onClick={() => void handleApproveDraftToTaskBoard(d, i, false)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 bg-white text-slate-800 rounded hover:bg-slate-50 font-medium"
                        >
                          <ClipboardPlus className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Queue</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyActionKey === `draft_${i}`}
                          onClick={() => void handleApproveDraftToTaskBoard(d, i, true)}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-blue-700 text-white rounded hover:bg-blue-800 font-semibold"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Approve &amp; Dispatch</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {activeBrief.crossRoleEscalations.map((esc, i) => (
                  <div key={i} className="border border-amber-200 bg-amber-50/40 rounded-lg p-3.5 text-xs space-y-2">
                    <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
                      <span>
                        Draft Escalation: {esc.fromPersona.replace(/_/g, ' ')} → {esc.toPersona.replace(/_/g, ' ')} ({esc.targetLocation})
                      </span>
                    </div>
                    <p className="text-slate-700">{esc.issueSummary} · Requested: {esc.requestedIntervention}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1">
                        {esc.citedRowNumbers.map((rn) => (
                          <CitationChip key={rn} batchId={activeBrief.batchId} rowIndex={rn} />
                        ))}
                      </div>
                      <button
                        type="button"
                        disabled={busyActionKey === `esc_${i}`}
                        onClick={() => void handleSendEscalation(esc, i)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-amber-700 text-white rounded hover:bg-amber-800 font-semibold"
                      >
                        <Send className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Send Escalation</span>
                      </button>
                    </div>
                  </div>
                ))}
              </section>

              {showInternalNote && (
                <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-bold text-slate-900">Internal Civic Briefing Note</h3>
                  <pre className="whitespace-pre-wrap text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg p-4 text-slate-800 overflow-x-auto">
                    {activeBrief.internalBriefingMarkdown}
                  </pre>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {/* Prompt Payload Modal */}
      {showPromptModal && activeBrief && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="prompt-payload-title"
        >
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[85vh] flex flex-col border border-slate-200 shadow-xl">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
              <h3 id="prompt-payload-title" className="text-sm font-bold text-slate-900">
                Grounded Prompt Payload · {activeBrief.briefingCode}
              </h3>
              <button
                type="button"
                onClick={() => setShowPromptModal(false)}
                className="p-1.5 rounded text-slate-500 hover:bg-slate-100"
                aria-label="Close prompt payload modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <pre className="whitespace-pre-wrap text-xs font-mono text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-4">
                {activeBrief.sanitizedPromptPayload}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

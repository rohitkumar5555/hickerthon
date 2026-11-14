import React, { useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock, Truck } from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { createTaskTransaction, recordAuditEvent } from '../db/civicDexie';
import type { ResourceAllocationStop } from '../types/civic';
import { CitationChip } from '../components/StatusBadge';

type RadarFilter = 'ALL' | 'RED_NOW' | 'APPROACHING' | 'VULNERABLE' | 'QUALITY_ISSUES';

export const RadarPage: React.FC = () => {
  const { workspace, activeRole, refreshWorkspace, notify } = useStudio();
  const [filter, setFilter] = useState<RadarFilter>('ALL');

  const [sprinklers, setSprinklers] = useState(2);
  const [squads, setSquads] = useState(2);
  const [marshals, setMarshals] = useState(2);
  const [patrols, setPatrols] = useState(2);
  const [schedule, setSchedule] = useState<ResourceAllocationStop[] | null>(null);
  const [busy, setBusy] = useState(false);

  // What-If Simulation coverage checkboxes
  const [simDustControl, setSimDustControl] = useState(true);
  const [simSmokeHalt, setSimSmokeHalt] = useState(true);
  const [simTrafficNoIdle, setSimTrafficNoIdle] = useState(false);

  const latestBatch = workspace?.batches[0] ?? null;
  const trajectories = workspace?.trajectories ?? [];

  const filteredTrajectories = useMemo(() => {
    return trajectories.filter((t) => {
      if (filter === 'RED_NOW') return t.isRedZoneNow;
      if (filter === 'APPROACHING') return t.approachingRedZoneAlert;
      if (filter === 'VULNERABLE')
        return t.vulnerableZoneType === 'SCHOOL_ZONE' || t.vulnerableZoneType === 'SENIOR_PARK_HOSPITAL';
      if (filter === 'QUALITY_ISSUES') return t.dataLimitations.length > 0;
      return true;
    });
  }, [trajectories, filter]);

  const handleOptimizeResources = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!latestBatch || !activeRole) return;
    setBusy(true);
    try {
      const readings = (workspace?.readings ?? []).filter((r) => r.batchId === latestBatch.id);
      const res = await fetch('/api/radar/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeRole,
          trajectories,
          readings,
          waterSprinklers: sprinklers,
          enforcementSquads: squads,
          trafficMarshals: marshals,
          patrolTeams: patrols,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify('error', data.error || 'Resource optimization failed.');
        return;
      }
      setSchedule(data.schedule);
      await recordAuditEvent(activeRole, 'RESOURCE_SCHEDULE_COMPUTED', 'batch', latestBatch.id, {
        stops: data.schedule.length,
      });
      await refreshWorkspace();
      notify('success', `Computed prioritized schedule for ${data.schedule.length} hotspot(s).`);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveScheduleToTasks = async () => {
    if (!schedule || schedule.length === 0 || !activeRole) return;
    const latestBrief = workspace?.briefings[0];
    if (!latestBrief) {
      notify('error', 'Generate a traceable AI briefing first so tasks link to a briefing record.');
      return;
    }
    setBusy(true);
    try {
      for (const stop of schedule) {
        await createTaskTransaction(activeRole, {
          briefingId: latestBrief.id,
          taskType: 'URGENT_0_4H',
          sourceRole: 'WARD_OFFICER',
          assignedRole: 'WARD_OFFICER',
          instructedToSubordinate: `${stop.assignedResourceType.replace(/_/g, ' ')} Unit #${stop.unitNumber}`,
          locationName: stop.locationName,
          wardZone: stop.wardZone,
          title: `Priority #${stop.priorityRank}: ${stop.assignedResourceType.replace(/_/g, ' ')} @ ${stop.locationName}`,
          actionDraftText: stop.actionPolicyInstruction,
          deadline: stop.timeSlot,
          citedRows: stop.citedRows,
          approveImmediately: true,
        });
      }
      await refreshWorkspace();
      notify('success', `Dispatched ${schedule.length} field resource tasks to the Action Board.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to dispatch resource schedule.');
    } finally {
      setBusy(false);
    }
  };

  const historicalOutcomes = workspace?.outcomeScorecard ?? [];
  const completedOutcomes = historicalOutcomes.filter((o) => o.outcomeCategory === 'COMPLETED_TASK_AREA');

  if (!latestBatch) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-xl mx-auto mt-6">
        <Activity className="w-10 h-10 text-slate-400 mx-auto mb-3" aria-hidden="true" />
        <h1 className="text-lg font-bold text-slate-900">Past–Present–Projection Radar Empty</h1>
        <p className="text-sm text-slate-600 mt-1">
          Ingest a dataset batch first to calculate trajectories, Red-Zone alerts, and field resource schedules.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Radar &amp; Field Resources
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Past-to-current area trends, 24h projections, and constrained equipment scheduling.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs bg-white border border-slate-200 rounded-lg px-3.5 py-2">
          <Clock className="w-4 h-4 text-blue-700" aria-hidden="true" />
          <span>
            Safest Window: <strong>{latestBatch.safestOutdoorWindow}</strong> · Peak Danger:{' '}
            <strong>{latestBatch.peakDangerWindow}</strong>
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-200/70 rounded-lg w-fit" role="group" aria-label="Area Filters">
        {(
          [
            ['ALL', 'All Areas'],
            ['RED_NOW', 'Active Red Zones'],
            ['APPROACHING', 'Approaching Alert'],
            ['VULNERABLE', 'School / Senior Zones'],
            ['QUALITY_ISSUES', 'Data Quality Issues'],
          ] as [RadarFilter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              filter === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Past -> Present -> Projection Matrix */}
      <section aria-labelledby="matrix-heading" className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="matrix-heading" className="text-base font-semibold text-slate-900">
            Area Trajectory Matrix ({filteredTrajectories.length} Locations)
          </h2>
          <span className="text-xs text-slate-500">
            Projections are labelled: Short-term data projection — not a guaranteed forecast
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-semibold">Location & Vulnerable Type</th>
                <th className="px-3 py-2 font-semibold">Previous AQI</th>
                <th className="px-3 py-2 font-semibold">Current AQI</th>
                <th className="px-3 py-2 font-semibold">Delta / Trend</th>
                <th className="px-3 py-2 font-semibold">24h Projection (Confidence)</th>
                <th className="px-3 py-2 font-semibold">Early Warning / Limitations</th>
                <th className="px-3 py-2 font-semibold">Rows</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredTrajectories.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-slate-900">{t.locationName}</div>
                    <div className="text-slate-500">
                      {t.wardZone} · {t.vulnerableZoneType.replace(/_/g, ' ')}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-slate-700">
                    {t.previousAqi ?? 'No prior baseline'}
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums font-bold text-slate-900">
                    {t.currentAqi ?? 'Unavailable'}
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums">
                    {t.aqiDelta !== null ? (
                      <span className={t.aqiDelta > 0 ? 'text-red-700 font-semibold' : 'text-emerald-700 font-semibold'}>
                        {t.aqiDelta >= 0 ? `+${t.aqiDelta}` : t.aqiDelta} ({t.forecastTrend.replace(/_/g, ' ')})
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {t.shortTermProjection24h !== null ? (
                      <div>
                        <span className="font-mono font-semibold text-slate-900">{t.shortTermProjection24h}</span>{' '}
                        <span className="text-slate-500">({t.projectionConfidence})</span>
                        <div className="text-[11px] text-slate-500">{t.projectionNote}</div>
                      </div>
                    ) : (
                      <span className="text-slate-500">{t.projectionNote}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 space-y-1">
                    {t.earlyWarningAlert && (
                      <div className="inline-flex items-center gap-1 text-red-800 font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{t.earlyWarningAlert}</span>
                      </div>
                    )}
                    {t.dataLimitations.length > 0 && (
                      <div className="text-[11px] text-amber-800">{t.dataLimitations[0]}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {t.citedRowNumbers.map((rn) => (
                        <CitationChip key={rn} batchId={latestBatch.id} rowIndex={rn} />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Constrained Resource Optimizer & What-If Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Resource Planner (WARD_OFFICER / EVALUATOR) */}
        <section
          aria-labelledby="resource-planner-heading"
          className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-blue-700" aria-hidden="true" />
            <h2 id="resource-planner-heading" className="text-base font-semibold text-slate-900">
              Constrained Field Resource Optimizer
            </h2>
          </div>

          {activeRole !== 'WARD_OFFICER' && activeRole !== 'EVALUATOR' ? (
            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
              Ward field equipment dispatch optimization is restricted to Ward Officers and Evaluators.
            </p>
          ) : (
            <>
              <form onSubmit={handleOptimizeResources} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label htmlFor="res-sprinklers" className="block text-xs font-medium text-slate-700 mb-1">
                    Water Sprinklers
                  </label>
                  <input
                    id="res-sprinklers"
                    type="number"
                    min={0}
                    max={50}
                    value={sprinklers}
                    onChange={(e) => setSprinklers(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="res-squads" className="block text-xs font-medium text-slate-700 mb-1">
                    Enforcement Squads
                  </label>
                  <input
                    id="res-squads"
                    type="number"
                    min={0}
                    max={50}
                    value={squads}
                    onChange={(e) => setSquads(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="res-marshals" className="block text-xs font-medium text-slate-700 mb-1">
                    Traffic Marshals
                  </label>
                  <input
                    id="res-marshals"
                    type="number"
                    min={0}
                    max={50}
                    value={marshals}
                    onChange={(e) => setMarshals(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="res-patrols" className="block text-xs font-medium text-slate-700 mb-1">
                    Patrol Teams
                  </label>
                  <input
                    id="res-patrols"
                    type="number"
                    min={0}
                    max={50}
                    value={patrols}
                    onChange={(e) => setPatrols(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div className="col-span-2 sm:col-span-4 flex flex-wrap gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-4 py-2 text-xs font-semibold bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50"
                  >
                    Optimize Limited Field Resources
                  </button>
                  {schedule && schedule.length > 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleSaveScheduleToTasks()}
                      className="px-4 py-2 text-xs font-semibold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 disabled:opacity-50"
                    >
                      Approve & Dispatch Schedule to Action Board
                    </button>
                  )}
                </div>
              </form>

              {schedule && (
                <div className="space-y-2 pt-2">
                  {schedule.map((stop) => (
                    <div key={stop.priorityRank} className="border border-slate-200 rounded-lg p-3 text-xs space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">
                          #{stop.priorityRank} · {stop.locationName} ({stop.wardZone})
                        </span>
                        <span className="font-mono text-blue-800 font-semibold">
                          {stop.assignedResourceType.replace(/_/g, ' ')} Unit #{stop.unitNumber} · {stop.timeSlot}
                        </span>
                      </div>
                      <p className="text-slate-700">{stop.actionPolicyInstruction}</p>
                      {stop.contraindicationSkipped && (
                        <p className="text-amber-800 font-medium">{stop.contraindicationSkipped}</p>
                      )}
                      <div className="flex items-center gap-1.5 pt-1">
                        {stop.citedRows.map((rn) => (
                          <CitationChip key={rn} batchId={latestBatch.id} rowIndex={rn} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* Honest What-If Intervention Simulator */}
        <section
          aria-labelledby="whatif-heading"
          className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <h2 id="whatif-heading" className="text-base font-semibold text-slate-900">
            What-If Coverage & Historical Evidence Check
          </h2>
          <p className="text-xs text-slate-600">
            Select planned field interventions to inspect affected-zone coverage and local historical evidence without
            invented reduction claims.
          </p>
          <div className="space-y-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={simDustControl}
                onChange={(e) => setSimDustControl(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>Coarse road-dust wet sweeping & construction tarpaulin enforcement</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={simSmokeHalt}
                onChange={(e) => setSimSmokeHalt(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>Biomass burning & DG exhaust shutdown (avoids water misting)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={simTrafficNoIdle}
                onChange={(e) => setSimTrafficNoIdle(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>School & junction anti-idling traffic marshals</span>
            </label>
          </div>

          <div className="border border-slate-200 bg-slate-50 rounded-lg p-3.5 text-xs space-y-2">
            <div className="font-semibold text-slate-900">
              Planned Hotspot Coverage:{' '}
              {
                trajectories.filter(
                  (t) =>
                    (t.currentAqi ?? 0) >= 201 &&
                    ((simDustControl && t.vulnerableZoneType === 'COMMERCIAL_TRAFFIC') ||
                      (simSmokeHalt && t.vulnerableZoneType !== 'COMMERCIAL_TRAFFIC') ||
                      simTrafficNoIdle)
                ).length
              }{' '}
              of {trajectories.filter((t) => (t.currentAqi ?? 0) >= 201).length} elevated locations covered
            </div>

            {completedOutcomes.length > 0 ? (
              <div className="space-y-1 text-emerald-900">
                <div className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Observed Historical Range ({completedOutcomes.length} completed area(s)):</span>
                </div>
                {completedOutcomes.map((o, i) => (
                  <div key={i} className="font-mono">
                    {o.locationName}: {o.previousAqi} → {o.currentAqi} ({o.aqiDelta})
                  </div>
                ))}
                <p className="text-[11px] text-slate-600 pt-1">
                  Observed association; not proof of single-factor causation.
                </p>
              </div>
            ) : (
              <p className="text-slate-700">
                Insufficient local completed-task evidence to quantify pollution reduction range yet. Complete tasks and
                import the next batch to measure observed outcomes.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

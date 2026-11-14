import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle2, History, X } from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { AqiStatusIndicator, ReliabilityIndicator } from './StatusBadge';

export const CitationDrawer: React.FC = () => {
  const { selectedEvidenceRow, closeEvidenceRow, workspace } = useStudio();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedEvidenceRow) {
        closeEvidenceRow();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedEvidenceRow, closeEvidenceRow]);

  if (!selectedEvidenceRow || !workspace) return null;

  const reading = workspace.readings.find(
    (r) => r.batchId === selectedEvidenceRow.batchId && r.rowIndex === selectedEvidenceRow.rowIndex
  );
  const batch = workspace.batches.find((b) => b.id === selectedEvidenceRow.batchId);
  const linkedTasks = workspace.actionTasks.filter((t) =>
    t.citedRows.includes(selectedEvidenceRow.rowIndex)
  );
  const linkedAlerts = workspace.alerts.filter((a) =>
    a.evidenceRows.includes(selectedEvidenceRow.rowIndex)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[1px] no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="citation-drawer-title"
    >
      <div className="w-full max-w-xl bg-white h-full overflow-y-auto border-l border-slate-200 shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <div>
            <h2 id="citation-drawer-title" className="text-base font-semibold text-slate-900">
              Source Evidence · Row #{selectedEvidenceRow.rowIndex}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{batch?.title ?? 'Dataset Batch'}</p>
          </div>
          <button
            type="button"
            onClick={closeEvidenceRow}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Close source evidence drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!reading ? (
          <div className="p-6 text-sm text-slate-600">
            Row #{selectedEvidenceRow.rowIndex} was not found in the selected batch.
          </div>
        ) : (
          <div className="p-6 space-y-5 text-sm">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-900">{reading.locationName}</h3>
                <AqiStatusIndicator
                  aqi={reading.calculatedAqi}
                  alertLevel={reading.alertLevel}
                  category={reading.aqiCategory}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span>{reading.wardZone}</span>
                <span aria-hidden="true">·</span>
                <span>{reading.vulnerableZoneType.replace(/_/g, ' ')}</span>
                <span aria-hidden="true">·</span>
                <ReliabilityIndicator status={reading.reliabilityStatus} />
                {reading.excludeFromStatistics && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-red-700">Excluded from averages</span>
                  </>
                )}
              </div>
            </div>

            <section className="border border-slate-200 rounded-lg p-4 bg-slate-50/70">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
                Normalized Readings
              </h4>
              <div className="grid grid-cols-3 gap-3 font-mono text-xs tabular-nums">
                <div>
                  <div className="text-slate-500">PM2.5 (µg/m³)</div>
                  <div className="font-semibold text-slate-900">{reading.pm25 ?? 'Missing'}</div>
                </div>
                <div>
                  <div className="text-slate-500">PM10 (µg/m³)</div>
                  <div className="font-semibold text-slate-900">{reading.pm10 ?? 'Missing'}</div>
                </div>
                <div>
                  <div className="text-slate-500">NO2 (µg/m³)</div>
                  <div className="font-semibold text-slate-900">{reading.no2 ?? 'Missing'}</div>
                </div>
                <div>
                  <div className="text-slate-500">SO2 (µg/m³)</div>
                  <div className="font-semibold text-slate-900">{reading.so2 ?? 'Missing'}</div>
                </div>
                <div>
                  <div className="text-slate-500">CO (mg/m³)</div>
                  <div className="font-semibold text-slate-900">{reading.co ?? 'Missing'}</div>
                </div>
                <div>
                  <div className="text-slate-500">O3 (µg/m³)</div>
                  <div className="font-semibold text-slate-900">{reading.o3 ?? 'Missing'}</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-700 space-y-1">
                <div>
                  <span className="font-medium">Dominant Pollutant:</span> {reading.dominantPollutant}
                </div>
                <div>
                  <span className="font-medium">Likely Source Pattern:</span> {reading.possibleSourcePattern}
                </div>
                <div>
                  <span className="font-medium">Coordinates:</span>{' '}
                  {reading.latitude !== null && reading.longitude !== null
                    ? `${reading.latitude.toFixed(4)}, ${reading.longitude.toFixed(4)} (${reading.coordinateConfidence})`
                    : 'Not supplied'}
                </div>
              </div>
            </section>

            {reading.conversionFormulas.length > 0 && (
              <section className="border border-blue-200 bg-blue-50/50 rounded-lg p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-900 mb-2">
                  Unit Conversions Applied
                </h4>
                <ul className="space-y-1 text-xs font-mono text-blue-950">
                  {reading.conversionFormulas.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </section>
            )}

            {reading.flags.length > 0 ? (
              <section className="border border-amber-200 bg-amber-50/60 rounded-lg p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-900 mb-2 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" aria-hidden="true" />
                  <span>Quality &amp; Anomaly Flags</span>
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-xs text-amber-950">
                  {reading.flags.map((flag, i) => (
                    <li key={i}>{flag}</li>
                  ))}
                </ul>
              </section>
            ) : (
              <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>No data quality issues detected on this row.</span>
              </div>
            )}

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
                Original Raw Cells (Preserved)
              </h4>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-slate-200">
                    {Object.entries(reading.exactRawCells).map(([key, val]) => (
                      <tr key={key} className="bg-white">
                        <th className="text-left font-medium text-slate-600 px-3 py-1.5 bg-slate-50 w-1/3">
                          {key}
                        </th>
                        <td className="px-3 py-1.5 font-mono text-slate-900 break-all">{val || '(blank)'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {reading.reviewHistory.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Review History</span>
                </h4>
                <ul className="space-y-2 text-xs">
                  {reading.reviewHistory.map((h) => (
                    <li key={h.id} className="border border-slate-200 rounded p-2.5 bg-slate-50">
                      <div className="font-medium text-slate-900">
                        {h.field}: <span className="font-mono">{h.oldValue}</span> →{' '}
                        <span className="font-mono">{h.newValue}</span>
                      </div>
                      <div className="text-slate-600 mt-0.5">Reason: {h.reason}</div>
                      <div className="text-slate-500 mt-0.5">
                        {h.actorRole.replace(/_/g, ' ')} · {new Date(h.timestamp).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(linkedAlerts.length > 0 || linkedTasks.length > 0) && (
              <section className="space-y-2 pt-2 border-t border-slate-200">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Related Alerts &amp; Actions
                </h4>
                {linkedAlerts.map((a) => (
                  <div key={a.id} className="text-xs border border-slate-200 rounded p-2.5">
                    <span className="font-semibold text-slate-900">Alert ({a.status}):</span> {a.headline}
                  </div>
                ))}
                {linkedTasks.map((t) => (
                  <div key={t.id} className="text-xs border border-slate-200 rounded p-2.5">
                    <span className="font-semibold text-slate-900">Action ({t.status}):</span> {t.title} —{' '}
                    {t.instructedToSubordinate}
                  </div>
                ))}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { AlertTriangle, CheckCircle2, Copy, MapPin, ShieldAlert } from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { alertActionTransaction } from '../db/civicDexie';
import type { ReadingRecord } from '../types/civic';
import { AqiStatusIndicator, CitationChip, ReliabilityIndicator } from './StatusBadge';

export const EvidenceMap: React.FC = () => {
  const { workspace, openEvidenceRow, refreshWorkspace, notify, activeRole } = useStudio();

  const [layers, setLayers] = useState({
    hotspots: true,
    vulnerable: true,
    alerts: true,
    tasks: true,
    resolved: true,
    warnings: true,
  });
  const [selectedReading, setSelectedReading] = useState<ReadingRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);

  const latestBatch = workspace?.batches[0] ?? null;

  const latestReadings = useMemo(() => {
    if (!workspace || !latestBatch) return [];
    return workspace.readings.filter((r) => r.batchId === latestBatch.id);
  }, [workspace, latestBatch]);

  const mappedReadings = useMemo(
    () =>
      latestReadings.filter(
        (r) =>
          r.latitude !== null &&
          r.longitude !== null &&
          Number.isFinite(r.latitude) &&
          Number.isFinite(r.longitude)
      ),
    [latestReadings]
  );

  const unmappedReadings = useMemo(
    () => latestReadings.filter((r) => r.latitude === null || r.longitude === null),
    [latestReadings]
  );

  const visibleMarkers = useMemo(() => {
    return mappedReadings.filter((r) => {
      const hasAlert = (workspace?.alerts ?? []).some(
        (a) => a.targetLocation.toLowerCase() === r.locationName.toLowerCase() && a.status === 'APPROVED_PREPARED'
      );
      const hasTask = (workspace?.actionTasks ?? []).some(
        (t) => t.locationName.toLowerCase() === r.locationName.toLowerCase() && t.status !== 'COMPLETED'
      );
      const isResolved = (workspace?.actionTasks ?? []).some(
        (t) => t.locationName.toLowerCase() === r.locationName.toLowerCase() && t.status === 'COMPLETED'
      );
      const isVuln = r.vulnerableZoneType === 'SCHOOL_ZONE' || r.vulnerableZoneType === 'SENIOR_PARK_HOSPITAL';
      const isWarning = r.flags.length > 0;
      const isHotspot = (r.calculatedAqi ?? 0) >= 201;

      return (
        (layers.hotspots && isHotspot) ||
        (layers.vulnerable && isVuln) ||
        (layers.alerts && hasAlert) ||
        (layers.tasks && hasTask) ||
        (layers.resolved && isResolved) ||
        (layers.warnings && isWarning) ||
        (!isHotspot && !isVuln && !isWarning)
      );
    });
  }, [mappedReadings, layers, workspace]);

  useEffect(() => {
    if (!mapContainerRef.current || mappedReadings.length === 0) return;

    if (!leafletMapRef.current) {
      const centerLat = mappedReadings.reduce((s, r) => s + (r.latitude ?? 0), 0) / mappedReadings.length;
      const centerLng = mappedReadings.reduce((s, r) => s + (r.longitude ?? 0), 0) / mappedReadings.length;

      const map = L.map(mapContainerRef.current, {
        center: [centerLat, centerLng],
        zoom: 13,
      });

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      const layerGroup = L.layerGroup().addTo(map);
      leafletMapRef.current = map;
      markerLayerRef.current = layerGroup;
    }

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        markerLayerRef.current = null;
      }
    };
  }, [mappedReadings.length > 0]);

  useEffect(() => {
    const map = leafletMapRef.current;
    const layer = markerLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const bounds: L.LatLngTuple[] = [];

    visibleMarkers.forEach((r) => {
      if (r.latitude === null || r.longitude === null) return;
      const color =
        r.flags.length > 0 && r.excludeFromStatistics
          ? '#64748b'
          : (r.calculatedAqi ?? 0) >= 301
          ? '#dc2626'
          : (r.calculatedAqi ?? 0) >= 201
          ? '#ea580c'
          : (r.calculatedAqi ?? 0) >= 101
          ? '#d97706'
          : '#16a34a';

      const marker = L.circleMarker([r.latitude, r.longitude], {
        radius: 10,
        color: '#0f172a',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.9,
      });

      marker.bindTooltip(
        `${r.locationName} (Row #${r.rowIndex}) · ${r.calculatedAqi !== null ? `AQI ${r.calculatedAqi}` : 'AQI N/A'}`,
        { direction: 'top' }
      );

      marker.on('click', () => {
        setSelectedReading(r);
        openEvidenceRow(r.batchId, r.rowIndex);
      });

      marker.addTo(layer);
      bounds.push([r.latitude, r.longitude]);
    });

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    }
  }, [visibleMarkers, openEvidenceRow]);

  const handleAlertAction = async (
    alertId: string,
    action: 'APPROVE_AND_PREPARE' | 'REQUEST_VERIFICATION' | 'REJECT' | 'RESOLVE' | 'ACKNOWLEDGE'
  ) => {
    if (!activeRole) return;
    setBusy(true);
    try {
      const updated = await alertActionTransaction(activeRole, alertId, action);
      await refreshWorkspace();
      notify('success', `Targeted alert updated (${updated.status}).`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Alert update failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!latestBatch) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-xl mx-auto mt-6">
        <MapPin className="w-10 h-10 text-slate-400 mx-auto mb-3" aria-hidden="true" />
        <h1 className="text-lg font-bold text-slate-900">No Evidence Coordinates Loaded</h1>
        <p className="text-sm text-slate-600 mt-1">
          Analyze a dataset first to inspect mapped locations and targeted zone alerts.
        </p>
      </div>
    );
  }

  const alerts = workspace?.alerts ?? [];
  const relatedTasksForSelected = selectedReading
    ? (workspace?.actionTasks ?? []).filter(
        (t) =>
          t.locationName.toLowerCase() === selectedReading.locationName.toLowerCase() ||
          t.citedRows.includes(selectedReading.rowIndex)
      )
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Evidence Map &amp; Targeted Alerts</h1>
        {mappedReadings.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5">
            {(
              [
                ['hotspots', 'Hotspots'],
                ['vulnerable', 'Schools / Seniors'],
                ['alerts', 'Alerts'],
                ['tasks', 'Active Actions'],
                ['resolved', 'Resolved'],
                ['warnings', 'Flagged'],
              ] as [keyof typeof layers, string][]
            ).map(([key, label]) => (
              <label key={key} className="inline-flex items-center gap-1.5 cursor-pointer text-slate-800">
                <input
                  type="checkbox"
                  checked={layers[key]}
                  onChange={(e) => setLayers((prev) => ({ ...prev, [key]: e.target.checked }))}
                  className="rounded border-slate-300 text-blue-700"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Map ONLY if verified imported coordinates exist */}
      {mappedReadings.length > 0 ? (
        <section aria-label="Evidence Map" className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div ref={mapContainerRef} className="w-full h-[420px] z-0" />
          {selectedReading && (
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <div className="font-bold text-slate-900">
                  {selectedReading.locationName} ({selectedReading.wardZone})
                </div>
                <div className="text-slate-600">
                  PM2.5: {selectedReading.pm25 ?? 'N/A'} µg/m³ · PM10: {selectedReading.pm10 ?? 'N/A'} µg/m³
                  {relatedTasksForSelected[0] && ` · Related action: ${relatedTasksForSelected[0].title} (${relatedTasksForSelected[0].status})`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <AqiStatusIndicator aqi={selectedReading.calculatedAqi} alertLevel={selectedReading.alertLevel} />
                <CitationChip batchId={selectedReading.batchId} rowIndex={selectedReading.rowIndex} />
              </div>
            </div>
          )}
        </section>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-700">
          No coordinates included in this dataset — showing the verified evidence table below.
        </div>
      )}

      {unmappedReadings.length > 0 && mappedReadings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-950">
          {unmappedReadings.length} row(s) without coordinates are listed in the evidence table below.
        </div>
      )}

      {/* Targeted Zone Alert Workflow */}
      <section aria-labelledby="map-alerts-heading" className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="map-alerts-heading" className="text-base font-semibold text-slate-900">
            Targeted Zone Alerts
          </h2>
          <div className="text-[11px] font-medium text-slate-600 flex flex-wrap items-center gap-1.5">
            <span>Evidence found</span>
            <span aria-hidden="true">→</span>
            <span>Head review</span>
            <span aria-hidden="true">→</span>
            <span>Approved action</span>
            <span aria-hidden="true">→</span>
            <span>Targeted recipients</span>
            <span aria-hidden="true">→</span>
            <span>Outcome review</span>
          </div>
        </div>

        {alerts.length === 0 ? (
          <p className="text-xs text-slate-600">
            No targeted alerts queued yet. Generate a briefing to evaluate affected zones.
          </p>
        ) : (
          <div className="space-y-3">
            {alerts.map((a) => (
              <div key={a.id} className="border border-slate-200 rounded-lg p-4 text-xs space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-semibold text-slate-900">
                    {a.severity === 'VERIFICATION_REQUIRED' ? (
                      <ShieldAlert className="w-4 h-4 text-amber-700" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-700" aria-hidden="true" />
                    )}
                    <span>{a.headline}</span>
                  </div>
                  <span className="font-mono font-semibold text-slate-700">
                    {a.status === 'APPROVED_PREPARED'
                      ? `Prepared for ${a.recipientCount} targeted recipient(s)`
                      : a.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="text-slate-600">
                  Target group: <span className="font-medium text-slate-900">{a.targetScope.replace(/_/g, ' ')}</span> ·{' '}
                  Zone: <span className="font-medium text-slate-900">{a.targetZone}</span> · {a.confidenceLabel}
                </div>
                <p className="text-slate-800">{a.currentSituationText}</p>
                <p className="text-slate-700">
                  <span className="font-semibold">Action:</span> {a.recommendedActionText}
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {a.evidenceRows.map((rn) => (
                    <CitationChip key={rn} batchId={latestBatch.id} rowIndex={rn} />
                  ))}
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    {a.status === 'PENDING_APPROVAL' &&
                      (activeRole === 'EVALUATOR' ||
                        activeRole === 'WARD_OFFICER' ||
                        a.targetScope !== 'AFFECTED_WARD_ONLY') && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleAlertAction(a.id, 'APPROVE_AND_PREPARE')}
                            className="px-3 py-1.5 bg-blue-700 text-white font-semibold rounded hover:bg-blue-800"
                          >
                            Approve &amp; Prepare Alert
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleAlertAction(a.id, 'REJECT')}
                            className="px-2.5 py-1.5 border border-slate-300 bg-white text-slate-700 rounded hover:bg-slate-50"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    {a.status === 'APPROVED_PREPARED' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard
                              .writeText(`[${a.targetZone}] ${a.headline}\n${a.currentSituationText}\nAction: ${a.recommendedActionText}`)
                              .catch(() => {});
                            notify('success', 'Approved alert copied to clipboard.');
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded bg-white hover:bg-slate-50 font-medium"
                        >
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Copy Approved Alert</span>
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleAlertAction(a.id, 'RESOLVE')}
                          className="px-3 py-1.5 border border-emerald-300 bg-emerald-50 text-emerald-900 rounded font-medium hover:bg-emerald-100"
                        >
                          Mark Outcome Reviewed
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Accessible Evidence Table */}
      <section aria-labelledby="map-table-heading" className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="map-table-heading" className="text-base font-semibold text-slate-900">
            Location Evidence Table ({latestReadings.length} Rows)
          </h2>
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
            Accessible table view
          </span>
        </div>
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-semibold">Row</th>
                <th className="px-3 py-2 font-semibold">Location &amp; Ward</th>
                <th className="px-3 py-2 font-semibold">Coordinates</th>
                <th className="px-3 py-2 font-semibold">AQI</th>
                <th className="px-3 py-2 font-semibold">Quality</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {latestReadings.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <CitationChip batchId={r.batchId} rowIndex={r.rowIndex} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{r.locationName}</div>
                    <div className="text-slate-500">
                      {r.wardZone} · {r.vulnerableZoneType.replace(/_/g, ' ')}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono tabular-nums text-slate-700">
                    {r.latitude !== null && r.longitude !== null
                      ? `${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}`
                      : 'Not supplied'}
                  </td>
                  <td className="px-3 py-2">
                    <AqiStatusIndicator aqi={r.calculatedAqi} alertLevel={r.alertLevel} />
                  </td>
                  <td className="px-3 py-2">
                    <ReliabilityIndicator status={r.reliabilityStatus} />
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

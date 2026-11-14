import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { BatchRecord, ReadingRecord } from '../types/civic';
import { CitationChip } from './StatusBadge';

export const DataQualityPanel: React.FC<{
  batch: BatchRecord;
  readings: ReadingRecord[];
  compact?: boolean;
}> = ({ batch, readings, compact = false }) => {
  const validCount = readings.filter((r) => !r.excludeFromStatistics && r.calculatedAqi !== null).length;
  const flaggedReadings = readings.filter((r) => r.flags.length > 0);

  return (
    <section
      aria-label="Data quality summary"
      className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {batch.unreliableRows > 0 || batch.missingRows > 0 ? (
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
          )}
          <h3 className="text-sm font-semibold text-slate-900">Data Quality</h3>
        </div>
        <span className="text-xs font-mono tabular-nums font-semibold text-slate-700">
          {batch.completenessPercent}% completeness
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono tabular-nums">
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <div className="text-slate-500 font-sans">Valid rows</div>
          <div className="text-base font-bold text-emerald-800">{validCount}</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <div className="text-slate-500 font-sans">Missing data</div>
          <div className="text-base font-bold text-amber-800">{batch.missingRows}</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <div className="text-slate-500 font-sans">Unit conversions</div>
          <div className="text-base font-bold text-blue-800">{batch.convertedRows}</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <div className="text-slate-500 font-sans">Unreliable rows</div>
          <div className="text-base font-bold text-red-800">{batch.unreliableRows}</div>
        </div>
      </div>

      {!compact && flaggedReadings.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="text-xs font-medium text-slate-700">Flagged rows requiring attention:</div>
          <ul className="space-y-1 text-xs text-slate-700">
            {flaggedReadings.slice(0, 5).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 bg-amber-50/60 border border-amber-200 rounded px-2.5 py-1.5">
                <span className="truncate">
                  <span className="font-medium text-slate-900">{r.locationName}:</span> {r.flags[0]}
                </span>
                <CitationChip batchId={r.batchId} rowIndex={r.rowIndex} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

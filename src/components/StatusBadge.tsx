import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileSearch,
  HelpCircle,
  OctagonAlert,
  ShieldAlert,
} from 'lucide-react';
import type { AlertLevel, ReliabilityStatus } from '../types/civic';
import { useStudio } from '../context/StudioContext';

export const AqiStatusIndicator: React.FC<{
  aqi: number | null;
  alertLevel: AlertLevel;
  category?: string;
}> = ({ aqi, alertLevel, category }) => {
  if (aqi === null || alertLevel === 'AQI_UNAVAILABLE') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
        <HelpCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
        <span>AQI unavailable from supplied data</span>
      </span>
    );
  }

  const config: Record<
    Exclude<AlertLevel, 'AQI_UNAVAILABLE'>,
    { label: string; classes: string; Icon: React.FC<{ className?: string }> }
  > = {
    GREEN_SAFE: {
      label: category || 'Good / Satisfactory',
      classes: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      Icon: CheckCircle2,
    },
    YELLOW_WATCH: {
      label: category || 'Moderate Watch',
      classes: 'bg-amber-50 text-amber-900 border-amber-200',
      Icon: Eye,
    },
    ORANGE_WARNING: {
      label: category || 'Poor Warning',
      classes: 'bg-orange-50 text-orange-900 border-orange-200',
      Icon: AlertTriangle,
    },
    RED_EMERGENCY_ZONE: {
      label: category || 'Red Zone Emergency',
      classes: 'bg-red-50 text-red-900 border-red-200',
      Icon: OctagonAlert,
    },
  };

  const entry = config[alertLevel];
  const Icon = entry.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium border rounded-md whitespace-nowrap ${entry.classes}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span className="font-mono tabular-nums font-semibold">AQI {aqi}</span>
      <span aria-hidden="true">·</span>
      <span>{entry.label}</span>
    </span>
  );
};

export const ReliabilityIndicator: React.FC<{ status: ReliabilityStatus }> = ({ status }) => {
  const map: Record<ReliabilityStatus, { label: string; cls: string }> = {
    CLEAN: { label: 'Verified Clean', cls: 'text-emerald-700' },
    UNIT_CONVERTED: { label: 'Unit Converted', cls: 'text-blue-700' },
    MISSING_DATA_GAP: { label: 'Missing Data Gap', cls: 'text-amber-700' },
    NON_NUMERIC_CELL: { label: 'Non-Numeric Cell', cls: 'text-red-700' },
    NEGATIVE_VALUE_INVALID: { label: 'Negative Invalid', cls: 'text-red-700' },
    DUPLICATE_ROW: { label: 'Duplicate Row', cls: 'text-amber-800' },
    OUTLIER_REQUIRES_VERIFICATION: { label: 'Outlier (Verify)', cls: 'text-red-700' },
    INCONSISTENT_MEASUREMENT_PM25_GT_PM10: { label: 'PM2.5 > PM10 Inconsistent', cls: 'text-red-700' },
    SHARP_DROP_REQUIRES_VERIFICATION: { label: 'Sharp Drop (Verify)', cls: 'text-amber-800' },
    CONVERSION_UNAVAILABLE: { label: 'Conversion Unavailable', cls: 'text-amber-800' },
  };
  const info = map[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${info.cls}`}>
      {status === 'CLEAN' || status === 'UNIT_CONVERTED' ? (
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      )}
      <span>{info.label}</span>
    </span>
  );
};

export const CitationChip: React.FC<{
  batchId: string;
  rowIndex: number;
}> = ({ batchId, rowIndex }) => {
  const { openEvidenceRow } = useStudio();
  return (
    <button
      type="button"
      onClick={() => openEvidenceRow(batchId, rowIndex)}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-mono font-medium text-blue-800 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0"
      title={`Inspect underlying source data for Row #${rowIndex}`}
    >
      <FileSearch className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span>Row #{rowIndex}</span>
    </button>
  );
};

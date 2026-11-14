import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  FileUp,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import {
  commitBatchTransaction,
  deleteReadingTransaction,
  reviewReadingTransaction,
} from '../db/civicDexie';
import type { ColumnMappingConfig, ReadingRecord } from '../types/civic';
import { DataQualityPanel } from './DataQualityPanel';
import { AqiStatusIndicator, CitationChip, ReliabilityIndicator } from './StatusBadge';

export const IngestionWorkspace: React.FC = () => {
  const { workspace, refreshWorkspace, notify, activeRole } = useStudio();
  const [title, setTitle] = useState('Local Air Quality Batch');
  const [rawText, setRawText] = useState('');
  const [sourceType, setSourceType] = useState<'PASTE_TEXT' | 'CSV' | 'TSV' | 'JSON' | 'XLSX' | 'TEST_FIXTURE'>('PASTE_TEXT');
  const [storagePath, setStoragePath] = useState('inline_paste');
  const [isTestFixture, setIsTestFixture] = useState(false);
  const [fixtureLabel, setFixtureLabel] = useState<string | undefined>(undefined);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>('fixture_1_baseline');

  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ColumnMappingConfig>({});
  const [showMapping, setShowMapping] = useState(false);
  const [aiNotes, setAiNotes] = useState<{ note: string; flags: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  // Committed Audit table state
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [editingReading, setEditingReading] = useState<ReadingRecord | null>(null);
  const [editPm25, setEditPm25] = useState('');
  const [editPm10, setEditPm10] = useState('');
  const [editReason, setEditReason] = useState('');

  const activeBatch = useMemo(() => {
    if (!workspace || workspace.batches.length === 0) return null;
    return workspace.batches.find((b) => b.id === selectedBatchId) ?? workspace.batches[0];
  }, [workspace, selectedBatchId]);

  const activeBatchAllReadings = useMemo(() => {
    if (!workspace || !activeBatch) return [];
    return workspace.readings.filter((r) => r.batchId === activeBatch.id);
  }, [workspace, activeBatch]);

  const filteredReadings = useMemo(() => {
    if (!searchTerm.trim()) return activeBatchAllReadings;
    const q = searchTerm.toLowerCase();
    return activeBatchAllReadings.filter(
      (r) =>
        r.locationName.toLowerCase().includes(q) ||
        r.wardZone.toLowerCase().includes(q) ||
        r.reliabilityStatus.toLowerCase().includes(q) ||
        String(r.rowIndex) === q
    );
  }, [activeBatchAllReadings, searchTerm]);

  const pageSize = 15;
  const totalPages = Math.max(1, Math.ceil(filteredReadings.length / pageSize));
  const pagedReadings = filteredReadings.slice((page - 1) * pageSize, page * pageSize);

  const handleLoadFixture = async () => {
    if (!selectedFixtureId) return;
    setBusy(true);
    setAiNotes(null);
    try {
      const res = await fetch(`/api/ingest/fixtures/${selectedFixtureId}`);
      const data = await res.json();
      if (!res.ok) {
        notify('error', data.error || 'Failed to load test fixture.');
        return;
      }
      setTitle(data.title);
      setRawText(data.rawText);
      setSourceType('TEST_FIXTURE');
      setStoragePath(`fixture://${data.id}`);
      setIsTestFixture(true);
      setFixtureLabel(data.label);

      const prevRes = await fetch('/api/ingest/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: data.rawText, sourceType: data.sourceType }),
      });
      const prevData = await prevRes.json();
      if (prevRes.ok) {
        setHeaders(prevData.headers);
        setPreviewRows(prevData.previewRows);
        setMapping(prevData.proposedMapping);
        notify('info', `Loaded ${data.label} (${prevData.totalDetectedRows} rows).`);
      } else {
        setHeaders([]);
        setPreviewRows([]);
        setMapping({});
        notify('info', `Loaded malformed fixture (${prevData.error}).`);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setAiNotes(null);
    try {
      const arrayBuf = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const contentBase64 = btoa(binary);
      const res = await fetch('/api/ingest/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentBase64 }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify('error', data.error || 'File parsing failed.');
        return;
      }
      setTitle(file.name.replace(/\.[^.]+$/, ''));
      setRawText(data.rawText);
      setSourceType(data.sourceType);
      setStoragePath(data.storagePath);
      setIsTestFixture(false);
      setFixtureLabel(undefined);
      setHeaders(data.headers);
      setPreviewRows(data.previewRows);
      setMapping(data.proposedMapping);
      notify('success', `Parsed ${file.name} (${data.totalDetectedRows} rows).`);
    } catch {
      notify('error', 'Unable to read uploaded file.');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const handlePreviewPaste = async (): Promise<ColumnMappingConfig | null> => {
    setBusy(true);
    setAiNotes(null);
    try {
      const res = await fetch('/api/ingest/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText, sourceType }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify('error', data.error || 'Preview failed.');
        return null;
      }
      setHeaders(data.headers);
      setPreviewRows(data.previewRows);
      setMapping(data.proposedMapping);
      notify('success', `Detected ${data.totalDetectedRows} rows (${data.detectedDelimiter}).`);
      return data.proposedMapping as ColumnMappingConfig;
    } finally {
      setBusy(false);
    }
  };

  const handleAiParseBroken = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/ingest/ai-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify('error', data.error || 'AI table parsing failed.');
        return;
      }
      setRawText(data.extractedCsvText);
      setHeaders(data.detectedHeaders);
      setPreviewRows(data.previewRows);
      setMapping(data.proposedMapping);
      setAiNotes({
        note: `${data.detectedUnitsNote} (${data.model}, ${data.latencyMs} ms)`,
        flags: data.ambiguityFlags,
      });
      notify('info', 'AI column mapping proposed. Review preview before analyzing.');
    } finally {
      setBusy(false);
    }
  };

  const handleReviewAndAnalyze = async () => {
    if (!activeRole || !rawText.trim()) return;
    let activeMapping = mapping;
    if (headers.length === 0 || !activeMapping.location) {
      const autoMapped = await handlePreviewPaste();
      if (!autoMapped?.location) {
        notify('error', 'Map the Location/Station column before analyzing.');
        setShowMapping(true);
        return;
      }
      activeMapping = autoMapped;
    }

    setBusy(true);
    try {
      const prevBatch = workspace?.batches[0] ?? null;
      const previousBatchReadings = prevBatch
        ? (workspace?.readings ?? []).filter((r) => r.batchId === prevBatch.id)
        : [];

      const res = await fetch('/api/ingest/normalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          rawText,
          sourceType,
          storagePath,
          columnMapping: activeMapping,
          isTestFixture,
          fixtureLabel,
          previousBatchReadings,
          createdBy: activeRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify('error', data.error || 'Failed to normalize data.');
        return;
      }
      await commitBatchTransaction(activeRole, data.batch, data.readings);
      await refreshWorkspace();
      setSelectedBatchId(data.batch.id);
      setPage(1);
      notify(
        'success',
        `Analyzed "${data.batch.title}": ${data.batch.totalRows} rows (${data.batch.convertedRows} unit converted, ${data.batch.unreliableRows} flagged).`
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save analyzed batch.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleExclude = async (r: ReadingRecord) => {
    if (!activeRole) return;
    setBusy(true);
    try {
      const aqiRes = await fetch('/api/readings/recompute-aqi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pm25: r.pm25,
          pm10: r.pm10,
          no2: r.no2,
          so2: r.so2,
          co: r.co,
          o3: r.o3,
        }),
      });
      const recomputed = await aqiRes.json();
      await reviewReadingTransaction(
        activeRole,
        r.id,
        {
          excludeFromStatistics: !r.excludeFromStatistics,
          reason: r.excludeFromStatistics ? 'Included after verification' : 'Excluded after verification',
        },
        recomputed
      );
      await refreshWorkspace();
      notify('success', `Row #${r.rowIndex} updated.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReading || !activeRole) return;
    setBusy(true);
    try {
      const nextPm25 = editPm25 === '' ? null : Number(editPm25);
      const nextPm10 = editPm10 === '' ? null : Number(editPm10);
      const aqiRes = await fetch('/api/readings/recompute-aqi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pm25: nextPm25,
          pm10: nextPm10,
          no2: editingReading.no2,
          so2: editingReading.so2,
          co: editingReading.co,
          o3: editingReading.o3,
        }),
      });
      const recomputed = await aqiRes.json();
      await reviewReadingTransaction(
        activeRole,
        editingReading.id,
        { pm25: nextPm25, pm10: nextPm10, reason: editReason },
        recomputed
      );
      setEditingReading(null);
      await refreshWorkspace();
      notify('success', `Saved review override for Row #${editingReading.rowIndex}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save override.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteReading = async (r: ReadingRecord) => {
    if (!activeRole) return;
    setBusy(true);
    try {
      await deleteReadingTransaction(activeRole, r.id);
      await refreshWorkspace();
      notify('success', `Deleted Row #${r.rowIndex}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to delete row.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Data Ingestion</h1>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 text-slate-800 rounded-lg hover:bg-slate-50 cursor-pointer">
            <FileUp className="w-3.5 h-3.5 text-blue-700" aria-hidden="true" />
            <span>Upload Data File</span>
            <input
              type="file"
              accept=".csv,.tsv,.json,.xlsx,.xls"
              onChange={handleFileUpload}
              className="sr-only"
            />
          </label>

          {/* Compact Labelled Test-Fixture Selector */}
          <div className="flex items-center gap-1.5 bg-amber-50/70 border border-amber-200 rounded-lg px-2.5 py-1">
            <span className="text-[11px] font-semibold text-amber-900 whitespace-nowrap">
              TEST FIXTURE — NOT LIVE DATA
            </span>
            <select
              aria-label="Select labelled test fixture"
              value={selectedFixtureId}
              onChange={(e) => setSelectedFixtureId(e.target.value)}
              className="text-xs bg-white border border-amber-300 rounded px-2 py-1 text-slate-900"
            >
              {(workspace?.fixtures ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleLoadFixture()}
              className="px-2.5 py-1 text-xs font-semibold bg-white border border-amber-300 text-amber-950 rounded hover:bg-amber-100 disabled:opacity-50"
            >
              Load
            </button>
          </div>
        </div>
      </div>

      {/* Paste & Normalize Panel */}
      <section aria-label="Paste or upload air quality table" className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label htmlFor="batch-title" className="block text-xs font-medium text-slate-700 mb-1">
              Dataset Title
            </label>
            <input
              id="batch-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
            />
          </div>
          <div>
            <label htmlFor="source-type" className="block text-xs font-medium text-slate-700 mb-1">
              Format
            </label>
            <select
              id="source-type"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as typeof sourceType)}
              className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="PASTE_TEXT">Pasted Table (CSV/TSV/MD/WhatsApp)</option>
              <option value="CSV">CSV</option>
              <option value="TSV">TSV</option>
              <option value="JSON">JSON</option>
              <option value="XLSX">XLSX</option>
              <option value="TEST_FIXTURE">Labelled Test Fixture</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="raw-table-input" className="block text-xs font-medium text-slate-700 mb-1">
            Paste Raw Table Data
          </label>
          <textarea
            id="raw-table-input"
            rows={7}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste CSV, TSV, Excel, Markdown pipe, or messy log rows here..."
            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={busy || !rawText.trim()}
            onClick={() => void handleReviewAndAnalyze()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
            <span>Review and Analyze Data</span>
          </button>

          <button
            type="button"
            disabled={busy || !rawText.trim()}
            onClick={() => void handlePreviewPaste()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-300 bg-white text-slate-800 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Parse Preview</span>
          </button>

          <button
            type="button"
            disabled={busy || !rawText.trim()}
            onClick={() => void handleAiParseBroken()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>AI Parse Broken Table</span>
          </button>

          {headers.length > 0 && (
            <button
              type="button"
              onClick={() => setShowMapping((v) => !v)}
              className="ml-auto text-xs font-medium text-slate-600 hover:text-slate-900 underline"
            >
              {showMapping ? 'Hide Column Mapping' : 'Adjust Column Mapping'}
            </button>
          )}
        </div>

        {aiNotes && (
          <div className="border border-blue-200 bg-blue-50/50 rounded-lg p-3 text-xs text-blue-950 space-y-1">
            <div className="font-semibold">AI Mapping Proposal: {aiNotes.note}</div>
            {aiNotes.flags.length > 0 && (
              <ul className="list-disc pl-5">
                {aiNotes.flags.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {headers.length > 0 && showMapping && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 pt-2 border-t border-slate-200">
            {(
              [
                ['location', 'Location *'],
                ['ward', 'Ward'],
                ['timestamp', 'Timestamp'],
                ['pm25', 'PM2.5'],
                ['pm10', 'PM10'],
                ['no2', 'NO2'],
                ['so2', 'SO2'],
                ['co', 'CO'],
                ['o3', 'O3'],
                ['latitude', 'Latitude'],
                ['longitude', 'Longitude'],
                ['vulnerableZone', 'Zone Type'],
                ['unit', 'Unit Column'],
              ] as [keyof ColumnMappingConfig, string][]
            ).map(([field, label]) => (
              <div key={field}>
                <label htmlFor={`map-${field}`} className="block text-[11px] font-medium text-slate-700 mb-1">
                  {label}
                </label>
                <select
                  id={`map-${field}`}
                  value={mapping[field] ?? ''}
                  onChange={(e) =>
                    setMapping((prev) => ({
                      ...prev,
                      [field]: e.target.value || undefined,
                    }))
                  }
                  className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                >
                  <option value="">-- Ignore --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {headers.length > 0 && previewRows.length > 0 && (
          <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-52">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                <tr>
                  {headers.map((h) => (
                    <th key={h} className="px-3 py-1.5 font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {previewRows.slice(0, 6).map((row, idx) => (
                  <tr key={idx}>
                    {headers.map((h) => (
                      <td key={h} className="px-3 py-1.5 font-mono whitespace-nowrap text-slate-800">
                        {row[h] || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Analyzed Data Quality Summary & Normalized Audit Table */}
      {activeBatch && (
        <>
          <DataQualityPanel batch={activeBatch} readings={activeBatchAllReadings} />

          <section aria-label="Normalized readings table" className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  Normalized &amp; Audited Rows ({activeBatch.totalRows})
                </h2>
                {activeBatch.isTestFixture && (
                  <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                    TEST FIXTURE — NOT LIVE DATA
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  aria-label="Select analyzed batch"
                  value={activeBatch.id}
                  onChange={(e) => {
                    setSelectedBatchId(e.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white max-w-xs"
                >
                  {workspace?.batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title} ({b.totalRows} rows)
                    </option>
                  ))}
                </select>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" aria-hidden="true" />
                  <input
                    type="search"
                    aria-label="Filter readings"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Filter location or flag..."
                    className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Row</th>
                    <th className="px-3 py-2 font-semibold">Location &amp; Ward</th>
                    <th className="px-3 py-2 font-semibold">Raw → Normalized</th>
                    <th className="px-3 py-2 font-semibold">AQI</th>
                    <th className="px-3 py-2 font-semibold">Anomaly / Quality</th>
                    <th className="px-3 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {pagedReadings.map((r) => (
                    <tr key={r.id} className={r.excludeFromStatistics ? 'bg-red-50/30' : 'hover:bg-slate-50'}>
                      <td className="px-3 py-2">
                        <CitationChip batchId={r.batchId} rowIndex={r.rowIndex} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{r.locationName}</div>
                        <div className="text-slate-500">
                          {r.wardZone} · {r.rawDateStr || 'No timestamp'}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums space-y-0.5">
                        <div>
                          PM2.5: {r.rawValuesAndUnits.PM25 || '—'} → <strong>{r.pm25 ?? 'N/A'}</strong> · PM10:{' '}
                          {r.rawValuesAndUnits.PM10 || '—'} → <strong>{r.pm10 ?? 'N/A'}</strong>
                        </div>
                        {r.conversionFormulas.length > 0 && (
                          <div className="text-[11px] text-blue-700">{r.conversionFormulas[0]}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <AqiStatusIndicator aqi={r.calculatedAqi} alertLevel={r.alertLevel} />
                      </td>
                      <td className="px-3 py-2 space-y-1">
                        <ReliabilityIndicator status={r.reliabilityStatus} />
                        {r.flags.length > 0 && <div className="text-[11px] text-slate-600">{r.flags[0]}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleToggleExclude(r)}
                            className="px-2 py-1 border border-slate-300 rounded bg-white hover:bg-slate-50 text-[11px] font-medium"
                          >
                            {r.excludeFromStatistics ? 'Include' : 'Exclude'}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setEditingReading(r);
                              setEditPm25(r.pm25 !== null ? String(r.pm25) : '');
                              setEditPm10(r.pm10 !== null ? String(r.pm10) : '');
                              setEditReason('');
                            }}
                            className="px-2 py-1 border border-slate-300 rounded bg-white hover:bg-slate-50 text-[11px] font-medium"
                          >
                            Review
                          </button>
                          {(activeRole === 'EVALUATOR' || activeRole === 'WARD_OFFICER') && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleDeleteReading(r)}
                              aria-label={`Delete Row #${r.rowIndex}`}
                              className="p-1 border border-red-200 text-red-700 rounded hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>
                  Page {page} of {totalPages} ({filteredReadings.length} rows)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-3 py-1 border border-slate-300 rounded bg-white disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1 border border-slate-300 rounded bg-white disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {/* Human Review Override Modal */}
      {editingReading && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-modal-title"
        >
          <form
            onSubmit={handleSaveOverride}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h3 id="review-modal-title" className="text-base font-semibold text-slate-900">
              Review Override · Row #{editingReading.rowIndex}
            </h3>
            <p className="text-xs text-slate-600">
              Original values ({editingReading.rawValuesAndUnits.PM25 || 'N/A'} /{' '}
              {editingReading.rawValuesAndUnits.PM10 || 'N/A'}) remain preserved in the evidence log.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-pm25" className="block text-xs font-medium text-slate-700 mb-1">
                  PM2.5 (µg/m³)
                </label>
                <input
                  id="edit-pm25"
                  type="number"
                  step="0.1"
                  value={editPm25}
                  onChange={(e) => setEditPm25(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label htmlFor="edit-pm10" className="block text-xs font-medium text-slate-700 mb-1">
                  PM10 (µg/m³)
                </label>
                <input
                  id="edit-pm10"
                  type="number"
                  step="0.1"
                  value={editPm10}
                  onChange={(e) => setEditPm10(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md"
                />
              </div>
            </div>
            <div>
              <label htmlFor="edit-reason" className="block text-xs font-medium text-slate-700 mb-1">
                Verification Reason *
              </label>
              <input
                id="edit-reason"
                type="text"
                required
                minLength={3}
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="e.g., Confirmed handheld sensor check"
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingReading(null)}
                className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-md bg-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-1.5 text-xs font-semibold bg-blue-700 text-white rounded-md hover:bg-blue-800"
              >
                Save Review
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

import type {
  AreaTrajectoryRecord,
  BatchRecord,
  OperatingRoleProfile,
  OutcomeComparisonEntry,
  PersonaRole,
  ReadingRecord,
  UserRole,
  VulnerableZoneType,
} from '../types/civic';

export const OPERATING_ROLES: OperatingRoleProfile[] = [
  {
    role: 'EVALUATOR',
    displayName: 'Evaluator (Full Studio & QA)',
    organizationName: 'Civic Studio Local Evaluation Workspace',
    wardZone: 'All Wards',
    defaultPersona: 'WARD_OFFICER',
    description:
      'Full access across all modules, Persona Lens switcher, isolated QA self-check runner, local audit log, and [Wipe Local Workspace].',
  },
  {
    role: 'WARD_OFFICER',
    displayName: 'Ward Officer (Municipal Authority)',
    organizationName: 'Municipal Ward 14 & Ward 7 Authority',
    wardZone: 'Ward 14',
    defaultPersona: 'WARD_OFFICER',
    description:
      'Ingest tables, audit sensor anomalies, run constrained field equipment dispatch, prepare targeted ward alerts, and issue municipal orders.',
  },
  {
    role: 'HOUSING_SOCIETY',
    displayName: 'Housing Society (RWA / Estate)',
    organizationName: 'Greenpark Residency RWA',
    wardZone: 'Ward 14',
    defaultPersona: 'HOUSING_SOCIETY',
    description:
      'Review society air briefings, manage DG/gate checks and senior park hours, prepare RWA alerts, and escalate upwind spillover to Ward Officer.',
  },
  {
    role: 'SCHOOL_COORDINATOR',
    displayName: 'School Coordinator (Principal / Health)',
    organizationName: 'Sunrise Public School Campus',
    wardZone: 'Ward 14',
    defaultPersona: 'SCHOOL_COORDINATOR',
    description:
      'Check safe outdoor play and classroom ventilation windows, issue teacher/infirmary directives, prepare school parent advisories, and escalate upwind sources.',
  },
];

export function getRoleProfile(role: UserRole): OperatingRoleProfile {
  return OPERATING_ROLES.find((r) => r.role === role) ?? OPERATING_ROLES[0];
}

export function defaultPersonaForRole(role: UserRole): PersonaRole {
  return getRoleProfile(role).defaultPersona;
}

export function sanitizeText(value: string): string {
  return value
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '[removed-script]')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/[<>]/g, (ch) => (ch === '<' ? '&lt;' : '&gt;'))
    .trim();
}

export function computeClientTrajectories(
  currentReadings: ReadingRecord[],
  previousReadings: ReadingRecord[]
): AreaTrajectoryRecord[] {
  const prevMap = new Map<string, { aqis: number[]; zone: string; vuln: VulnerableZoneType }>();
  previousReadings.forEach((r) => {
    if (r.excludeFromStatistics || r.calculatedAqi === null) return;
    const key = r.locationName.toLowerCase();
    const curr = prevMap.get(key) ?? { aqis: [], zone: r.wardZone, vuln: r.vulnerableZoneType };
    curr.aqis.push(r.calculatedAqi);
    prevMap.set(key, curr);
  });

  const currentByLoc = new Map<string, ReadingRecord[]>();
  currentReadings.forEach((r) => {
    const key = r.locationName.toLowerCase();
    const list = currentByLoc.get(key) ?? [];
    list.push(r);
    currentByLoc.set(key, list);
  });

  const trajectories: AreaTrajectoryRecord[] = [];
  currentByLoc.forEach((rows) => {
    const first = rows[0];
    const validRows = rows.filter((r) => !r.excludeFromStatistics && r.calculatedAqi !== null);
    const citedRowNumbers = rows.map((r) => r.rowIndex);
    const dataLimitations: string[] = [];
    rows.forEach((r) => {
      if (r.flags.length > 0) {
        dataLimitations.push(`Row #${r.rowIndex}: ${r.flags[0]}`);
      }
    });

    const currentAqi =
      validRows.length > 0
        ? Math.round(validRows.reduce((s, r) => s + (r.calculatedAqi ?? 0), 0) / validRows.length)
        : null;

    const prevEntry = prevMap.get(first.locationName.toLowerCase());
    const previousAqi =
      prevEntry && prevEntry.aqis.length > 0
        ? Math.round(prevEntry.aqis.reduce((s, v) => s + v, 0) / prevEntry.aqis.length)
        : null;

    const aqiDelta = currentAqi !== null && previousAqi !== null ? currentAqi - previousAqi : null;
    const rateOfChangePerHr = aqiDelta !== null ? Number((aqiDelta / 24).toFixed(2)) : null;

    let shortTermProjection24h: number | null = null;
    let projectionConfidence: AreaTrajectoryRecord['projectionConfidence'] = 'LOW_INSUFFICIENT_HISTORY';
    let projectionNote = 'Insufficient comparable history for short-term data projection.';
    let forecastTrend: AreaTrajectoryRecord['forecastTrend'] = 'INSUFFICIENT_DATA';

    if (currentAqi !== null && aqiDelta !== null) {
      shortTermProjection24h = Math.max(20, Math.min(500, Math.round(currentAqi + aqiDelta * 0.65)));
      projectionConfidence = validRows.length >= 2 ? 'HIGH' : 'MODERATE';
      projectionNote = 'Short-term data projection — not a guaranteed forecast (damped trend from previous period).';
      if (currentAqi < 301 && shortTermProjection24h >= 301) {
        forecastTrend = 'RISING_TO_RED_ALERT';
      } else if (aqiDelta > 15) {
        forecastTrend = 'WORSENING';
      } else if (aqiDelta < -15) {
        forecastTrend = 'IMPROVING';
      } else {
        forecastTrend = 'STABLE';
      }
    } else if (currentAqi !== null) {
      forecastTrend = 'STABLE';
      projectionNote = 'Baseline reading only; import a subsequent batch for short-term data projection.';
    }

    const vulnWeight =
      first.vulnerableZoneType === 'SCHOOL_ZONE'
        ? 1.35
        : first.vulnerableZoneType === 'SENIOR_PARK_HOSPITAL'
        ? 1.3
        : first.vulnerableZoneType === 'RESIDENTIAL_RWA'
        ? 1.15
        : 1.0;

    const isRedZoneNow = currentAqi !== null && currentAqi >= 301;
    const approachingRedZoneAlert =
      currentAqi !== null && currentAqi < 301 && shortTermProjection24h !== null && shortTermProjection24h >= 301;

    let earlyWarningAlert: string | null = null;
    if (isRedZoneNow) {
      earlyWarningAlert = `ACTIVE RED ZONE (AQI ${currentAqi}) — immediate protective measures advised.`;
    } else if (approachingRedZoneAlert) {
      earlyWarningAlert = `Approaching Red Zone (${currentAqi} -> projected ${shortTermProjection24h} within 24h) — preventive action recommended.`;
    }

    trajectories.push({
      id: `traj_${first.batchId}_${first.rowIndex}`,
      batchId: first.batchId,
      locationName: first.locationName,
      wardZone: first.wardZone,
      vulnerableZoneType: first.vulnerableZoneType,
      vulnerablePriorityWeight: vulnWeight,
      previousAqi,
      currentAqi,
      aqiDelta,
      rateOfChangePerHr,
      shortTermProjection24h,
      projectionConfidence,
      projectionNote,
      forecastTrend,
      isRedZoneNow,
      approachingRedZoneAlert,
      earlyWarningAlert,
      dataLimitations,
      citedRowNumbers,
    });
  });

  trajectories.sort((a, b) => (b.currentAqi ?? -1) - (a.currentAqi ?? -1));
  return trajectories;
}

export function computeClientOutcomeScorecard(
  trajectories: AreaTrajectoryRecord[],
  tasks: { locationName: string; title: string; status: string }[]
): OutcomeComparisonEntry[] {
  const entries: OutcomeComparisonEntry[] = [];
  const trajMap = new Map<string, AreaTrajectoryRecord>();
  trajectories.forEach((t) => trajMap.set(t.locationName.toLowerCase(), t));

  tasks.forEach((task) => {
    const t = trajMap.get(task.locationName.toLowerCase());
    if (!t || t.previousAqi === null || t.currentAqi === null) return;
    const delta = t.currentAqi - t.previousAqi;
    const isCompleted = task.status === 'COMPLETED';
    entries.push({
      locationName: t.locationName,
      wardZone: t.wardZone,
      previousAqi: t.previousAqi,
      currentAqi: t.currentAqi,
      aqiDelta: delta,
      taskTitle: task.title,
      taskStatus: task.status as OutcomeComparisonEntry['taskStatus'],
      outcomeCategory: isCompleted ? 'COMPLETED_TASK_AREA' : 'PENDING_TASK_AREA',
      summary: isCompleted
        ? `${t.locationName}: AQI moved ${t.previousAqi} -> ${t.currentAqi} (${delta >= 0 ? `+${delta}` : delta}) after task completion.`
        : `${t.locationName}: AQI moved ${t.previousAqi} -> ${t.currentAqi} (${delta >= 0 ? `+${delta}` : delta}) while task remained ${task.status}.`,
      scientificDisclaimer:
        'Observed change after task completion. This reflects measured data change and does not alone prove single-factor causation.',
    });
  });

  return entries;
}

export function recomputeClientBatchStats(batch: BatchRecord, readings: ReadingRecord[]): BatchRecord {
  let cleanRows = 0;
  let convertedRows = 0;
  let missingRows = 0;
  let unreliableRows = 0;
  let duplicateRows = 0;
  let excludedRows = 0;
  readings.forEach((r) => {
    if (r.reliabilityStatus === 'CLEAN') cleanRows++;
    if (r.conversionFormulas.length > 0) convertedRows++;
    if (r.reliabilityStatus === 'MISSING_DATA_GAP') missingRows++;
    if (r.reliabilityStatus === 'DUPLICATE_ROW') duplicateRows++;
    if (r.excludeFromStatistics) excludedRows++;
    if (
      r.excludeFromStatistics ||
      r.reliabilityStatus === 'NON_NUMERIC_CELL' ||
      r.reliabilityStatus === 'SHARP_DROP_REQUIRES_VERIFICATION' ||
      r.reliabilityStatus === 'CONVERSION_UNAVAILABLE'
    ) {
      unreliableRows++;
    }
  });
  const totalRows = readings.length;
  const completenessPercent =
    totalRows === 0 ? 0 : Math.round(((totalRows - missingRows) / totalRows) * 100);
  return {
    ...batch,
    totalRows,
    cleanRows,
    convertedRows,
    missingRows,
    unreliableRows,
    duplicateRows,
    excludedRows,
    completenessPercent,
  };
}

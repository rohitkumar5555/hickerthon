import Dexie, { type Table } from 'dexie';
import type {
  ActionTaskRecord,
  AlertRecipientRecord,
  AlertRecord,
  AuditLogRecord,
  BatchRecord,
  BriefingRecord,
  CitizenAdvisoryRecord,
  PersonaRole,
  ReadingRecord,
  TaskStatus,
  TaskType,
  UserRole,
} from '../types/civic';
import {
  computeClientOutcomeScorecard,
  computeClientTrajectories,
  defaultPersonaForRole,
  recomputeClientBatchStats,
  sanitizeText,
} from '../utils/civicMath';

export interface WorkspaceMetaEntry {
  key: string;
  value: string;
}

class CivicStudioDexie extends Dexie {
  meta!: Table<WorkspaceMetaEntry, string>;
  batches!: Table<BatchRecord, string>;
  readings!: Table<ReadingRecord, string>;
  briefings!: Table<BriefingRecord, string>;
  advisories!: Table<CitizenAdvisoryRecord, string>;
  actionTasks!: Table<ActionTaskRecord, string>;
  alerts!: Table<AlertRecord, string>;
  alertRecipients!: Table<AlertRecipientRecord, string>;
  auditLogs!: Table<AuditLogRecord, string>;

  constructor() {
    super('CivicAirQualityStudioDB');
    this.version(1).stores({
      meta: 'key',
      batches: 'id, createdAt',
      readings: 'id, batchId, rowIndex, locationName',
      briefings: 'id, batchId, createdAt',
      advisories: 'id, briefingId, createdAt',
      actionTasks: 'id, briefingId, status, assignedRole, updatedAt',
      alerts: 'id, briefingId, status, createdAt',
      alertRecipients: 'id, alertId',
      auditLogs: 'id, timestamp, actorRole',
    });
  }
}

export const civicDb = new CivicStudioDexie();

async function appendAuditLog(
  actorRole: UserRole,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown> = {}
) {
  await civicDb.auditLogs.add({
    id: crypto.randomUUID(),
    actorRole,
    action,
    entityType,
    entityId,
    details,
    timestamp: new Date().toISOString(),
  });
}

export async function getSessionRoleState(): Promise<{
  activeRole: UserRole | null;
  activePersona: PersonaRole;
}> {
  const roleRow = await civicDb.meta.get('activeRole');
  const personaRow = await civicDb.meta.get('activePersona');
  const activeRole = (roleRow?.value as UserRole | undefined) ?? null;
  const activePersona =
    (personaRow?.value as PersonaRole | undefined) ??
    (activeRole ? defaultPersonaForRole(activeRole) : 'WARD_OFFICER');
  return { activeRole, activePersona };
}

export async function selectOperatingRole(role: UserRole, actionType: 'ROLE_SELECTED' | 'ROLE_SWITCHED' | 'ROLE_CLEARED' = 'ROLE_SELECTED') {
  const persona = defaultPersonaForRole(role);
  await civicDb.transaction('rw', civicDb.meta, civicDb.auditLogs, async () => {
    await civicDb.meta.put({ key: 'activeRole', value: role });
    await civicDb.meta.put({ key: 'activePersona', value: persona });
    await appendAuditLog(role, actionType, 'operating_role', role, { persona });
  });
  return { activeRole: role, activePersona: persona };
}

export async function clearOperatingRole(previousRole: UserRole) {
  await civicDb.transaction('rw', civicDb.meta, civicDb.auditLogs, async () => {
    await civicDb.meta.delete('activeRole');
    await civicDb.meta.delete('activePersona');
    await appendAuditLog(previousRole, 'ROLE_SESSION_EXITED', 'operating_role', previousRole, {});
  });
}

export async function setActivePersonaLens(actorRole: UserRole, persona: PersonaRole) {
  await civicDb.transaction('rw', civicDb.meta, civicDb.auditLogs, async () => {
    await civicDb.meta.put({ key: 'activePersona', value: persona });
    await appendAuditLog(actorRole, 'PERSONA_LENS_SWITCHED', 'persona_lens', persona, {});
  });
}

export async function loadFullWorkspaceFromDexie() {
  const [batches, readings, briefings, advisories, actionTasks, alerts, alertRecipients, auditLogs] =
    await Promise.all([
      civicDb.batches.toArray(),
      civicDb.readings.toArray(),
      civicDb.briefings.toArray(),
      civicDb.advisories.toArray(),
      civicDb.actionTasks.toArray(),
      civicDb.alerts.toArray(),
      civicDb.alertRecipients.toArray(),
      civicDb.auditLogs.toArray(),
    ]);

  batches.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  readings.sort((a, b) => a.rowIndex - b.rowIndex);
  briefings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  advisories.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  actionTasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  alerts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  auditLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const latestBatch = batches[0] ?? null;
  const prevBatch = batches[1] ?? null;
  const latestReadings = latestBatch ? readings.filter((r) => r.batchId === latestBatch.id) : [];
  const prevReadings = prevBatch ? readings.filter((r) => r.batchId === prevBatch.id) : [];
  const trajectories = latestBatch ? computeClientTrajectories(latestReadings, prevReadings) : [];
  const outcomeScorecard = latestBatch ? computeClientOutcomeScorecard(trajectories, actionTasks) : [];

  return {
    batches,
    readings,
    trajectories,
    briefings,
    advisories,
    actionTasks,
    alerts,
    alertRecipients,
    outcomeScorecard,
    auditLogs: auditLogs.slice(0, 250),
  };
}

export async function commitBatchTransaction(
  actorRole: UserRole,
  batch: BatchRecord,
  readings: ReadingRecord[]
) {
  await civicDb.transaction('rw', civicDb.batches, civicDb.readings, civicDb.auditLogs, async () => {
    await civicDb.batches.add(batch);
    await civicDb.readings.bulkAdd(readings);
    await appendAuditLog(actorRole, 'BATCH_COMMITTED_INDEXEDDB', 'batch', batch.id, {
      title: batch.title,
      totalRows: batch.totalRows,
      cleanRows: batch.cleanRows,
      unreliableRows: batch.unreliableRows,
      isTestFixture: batch.isTestFixture,
    });
  });
}

export async function reviewReadingTransaction(
  actorRole: UserRole,
  readingId: string,
  updates: {
    pm25?: number | null;
    pm10?: number | null;
    excludeFromStatistics?: boolean;
    reason: string;
  },
  recomputedAqi: { aqi: number | null; category: string; alertLevel: ReadingRecord['alertLevel']; dominantPollutant: string }
) {
  return civicDb.transaction('rw', civicDb.readings, civicDb.batches, civicDb.auditLogs, async () => {
    const r = await civicDb.readings.get(readingId);
    if (!r) throw new Error('Reading row not found in local IndexedDB.');
    const now = new Date().toISOString();
    const next = { ...r, reviewHistory: [...r.reviewHistory] };

    if (updates.pm25 !== undefined && updates.pm25 !== r.pm25) {
      next.reviewHistory.push({
        id: crypto.randomUUID(),
        field: 'pm25',
        oldValue: String(r.pm25),
        newValue: String(updates.pm25),
        reason: sanitizeText(updates.reason),
        actorRole,
        timestamp: now,
      });
      next.pm25 = updates.pm25;
    }
    if (updates.pm10 !== undefined && updates.pm10 !== r.pm10) {
      next.reviewHistory.push({
        id: crypto.randomUUID(),
        field: 'pm10',
        oldValue: String(r.pm10),
        newValue: String(updates.pm10),
        reason: sanitizeText(updates.reason),
        actorRole,
        timestamp: now,
      });
      next.pm10 = updates.pm10;
    }
    if (updates.excludeFromStatistics !== undefined && updates.excludeFromStatistics !== r.excludeFromStatistics) {
      next.reviewHistory.push({
        id: crypto.randomUUID(),
        field: 'excludeFromStatistics',
        oldValue: String(r.excludeFromStatistics),
        newValue: String(updates.excludeFromStatistics),
        reason: sanitizeText(updates.reason),
        actorRole,
        timestamp: now,
      });
      next.excludeFromStatistics = updates.excludeFromStatistics;
    }

    next.calculatedAqi = recomputedAqi.aqi;
    next.aqiCategory = recomputedAqi.category;
    next.alertLevel = recomputedAqi.alertLevel;
    next.dominantPollutant = recomputedAqi.dominantPollutant;

    await civicDb.readings.put(next);

    const batch = await civicDb.batches.get(next.batchId);
    if (batch) {
      const batchReadings = await civicDb.readings.where('batchId').equals(next.batchId).toArray();
      await civicDb.batches.put(recomputeClientBatchStats(batch, batchReadings));
    }

    await appendAuditLog(actorRole, 'READING_REVIEWED', 'reading', next.id, {
      reason: sanitizeText(updates.reason),
      rowIndex: next.rowIndex,
    });
    return next;
  });
}

export async function deleteReadingTransaction(actorRole: UserRole, readingId: string) {
  if (actorRole !== 'EVALUATOR' && actorRole !== 'WARD_OFFICER') {
    throw new Error(`Role ${actorRole} cannot delete sensor rows. Switch to Ward Officer or Evaluator.`);
  }
  await civicDb.transaction('rw', civicDb.readings, civicDb.batches, civicDb.auditLogs, async () => {
    const target = await civicDb.readings.get(readingId);
    if (!target) throw new Error('Reading not found.');
    await civicDb.readings.delete(readingId);
    const batch = await civicDb.batches.get(target.batchId);
    if (batch) {
      const remaining = await civicDb.readings.where('batchId').equals(target.batchId).toArray();
      await civicDb.batches.put(recomputeClientBatchStats(batch, remaining));
    }
    await appendAuditLog(actorRole, 'READING_DELETED', 'reading', readingId, { batchId: target.batchId });
  });
}

export async function saveBriefingAndAlertsTransaction(
  actorRole: UserRole,
  briefing: BriefingRecord,
  proposedAlerts: AlertRecord[]
) {
  await civicDb.transaction('rw', civicDb.batches, civicDb.briefings, civicDb.alerts, civicDb.auditLogs, async () => {
    const batchExists = await civicDb.batches.get(briefing.batchId);
    if (!batchExists) throw new Error('Foreign key check failed: target batch not found.');
    await civicDb.briefings.add(briefing);
    if (proposedAlerts.length > 0) {
      await civicDb.alerts.bulkAdd(proposedAlerts);
    }
    await appendAuditLog(actorRole, 'GEMINI_BRIEFING_SAVED', 'briefing', briefing.id, {
      briefingCode: briefing.briefingCode,
      model: briefing.geminiModel,
      latencyMs: briefing.latencyMs,
      proposedAlerts: proposedAlerts.length,
    });
  });
}

export async function saveAdvisoryTransaction(actorRole: UserRole, advisory: CitizenAdvisoryRecord) {
  await civicDb.transaction('rw', civicDb.briefings, civicDb.advisories, civicDb.auditLogs, async () => {
    const briefExists = await civicDb.briefings.get(advisory.briefingId);
    if (!briefExists) throw new Error('Foreign key check failed: source briefing not found.');
    await civicDb.advisories.add(advisory);
    await appendAuditLog(actorRole, 'CITIZEN_ADVISORY_SAVED', 'advisory', advisory.id, {
      language: advisory.language,
      readingLevel: advisory.readingLevel,
    });
  });
}

export async function createTaskTransaction(
  actorRole: UserRole,
  payload: {
    briefingId: string;
    taskType: TaskType;
    sourceRole: PersonaRole;
    assignedRole: PersonaRole;
    instructedToSubordinate: string;
    locationName: string;
    wardZone: string;
    title: string;
    actionDraftText: string;
    deadline: string;
    citedRows: number[];
    approveImmediately: boolean;
  }
) {
  const canApprove =
    actorRole === 'EVALUATOR' ||
    actorRole === 'WARD_OFFICER' ||
    (actorRole === 'HOUSING_SOCIETY' && payload.assignedRole === 'HOUSING_SOCIETY') ||
    (actorRole === 'SCHOOL_COORDINATOR' && payload.assignedRole === 'SCHOOL_COORDINATOR');

  if (payload.approveImmediately && !canApprove && payload.taskType !== 'CROSS_ROLE_ESCALATION') {
    throw new Error(`Role ${actorRole} cannot approve tasks assigned to ${payload.assignedRole}.`);
  }

  return civicDb.transaction('rw', civicDb.briefings, civicDb.actionTasks, civicDb.auditLogs, async () => {
    const brief = await civicDb.briefings.get(payload.briefingId);
    if (!brief) throw new Error('Foreign key check failed: linked briefing not found.');
    const now = new Date().toISOString();
    const task: ActionTaskRecord = {
      id: crypto.randomUUID(),
      briefingId: payload.briefingId,
      taskType: payload.taskType,
      sourceRole: payload.sourceRole,
      assignedRole: payload.assignedRole,
      instructedToSubordinate: sanitizeText(payload.instructedToSubordinate),
      locationName: sanitizeText(payload.locationName),
      wardZone: sanitizeText(payload.wardZone),
      title: sanitizeText(payload.title),
      actionDraftText: sanitizeText(payload.actionDraftText),
      approvalStatus: payload.approveImmediately ? 'APPROVED' : 'PENDING_APPROVAL',
      approvedBy: payload.approveImmediately ? actorRole : null,
      approvedAt: payload.approveImmediately ? now : null,
      deadline: sanitizeText(payload.deadline),
      status: payload.approveImmediately ? 'DISPATCHED' : 'OPEN',
      citedRows: payload.citedRows,
      completionNotes: '',
      completionEvidence: '',
      observedPostTaskAqiDelta: null,
      createdBy: actorRole,
      createdAt: now,
      updatedAt: now,
    };
    await civicDb.actionTasks.add(task);
    await appendAuditLog(actorRole, 'TASK_CREATED', 'action_task', task.id, {
      taskType: task.taskType,
      assignedRole: task.assignedRole,
      approvalStatus: task.approvalStatus,
    });
    return task;
  });
}

export async function updateTaskTransaction(
  actorRole: UserRole,
  taskId: string,
  updates: {
    status?: TaskStatus;
    approvalStatus?: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
    actionDraftText?: string;
    completionNotes?: string;
    completionEvidence?: string;
  }
) {
  return civicDb.transaction('rw', civicDb.actionTasks, civicDb.auditLogs, async () => {
    const t = await civicDb.actionTasks.get(taskId);
    if (!t) throw new Error('Task not found.');
    const canApprove = actorRole === 'EVALUATOR' || actorRole === 'WARD_OFFICER' || actorRole === t.assignedRole;
    if ((updates.approvalStatus === 'APPROVED' || updates.approvalStatus === 'REJECTED') && !canApprove) {
      throw new Error(`Role ${actorRole} cannot approve or reject a task owned by ${t.assignedRole}.`);
    }

    const now = new Date().toISOString();
    const next = { ...t, updatedAt: now };
    if (updates.actionDraftText !== undefined) next.actionDraftText = sanitizeText(updates.actionDraftText);
    if (updates.approvalStatus !== undefined) {
      next.approvalStatus = updates.approvalStatus;
      if (updates.approvalStatus === 'APPROVED') {
        next.approvedBy = actorRole;
        next.approvedAt = now;
        if (next.status === 'OPEN') next.status = 'DISPATCHED';
      } else if (updates.approvalStatus === 'REJECTED') {
        next.status = 'REJECTED';
      }
    }
    if (updates.status !== undefined) next.status = updates.status;
    if (updates.completionNotes !== undefined) next.completionNotes = sanitizeText(updates.completionNotes);
    if (updates.completionEvidence !== undefined) next.completionEvidence = sanitizeText(updates.completionEvidence);

    await civicDb.actionTasks.put(next);
    await appendAuditLog(actorRole, 'TASK_UPDATED', 'action_task', next.id, {
      status: next.status,
      approvalStatus: next.approvalStatus,
    });
    return next;
  });
}

export async function deleteTaskTransaction(actorRole: UserRole, taskId: string) {
  await civicDb.transaction('rw', civicDb.actionTasks, civicDb.auditLogs, async () => {
    const t = await civicDb.actionTasks.get(taskId);
    if (!t) throw new Error('Task not found.');
    if (actorRole !== 'EVALUATOR' && actorRole !== 'WARD_OFFICER' && t.createdBy !== actorRole) {
      throw new Error(`Role ${actorRole} cannot delete this task.`);
    }
    await civicDb.actionTasks.delete(taskId);
    await appendAuditLog(actorRole, 'TASK_DELETED', 'action_task', taskId, {});
  });
}

export async function alertActionTransaction(
  actorRole: UserRole,
  alertId: string,
  action: 'APPROVE_AND_PREPARE' | 'REQUEST_VERIFICATION' | 'REJECT' | 'RESOLVE' | 'ACKNOWLEDGE'
) {
  return civicDb.transaction('rw', civicDb.alerts, civicDb.alertRecipients, civicDb.auditLogs, async () => {
    const alert = await civicDb.alerts.get(alertId);
    if (!alert) throw new Error('Alert not found.');

    const isHead =
      actorRole === 'EVALUATOR' ||
      actorRole === 'WARD_OFFICER' ||
      (actorRole === 'HOUSING_SOCIETY' && alert.targetScope === 'AFFECTED_RWA_ONLY') ||
      (actorRole === 'SCHOOL_COORDINATOR' && alert.targetScope === 'AFFECTED_SCHOOL_ONLY');

    if (action !== 'ACKNOWLEDGE' && !isHead) {
      throw new Error(`Role ${actorRole} cannot approve alerts scoped to ${alert.targetScope}.`);
    }

    const now = new Date().toISOString();
    const next = { ...alert };

    if (action === 'APPROVE_AND_PREPARE') {
      next.status = 'APPROVED_PREPARED';
      next.approvedBy = actorRole;
      next.approvedAt = now;
      next.preparedAt = now;

      const recipientGroup =
        next.targetScope === 'AFFECTED_SCHOOL_ONLY'
          ? `${next.targetLocation} Parents, Teachers & Campus Nurse`
          : next.targetScope === 'AFFECTED_RWA_ONLY'
          ? `${next.targetLocation} Residents, RWA Guards & Seniors`
          : next.targetScope === 'VERIFICATION_HEAD_ONLY'
          ? `${next.targetZone} Monitoring Head Only`
          : `${next.targetZone} Ward Field Team & Affected Zone Subscribers`;

      const estimatedRecipientCount =
        next.targetScope === 'VERIFICATION_HEAD_ONLY'
          ? 1
          : next.targetScope === 'AFFECTED_SCHOOL_ONLY'
          ? 42
          : next.targetScope === 'AFFECTED_RWA_ONLY'
          ? 65
          : 18;

      next.recipientCount = estimatedRecipientCount;
      await civicDb.alertRecipients.add({
        id: crypto.randomUUID(),
        alertId: next.id,
        recipientGroup,
        wardZone: next.targetZone,
        estimatedRecipientCount,
        deliveryState: 'PREPARED_FOR_RECIPIENTS',
        acknowledgedCount: 0,
        preparedAt: now,
      });
    } else if (action === 'REQUEST_VERIFICATION') {
      next.severity = 'VERIFICATION_REQUIRED';
      next.targetScope = 'VERIFICATION_HEAD_ONLY';
      next.status = 'PENDING_APPROVAL';
    } else if (action === 'REJECT') {
      next.status = 'REJECTED';
    } else if (action === 'RESOLVE') {
      next.status = 'RESOLVED';
      next.resolvedAt = now;
    } else if (action === 'ACKNOWLEDGE') {
      next.acknowledgedCount += 1;
      const recipients = await civicDb.alertRecipients.where('alertId').equals(next.id).toArray();
      if (recipients[0]) {
        await civicDb.alertRecipients.put({
          ...recipients[0],
          acknowledgedCount: recipients[0].acknowledgedCount + 1,
        });
      }
    }

    await civicDb.alerts.put(next);
    await appendAuditLog(actorRole, `ALERT_${action}`, 'alert', next.id, {
      targetZone: next.targetZone,
      targetScope: next.targetScope,
      status: next.status,
    });
    return next;
  });
}

export async function recordAuditEvent(
  actorRole: UserRole,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown> = {}
) {
  await civicDb.transaction('rw', civicDb.auditLogs, async () => {
    await appendAuditLog(actorRole, action, entityType, entityId, details);
  });
}

export async function wipeLocalWorkspaceTransaction(actorRole: UserRole) {
  await civicDb.transaction(
    'rw',
    [
      civicDb.batches,
      civicDb.readings,
      civicDb.briefings,
      civicDb.advisories,
      civicDb.actionTasks,
      civicDb.alerts,
      civicDb.alertRecipients,
      civicDb.auditLogs,
    ],
    async () => {
      await Promise.all([
        civicDb.batches.clear(),
        civicDb.readings.clear(),
        civicDb.briefings.clear(),
        civicDb.advisories.clear(),
        civicDb.actionTasks.clear(),
        civicDb.alerts.clear(),
        civicDb.alertRecipients.clear(),
      ]);
      await appendAuditLog(actorRole, 'LOCAL_WORKSPACE_WIPED', 'indexeddb', 'all_operational_tables', {});
    }
  );
}

import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Plus,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import type { AppRoute } from './Layout';
import { CitationChip } from './StatusBadge';
import { createTaskTransaction, deleteTaskTransaction, updateTaskTransaction } from '../db/civicDexie';
import { defaultPersonaForRole } from '../utils/civicMath';
import type { ActionTaskRecord, PersonaRole, TaskStatus, TaskType } from '../types/civic';

export const ActionBoard: React.FC<{ onNavigate: (r: AppRoute) => void }> = ({ onNavigate }) => {
  const { workspace, activeRole, roleProfile, refreshWorkspace, notify } = useStudio();
  const tasks = workspace?.actionTasks ?? [];
  const latestBatch = workspace?.batches[0] ?? null;
  const briefings = workspace?.briefings ?? [];

  const [filterType, setFilterType] = useState<'ALL' | TaskType>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | TaskStatus>('ALL');
  const [filterRole, setFilterRole] = useState<'ALL' | PersonaRole>('ALL');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editingTask, setEditingTask] = useState<ActionTaskRecord | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionEvidence, setCompletionEvidence] = useState('');
  const [nextStatus, setNextStatus] = useState<TaskStatus>('COMPLETED');

  // Custom Order Form
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customBriefingId, setCustomBriefingId] = useState(briefings[0]?.id ?? '');
  const [customType, setCustomType] = useState<TaskType>('URGENT_0_4H');
  const [customAssignedRole, setCustomAssignedRole] = useState<PersonaRole>('WARD_OFFICER');
  const [customSubordinate, setCustomSubordinate] = useState('Junior Sanitary Inspector');
  const [customLocation, setCustomLocation] = useState('');
  const [customWard, setCustomWard] = useState(roleProfile?.wardZone ?? 'Ward 14');
  const [customTitle, setCustomTitle] = useState('');
  const [customDraftText, setCustomDraftText] = useState('');
  const [customDeadline, setCustomDeadline] = useState('Within 4 hours');

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterType !== 'ALL' && t.taskType !== filterType) return false;
      if (filterStatus !== 'ALL' && t.status !== filterStatus) return false;
      if (filterRole !== 'ALL' && t.assignedRole !== filterRole) return false;
      return true;
    });
  }, [tasks, filterType, filterStatus, filterRole]);

  const updateTask = async (
    taskId: string,
    payload: {
      approvalStatus?: 'APPROVED' | 'REJECTED';
      status?: TaskStatus;
      completionNotes?: string;
      completionEvidence?: string;
    }
  ) => {
    if (!activeRole) return;
    setBusyId(taskId);
    try {
      const updated = await updateTaskTransaction(activeRole, taskId, payload);
      await refreshWorkspace();
      setEditingTask(null);
      notify('success', `Action updated (${updated.status}).`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to update action.');
    } finally {
      setBusyId(null);
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!activeRole) return;
    setBusyId(taskId);
    try {
      await deleteTaskTransaction(activeRole, taskId);
      await refreshWorkspace();
      notify('success', 'Action removed.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to delete action.');
    } finally {
      setBusyId(null);
    }
  };

  const createCustomOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRole) return;
    const targetBriefId = customBriefingId || briefings[0]?.id;
    if (!targetBriefId) {
      notify('error', 'Generate a briefing first to link orders to verified evidence.');
      return;
    }
    setBusyId('custom_new');
    try {
      await createTaskTransaction(activeRole, {
        briefingId: targetBriefId,
        taskType: customType,
        sourceRole: defaultPersonaForRole(activeRole),
        assignedRole: customAssignedRole,
        instructedToSubordinate: customSubordinate,
        locationName: customLocation,
        wardZone: customWard,
        title: customTitle,
        actionDraftText: customDraftText,
        deadline: customDeadline,
        citedRows: [1],
        approveImmediately: false,
      });
      await refreshWorkspace();
      setShowCustomForm(false);
      setCustomTitle('');
      setCustomDraftText('');
      notify('success', 'Action queued for approval.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to create action.');
    } finally {
      setBusyId(null);
    }
  };

  const startCompletionEdit = (t: ActionTaskRecord) => {
    setEditingTask(t);
    setCompletionNotes(t.completionNotes || '');
    setCompletionEvidence(t.completionEvidence || '');
    setNextStatus('COMPLETED');
  };

  const priorityLabel = (t: ActionTaskRecord) => {
    if (t.taskType === 'URGENT_0_4H') return 'Urgent (0–4h)';
    if (t.taskType === 'CROSS_ROLE_ESCALATION') return 'Escalation';
    return 'Preventive (7–30d)';
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Action Board</h1>
        <button
          type="button"
          onClick={() => setShowCustomForm((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Add Action</span>
        </button>
      </div>

      {/* Filters */}
      <section className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center gap-2.5 text-xs">
        <select
          aria-label="Filter by Priority"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as 'ALL' | TaskType)}
          className="border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
        >
          <option value="ALL">All Priorities</option>
          <option value="URGENT_0_4H">Urgent (0–4h)</option>
          <option value="PREVENTIVE_7_30D">Preventive (7–30d)</option>
          <option value="CROSS_ROLE_ESCALATION">Escalations</option>
        </select>

        <select
          aria-label="Filter by Status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as 'ALL' | TaskStatus)}
          className="border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
        >
          <option value="ALL">All Statuses</option>
          <option value="OPEN">Pending Approval</option>
          <option value="DISPATCHED">Dispatched</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="REJECTED">Rejected</option>
        </select>

        <select
          aria-label="Filter by Role"
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value as 'ALL' | PersonaRole)}
          className="border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
        >
          <option value="ALL">All Roles</option>
          <option value="WARD_OFFICER">Ward Officer</option>
          <option value="HOUSING_SOCIETY">Housing Society</option>
          <option value="SCHOOL_COORDINATOR">School Coordinator</option>
        </select>
      </section>

      {showCustomForm && (
        <form onSubmit={(e) => void createCustomOrder(e)} className="bg-white border border-blue-200 rounded-xl p-5 space-y-3 text-xs">
          <h2 className="text-sm font-bold text-slate-900">New Action Order</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Briefing</label>
              <select
                value={customBriefingId || briefings[0]?.id || ''}
                onChange={(e) => setCustomBriefingId(e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5"
              >
                {briefings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.briefingCode}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Priority</label>
              <select
                value={customType}
                onChange={(e) => setCustomType(e.target.value as TaskType)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5"
              >
                <option value="URGENT_0_4H">Urgent (0–4h)</option>
                <option value="PREVENTIVE_7_30D">Preventive (7–30d)</option>
                <option value="CROSS_ROLE_ESCALATION">Escalation</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Target Role</label>
              <select
                value={customAssignedRole}
                onChange={(e) => setCustomAssignedRole(e.target.value as PersonaRole)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5"
              >
                <option value="WARD_OFFICER">Ward Officer</option>
                <option value="HOUSING_SOCIETY">Housing Society</option>
                <option value="SCHOOL_COORDINATOR">School Coordinator</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Owner / Assignee</label>
              <input
                type="text"
                required
                value={customSubordinate}
                onChange={(e) => setCustomSubordinate(e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Location</label>
              <input
                type="text"
                required
                placeholder="e.g., Ward 14 Junction"
                value={customLocation}
                onChange={(e) => setCustomLocation(e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Deadline</label>
              <input
                type="text"
                required
                value={customDeadline}
                onChange={(e) => setCustomDeadline(e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Action Title</label>
              <input
                type="text"
                required
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Ward / Zone</label>
              <input
                type="text"
                required
                value={customWard}
                onChange={(e) => setCustomWard(e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Instruction</label>
            <textarea
              required
              rows={2}
              value={customDraftText}
              onChange={(e) => setCustomDraftText(e.target.value)}
              className="w-full border border-slate-300 rounded px-2.5 py-1.5"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busyId === 'custom_new'}
              className="px-3.5 py-1.5 bg-blue-700 text-white font-semibold rounded-lg hover:bg-blue-800"
            >
              Save Action Draft
            </button>
            <button
              type="button"
              onClick={() => setShowCustomForm(false)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Clean Operational Table */}
      {filteredTasks.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
          <ClipboardCheck className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
          <div className="text-sm font-semibold text-slate-900">No Actions Queued</div>
          <p className="text-xs text-slate-600">
            Approve action drafts from Briefing Studio or Radar to track execution here.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('/briefing-studio')}
            className="px-3.5 py-1.5 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800"
          >
            Open Briefing Studio
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Priority</th>
                  <th className="px-3 py-2.5 font-semibold">Action</th>
                  <th className="px-3 py-2.5 font-semibold">Owner</th>
                  <th className="px-3 py-2.5 font-semibold">Location</th>
                  <th className="px-3 py-2.5 font-semibold">Deadline</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Evidence</th>
                  <th className="px-3 py-2.5 font-semibold">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredTasks.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 align-top">
                    <td className="px-3 py-3 whitespace-nowrap font-medium text-slate-900">
                      {priorityLabel(t)}
                    </td>
                    <td className="px-3 py-3 min-w-[220px]">
                      <div className="font-semibold text-slate-900">{t.title}</div>
                      <div className="text-slate-600 mt-0.5">{t.actionDraftText}</div>
                      {(t.completionNotes || t.completionEvidence) && (
                        <div className="mt-1.5 text-emerald-900 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                          Proof: {t.completionNotes || '—'} ({t.completionEvidence || '—'})
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="font-medium text-slate-900">{t.instructedToSubordinate}</div>
                      <div className="text-slate-500">{t.assignedRole.replace(/_/g, ' ')}</div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="text-slate-900">{t.locationName}</div>
                      <div className="text-slate-500">{t.wardZone}</div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-700">{t.deadline}</td>
                    <td className="px-3 py-3 whitespace-nowrap font-mono font-semibold text-slate-900">
                      {t.status}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {latestBatch &&
                          t.citedRows.map((rn) => (
                            <CitationChip key={rn} batchId={latestBatch.id} rowIndex={rn} />
                          ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {t.approvalStatus === 'PENDING_APPROVAL' && (
                          <>
                            <button
                              type="button"
                              disabled={busyId === t.id}
                              onClick={() => void updateTask(t.id, { approvalStatus: 'APPROVED', status: 'DISPATCHED' })}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-700 text-white rounded font-semibold hover:bg-blue-800"
                            >
                              <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                              <span>Approve</span>
                            </button>
                            <button
                              type="button"
                              disabled={busyId === t.id}
                              onClick={() => void updateTask(t.id, { approvalStatus: 'REJECTED', status: 'REJECTED' })}
                              className="inline-flex items-center gap-1 px-2 py-1 border border-slate-300 text-slate-700 rounded hover:bg-slate-50"
                            >
                              <XCircle className="w-3 h-3" aria-hidden="true" />
                              <span>Reject</span>
                            </button>
                          </>
                        )}
                        {t.status !== 'COMPLETED' && t.status !== 'REJECTED' && (
                          <>
                            {t.status === 'DISPATCHED' && (
                              <button
                                type="button"
                                disabled={busyId === t.id}
                                onClick={() => void updateTask(t.id, { status: 'IN_PROGRESS' })}
                                className="inline-flex items-center gap-1 px-2 py-1 border border-amber-300 bg-amber-50 text-amber-900 rounded font-medium"
                              >
                                <Send className="w-3 h-3" aria-hidden="true" />
                                <span>Start</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => startCompletionEdit(t)}
                              className="inline-flex items-center gap-1 px-2 py-1 border border-emerald-300 bg-emerald-50 text-emerald-900 rounded font-semibold"
                            >
                              <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                              <span>Complete</span>
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          disabled={busyId === t.id}
                          onClick={() => void deleteTask(t.id)}
                          aria-label={`Delete ${t.title}`}
                          className="p-1 text-red-700 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Completion Proof Modal */}
      {editingTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="complete-task-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl text-xs">
            <h3 id="complete-task-title" className="text-base font-semibold text-slate-900">
              Update Action · {editingTask.title}
            </h3>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Status</label>
              <select
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value as TaskStatus)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5"
              >
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="COMPLETED">COMPLETED</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Completion Notes</label>
              <input
                type="text"
                placeholder="e.g., Wet sweeping done, debris covered"
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Proof Reference</label>
              <input
                type="text"
                placeholder="e.g., Field Log #412 / Inspection photo timestamp"
                value={completionEvidence}
                onChange={(e) => setCompletionEvidence(e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="px-3 py-1.5 border border-slate-300 rounded text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === editingTask.id}
                onClick={() =>
                  void updateTask(editingTask.id, {
                    status: nextStatus,
                    completionNotes,
                    completionEvidence,
                  })
                }
                className="px-4 py-1.5 bg-emerald-700 text-white rounded font-semibold hover:bg-emerald-800"
              >
                Save Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

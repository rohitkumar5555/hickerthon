import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  clearOperatingRole,
  getSessionRoleState,
  loadFullWorkspaceFromDexie,
  recordAuditEvent,
  selectOperatingRole,
  setActivePersonaLens,
} from '../db/civicDexie';
import type {
  ActionTaskRecord,
  AlertRecipientRecord,
  AlertRecord,
  AreaTrajectoryRecord,
  AuditLogRecord,
  BatchRecord,
  BriefingRecord,
  CitizenAdvisoryRecord,
  OperatingRoleProfile,
  OutcomeComparisonEntry,
  PersonaRole,
  ReadingRecord,
  UserRole,
} from '../types/civic';
import { getRoleProfile } from '../utils/civicMath';

export interface FixtureSummary {
  id: string;
  label: string;
  disclaimer: string;
  title: string;
  sourceType: string;
  description: string;
}

export interface WorkspaceState {
  batches: BatchRecord[];
  readings: ReadingRecord[];
  trajectories: AreaTrajectoryRecord[];
  briefings: BriefingRecord[];
  advisories: CitizenAdvisoryRecord[];
  actionTasks: ActionTaskRecord[];
  alerts: AlertRecord[];
  alertRecipients: AlertRecipientRecord[];
  outcomeScorecard: OutcomeComparisonEntry[];
  auditLogs: AuditLogRecord[];
  fixtures: FixtureSummary[];
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface StudioContextValue {
  activeRole: UserRole | null;
  roleProfile: OperatingRoleProfile | null;
  activePersona: PersonaRole;
  bootLoading: boolean;
  workspace: WorkspaceState | null;
  workspaceLoading: boolean;
  selectedEvidenceRow: { batchId: string; rowIndex: number } | null;
  openEvidenceRow: (batchId: string, rowIndex: number) => void;
  closeEvidenceRow: () => void;
  toast: ToastMessage | null;
  notify: (type: ToastMessage['type'], message: string) => void;
  clearToast: () => void;
  refreshWorkspace: () => Promise<void>;
  chooseRole: (role: UserRole, isSwitch?: boolean) => Promise<void>;
  exitRoleSession: () => Promise<void>;
  switchPersona: (persona: PersonaRole) => Promise<void>;
  logLocalAudit: (action: string, entityType: string, entityId: string, details?: Record<string, unknown>) => Promise<void>;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export const StudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeRole, setActiveRole] = useState<UserRole | null>(null);
  const [activePersona, setActivePersona] = useState<PersonaRole>('WARD_OFFICER');
  const [bootLoading, setBootLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [fixtures, setFixtures] = useState<FixtureSummary[]>([]);
  const [selectedEvidenceRow, setSelectedEvidenceRow] = useState<{ batchId: string; rowIndex: number } | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const notify = useCallback((type: ToastMessage['type'], message: string) => {
    setToast({ id: String(Date.now()), type, message });
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  const refreshWorkspace = useCallback(async () => {
    setWorkspaceLoading(true);
    try {
      const localData = await loadFullWorkspaceFromDexie();
      let currentFixtures = fixtures;
      if (currentFixtures.length === 0) {
        try {
          const fRes = await fetch('/api/ingest/fixtures');
          if (fRes.ok) {
            const fJson = await fRes.json();
            currentFixtures = fJson.fixtures ?? [];
            setFixtures(currentFixtures);
          }
        } catch {
          // Keep empty fixtures if server unreachable transiently
        }
      }
      setWorkspace({
        ...localData,
        fixtures: currentFixtures,
      });
    } finally {
      setWorkspaceLoading(false);
    }
  }, [fixtures]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const state = await getSessionRoleState();
        if (!active) return;
        setActiveRole(state.activeRole);
        setActivePersona(state.activePersona);
        await refreshWorkspace();
      } finally {
        if (active) setBootLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshWorkspace]);

  const chooseRole = useCallback(
    async (role: UserRole, isSwitch = false) => {
      const state = await selectOperatingRole(role, isSwitch ? 'ROLE_SWITCHED' : 'ROLE_SELECTED');
      setActiveRole(state.activeRole);
      setActivePersona(state.activePersona);
      await refreshWorkspace();
      notify(
        'success',
        `${isSwitch ? 'Switched role to' : 'Entered workspace as'} ${getRoleProfile(role).displayName}.`
      );
    },
    [notify, refreshWorkspace]
  );

  const exitRoleSession = useCallback(async () => {
    if (activeRole) {
      await clearOperatingRole(activeRole);
    }
    setActiveRole(null);
    setSelectedEvidenceRow(null);
    await refreshWorkspace();
    notify('info', 'Returned to role selector. Your workspace remains saved.');
  }, [activeRole, notify, refreshWorkspace]);

  const switchPersona = useCallback(
    async (persona: PersonaRole) => {
      if (!activeRole) return;
      await setActivePersonaLens(activeRole, persona);
      setActivePersona(persona);
      await refreshWorkspace();
      notify('info', `Active briefing lens switched to ${persona.replace(/_/g, ' ')}.`);
    },
    [activeRole, notify, refreshWorkspace]
  );

  const logLocalAudit = useCallback(
    async (action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) => {
      if (!activeRole) return;
      await recordAuditEvent(activeRole, action, entityType, entityId, details);
      await refreshWorkspace();
    },
    [activeRole, refreshWorkspace]
  );

  const openEvidenceRow = useCallback((batchId: string, rowIndex: number) => {
    setSelectedEvidenceRow({ batchId, rowIndex });
  }, []);

  const closeEvidenceRow = useCallback(() => {
    setSelectedEvidenceRow(null);
  }, []);

  const roleProfile = activeRole ? getRoleProfile(activeRole) : null;

  return (
    <StudioContext.Provider
      value={{
        activeRole,
        roleProfile,
        activePersona,
        bootLoading,
        workspace,
        workspaceLoading,
        selectedEvidenceRow,
        openEvidenceRow,
        closeEvidenceRow,
        toast,
        notify,
        clearToast,
        refreshWorkspace,
        chooseRole,
        exitRoleSession,
        switchPersona,
        logLocalAudit,
      }}
    >
      {children}
    </StudioContext.Provider>
  );
};

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio must be used inside StudioProvider');
  return ctx;
}

import { z } from 'zod';

export type UserRole =
  | 'EVALUATOR'
  | 'WARD_OFFICER'
  | 'HOUSING_SOCIETY'
  | 'SCHOOL_COORDINATOR';

export type PersonaRole =
  | 'WARD_OFFICER'
  | 'HOUSING_SOCIETY'
  | 'SCHOOL_COORDINATOR';

export type VulnerableZoneType =
  | 'SCHOOL_ZONE'
  | 'SENIOR_PARK_HOSPITAL'
  | 'RESIDENTIAL_RWA'
  | 'COMMERCIAL_TRAFFIC';

export type ReliabilityStatus =
  | 'CLEAN'
  | 'UNIT_CONVERTED'
  | 'MISSING_DATA_GAP'
  | 'NON_NUMERIC_CELL'
  | 'NEGATIVE_VALUE_INVALID'
  | 'DUPLICATE_ROW'
  | 'OUTLIER_REQUIRES_VERIFICATION'
  | 'INCONSISTENT_MEASUREMENT_PM25_GT_PM10'
  | 'SHARP_DROP_REQUIRES_VERIFICATION'
  | 'CONVERSION_UNAVAILABLE';

export type AlertLevel =
  | 'GREEN_SAFE'
  | 'YELLOW_WATCH'
  | 'ORANGE_WARNING'
  | 'RED_EMERGENCY_ZONE'
  | 'AQI_UNAVAILABLE';

export type TaskType =
  | 'URGENT_0_4H'
  | 'PREVENTIVE_7_30D'
  | 'CROSS_ROLE_ESCALATION';

export type TaskStatus =
  | 'OPEN'
  | 'DISPATCHED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'REJECTED';

export type ApprovalStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED';

export type AdvisoryLanguage =
  | 'English'
  | 'Hindi (हिन्दी)'
  | 'Hinglish'
  | 'Marathi (मराठी)'
  | 'Tamil (தமிழ்)'
  | 'Bengali (বাংলা)';

export type ReadingLevel =
  | 'SIMPLE_PUBLIC_GRADE_5'
  | 'CHILD_FRIENDLY_SCHOOL_STORY'
  | 'DETAILED_HEALTH_CIVIC';

export interface OperatingRoleProfile {
  role: UserRole;
  displayName: string;
  organizationName: string;
  wardZone: string;
  defaultPersona: PersonaRole;
  description: string;
}

export interface BatchRecord {
  id: string;
  title: string;
  sourceType: 'PASTE_TEXT' | 'CSV' | 'TSV' | 'JSON' | 'XLSX' | 'TEST_FIXTURE';
  storagePath: string;
  storageProvider: 'INDEXEDDB_DEXIE' | 'LOCAL_FILE_STORE' | 'INLINE_TEXT';
  rawInputText: string;
  totalRows: number;
  cleanRows: number;
  convertedRows: number;
  missingRows: number;
  unreliableRows: number;
  duplicateRows: number;
  excludedRows: number;
  completenessPercent: number;
  safestOutdoorWindow: string;
  peakDangerWindow: string;
  windowVentilationAdvice: string;
  isTestFixture: boolean;
  fixtureLabel?: string;
  createdBy: string;
  createdAt: string;
}

export interface ReadingReviewHistoryEntry {
  id: string;
  field: string;
  oldValue: string;
  newValue: string;
  reason: string;
  actorRole: UserRole;
  timestamp: string;
}

export interface ReadingRecord {
  id: string;
  batchId: string;
  rowIndex: number;
  exactRawCells: Record<string, string>;
  locationName: string;
  wardZone: string;
  vulnerableZoneType: VulnerableZoneType;
  latitude: number | null;
  longitude: number | null;
  coordinateConfidence: 'IMPORTED_EXACT' | 'UNVERIFIED_MISSING';
  recordedAt: string | null;
  rawDateStr: string;
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
  o3: number | null;
  rawValuesAndUnits: Record<string, string>;
  conversionFormulas: string[];
  calculatedAqi: number | null;
  aqiCategory: string;
  alertLevel: AlertLevel;
  dominantPollutant: string;
  pm25Pm10Ratio: number | null;
  possibleSourcePattern: string;
  contraindicatedWarning: string | null;
  flags: string[];
  reliabilityStatus: ReliabilityStatus;
  excludeFromStatistics: boolean;
  reviewHistory: ReadingReviewHistoryEntry[];
  createdAt: string;
}

export interface AreaTrajectoryRecord {
  id: string;
  batchId: string;
  locationName: string;
  wardZone: string;
  vulnerableZoneType: VulnerableZoneType;
  vulnerablePriorityWeight: number;
  previousAqi: number | null;
  currentAqi: number | null;
  aqiDelta: number | null;
  rateOfChangePerHr: number | null;
  shortTermProjection24h: number | null;
  projectionConfidence: 'HIGH' | 'MODERATE' | 'LOW_INSUFFICIENT_HISTORY';
  projectionNote: string;
  forecastTrend: 'RISING_TO_RED_ALERT' | 'WORSENING' | 'STABLE' | 'IMPROVING' | 'INSUFFICIENT_DATA';
  isRedZoneNow: boolean;
  approachingRedZoneAlert: boolean;
  earlyWarningAlert: string | null;
  dataLimitations: string[];
  citedRowNumbers: number[];
}

export interface HotspotFinding {
  location: string;
  wardZone: string;
  aqi: number | null;
  dominantPollutant: string;
  possibleSourcePattern: string;
  isExternalSpilloverRisk: boolean;
  summary: string;
  citedRowNumbers: number[];
}

export interface TraceableActionItem {
  title: string;
  rationale: string;
  targetLocation: string;
  timeframe: string;
  citedRowNumbers: number[];
}

export interface GuardrailItem {
  doNotAction: string;
  scientificReason: string;
  targetLocation: string;
  citedRowNumbers: number[];
}

export interface OfficialActionDraft {
  instructedToSubordinate: string;
  targetLocation: string;
  draftInstructionText: string;
  deadline: string;
  taskType: TaskType;
  citedRowNumbers: number[];
}

export interface CrossRoleEscalationDraft {
  fromPersona: PersonaRole;
  toPersona: PersonaRole;
  targetLocation: string;
  issueSummary: string;
  requestedIntervention: string;
  citedRowNumbers: number[];
}

export interface PastPresentProjectionEntry {
  locationName: string;
  wardZone: string;
  previousState: string;
  currentState: string;
  shortTermProjection: string;
  vulnerableGroupNote: string;
  citedRowNumbers: number[];
}

export interface BriefingComparison {
  previousBriefId: string | null;
  previousBriefCode: string | null;
  overallAqiDelta: number | null;
  newHotspots: string[];
  resolvedHotspots: string[];
  pollutantShift: string;
  observedTaskOutcomeNotes: string[];
  narrative: string;
}

export interface BriefingRecord {
  id: string;
  briefingCode: string;
  batchId: string;
  previousBriefingId: string | null;
  personaRole: PersonaRole;
  plainLanguageSummary: string;
  observedFacts: { fact: string; citedRowNumbers: number[] }[];
  hotspots: HotspotFinding[];
  pastPresentProjectionMatrix: PastPresentProjectionEntry[];
  immediateActions0To4Hours: TraceableActionItem[];
  doNotDoGuardrails: GuardrailItem[];
  futurePreventiveRoadmap7To30Days: TraceableActionItem[];
  actionDrafts: OfficialActionDraft[];
  crossRoleEscalations: CrossRoleEscalationDraft[];
  dataGapReport: { issue: string; severity: string; citedRowNumbers: number[] }[];
  comparisonWithPrevious: BriefingComparison;
  internalBriefingMarkdown: string;
  allCitedRows: number[];
  citationValidationWarnings: string[];
  geminiModel: string;
  latencyMs: number;
  requestId: string;
  sanitizedPromptPayload: string;
  createdBy: string;
  createdAt: string;
}

export interface CitizenAdvisoryRecord {
  id: string;
  briefingId: string;
  language: AdvisoryLanguage;
  readingLevel: ReadingLevel;
  headline: string;
  currentSituation: string;
  pastPresentProjectionSummary: string;
  outdoorAndWindowGuidance: string;
  childrenCareSection: string;
  olderAdultsCareSection: string;
  sensitiveGroupsCareSection: string;
  dosAndDonts: { dos: string[]; donts: string[] };
  whatsappReadyText: string;
  disclaimer: string;
  geminiModel: string;
  latencyMs: number;
  createdBy: string;
  createdAt: string;
}

export interface ActionTaskRecord {
  id: string;
  briefingId: string;
  taskType: TaskType;
  sourceRole: PersonaRole;
  assignedRole: PersonaRole;
  instructedToSubordinate: string;
  locationName: string;
  wardZone: string;
  title: string;
  actionDraftText: string;
  approvalStatus: ApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  deadline: string;
  status: TaskStatus;
  citedRows: number[];
  completionNotes: string;
  completionEvidence: string;
  observedPostTaskAqiDelta: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertRecipientRecord {
  id: string;
  alertId: string;
  recipientGroup: string;
  wardZone: string;
  estimatedRecipientCount: number;
  deliveryState: 'PREPARED_FOR_RECIPIENTS' | 'NOT_PREPARED';
  acknowledgedCount: number;
  preparedAt: string;
}

export interface AlertRecord {
  id: string;
  briefingId: string;
  targetScope: 'AFFECTED_WARD_ONLY' | 'AFFECTED_RWA_ONLY' | 'AFFECTED_SCHOOL_ONLY' | 'VERIFICATION_HEAD_ONLY';
  targetZone: string;
  targetLocation: string;
  severity: 'WATCH' | 'WARNING' | 'RED_ZONE' | 'VERIFICATION_REQUIRED';
  status: 'PENDING_APPROVAL' | 'APPROVED_PREPARED' | 'REJECTED' | 'RESOLVED';
  headline: string;
  currentSituationText: string;
  recommendedActionText: string;
  evidenceRows: number[];
  confidenceLabel: string;
  approvedBy: string | null;
  approvedAt: string | null;
  preparedAt: string | null;
  nextReviewAt: string;
  resolvedAt: string | null;
  recipientCount: number;
  acknowledgedCount: number;
  createdBy: string;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface ResourceAllocationStop {
  priorityRank: number;
  locationName: string;
  wardZone: string;
  vulnerableZoneType: VulnerableZoneType;
  currentAqi: number | null;
  projection24h: number | null;
  priorityScore: number;
  assignedResourceType: 'WATER_SPRINKLER' | 'ENFORCEMENT_SQUAD' | 'TRAFFIC_MARSHAL' | 'PATROL_TEAM';
  unitNumber: number;
  timeSlot: string;
  actionPolicyInstruction: string;
  contraindicationSkipped: string | null;
  citedRows: number[];
}

export interface OutcomeComparisonEntry {
  locationName: string;
  wardZone: string;
  previousAqi: number | null;
  currentAqi: number | null;
  aqiDelta: number | null;
  taskTitle: string;
  taskStatus: TaskStatus;
  outcomeCategory: 'COMPLETED_TASK_AREA' | 'PENDING_TASK_AREA';
  summary: string;
  scientificDisclaimer: string;
}

export interface QATestResult {
  testId: string;
  category: string;
  scenario: string;
  inputSummary: string;
  expected: string;
  actual: string;
  passed: boolean;
  timestamp: string;
}

export interface ColumnMappingConfig {
  location?: string;
  ward?: string;
  timestamp?: string;
  latitude?: string;
  longitude?: string;
  vulnerableZone?: string;
  pm25?: string;
  pm10?: string;
  no2?: string;
  so2?: string;
  co?: string;
  o3?: string;
  unit?: string;
  reportedAqi?: string;
}

// Zod Schemas for Request Validation
export const ParseBatchRequestSchema = z.object({
  title: z.string().min(2).max(200),
  rawText: z.string().min(5).max(500000),
  sourceType: z.enum(['PASTE_TEXT', 'CSV', 'TSV', 'JSON', 'XLSX', 'TEST_FIXTURE']).default('PASTE_TEXT'),
  columnMapping: z.record(z.string(), z.string()).optional(),
  isTestFixture: z.boolean().optional(),
  fixtureLabel: z.string().max(120).optional(),
  batchId: z.string().optional(),
  previousBatchReadings: z.array(z.any()).optional(),
  createdBy: z.string().optional(),
});

export const ResourceOptimizeSchema = z.object({
  activeRole: z.enum(['EVALUATOR', 'WARD_OFFICER', 'HOUSING_SOCIETY', 'SCHOOL_COORDINATOR']).optional(),
  trajectories: z.array(z.any()),
  readings: z.array(z.any()),
  waterSprinklers: z.number().int().min(0).max(50),
  enforcementSquads: z.number().int().min(0).max(50),
  trafficMarshals: z.number().int().min(0).max(50),
  patrolTeams: z.number().int().min(0).max(50),
});

export const GenerateBriefingPayloadSchema = z.object({
  batch: z.any(),
  readings: z.array(z.any()).min(1),
  trajectories: z.array(z.any()),
  previousBrief: z.any().nullable().optional(),
  previousReadings: z.array(z.any()).optional(),
  previousTasks: z.array(z.any()).optional(),
  outcomeScorecard: z.array(z.any()).optional(),
  personaRole: z.enum(['WARD_OFFICER', 'HOUSING_SOCIETY', 'SCHOOL_COORDINATOR']),
  createdBy: z.string().default('local-role-user'),
});

export const GenerateAdvisoryPayloadSchema = z.object({
  briefing: z.any(),
  batch: z.any(),
  language: z.enum([
    'English',
    'Hindi (हिन्दी)',
    'Hinglish',
    'Marathi (मराठी)',
    'Tamil (தமிழ்)',
    'Bengali (বাংলা)',
  ]),
  readingLevel: z.enum([
    'SIMPLE_PUBLIC_GRADE_5',
    'CHILD_FRIENDLY_SCHOOL_STORY',
    'DETAILED_HEALTH_CIVIC',
  ]),
  createdBy: z.string().default('local-role-user'),
});

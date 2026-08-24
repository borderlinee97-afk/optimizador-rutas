import {
  apiRequest,
} from '../../lib/api'

export type WorkPlanStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'ARCHIVED'

export type WorkPlanType =
  | 'ORDINARY'
  | 'EXTRAORDINARY'

export type PharmacyAccessType =
  | 'PERMANENT_ASSIGNMENT'
  | 'TEMPORARY_COVERAGE'
  | 'ALL'
  | 'NONE'

export type TemporaryCoverageStatus =
  | 'ACTIVE'
  | 'SCHEDULED'
  | 'EXPIRED'

export interface TemporaryCoverageInfo {
  id: string

  status:
    TemporaryCoverageStatus

  startDate: string
  endDate: string

  coordinatorId:
    string | null

  coordinatorName?:
    string | null

  titularSupervisorId:
    string | null

  titularSupervisorName:
    string | null

  activeToday: boolean
  scheduled: boolean
}

export interface WorkPlan {
  id: string
  supervisorId: string

  status:
    WorkPlanStatus

  planType:
    WorkPlanType

  periodStart: string
  periodEnd: string

  revisionNumber: number

  createdBy: string
  createdAt: string

  updatedBy:
    string | null

  updatedAt: string

  submittedBy:
    string | null

  submittedAt:
    string | null

  approvedBy:
    string | null

  approvedAt:
    string | null

  rejectedBy:
    string | null

  rejectedAt:
    string | null

  rejectionComment:
    string | null

  archivedBy:
    string | null

  archivedAt:
    string | null
}

export interface WorkPlanSummary
  extends WorkPlan {
  totalItems: number
  pendingItems: number
  inProgressItems: number
  doneItems: number
  skippedItems: number
  cancelledItems: number
}

export interface ApprovalPlanSummary
  extends WorkPlanSummary {
  supervisorName: string

  coordinatorId:
    string | null

  coordinatorName:
    string | null
}

export interface ApprovalSupervisorInfo {
  id: string
  name: string

  coordinatorId:
    string | null

  coordinatorName:
    string | null
}

export interface ApprovalWorkPlanDetail {
  plan:
    WorkPlan

  supervisor:
    ApprovalSupervisorInfo

  items:
    WorkPlanItem[]

  revisions:
    WorkPlanRevision[]

  events:
    WorkPlanEvent[]
}

interface PendingApprovalsResponse {
  pendingCount: number

  plans:
    ApprovalPlanSummary[]
}

interface ApprovalMutationResponse {
  ok: boolean

  plan:
    WorkPlan
}

export interface WorkPlanItem {
  id: string
  planId: string

  pharmacyId:
    string | null

  itemType:
    | 'PHARMACY'
    | 'EXTRA_STOP'

  source:
    | 'PLAN'
    | 'SUPERVISOR_ADHOC'

  name: string

  address:
    string | null

  clues:
    string | null

  region:
    string | null

  project:
    string | null

  state?:
    string | null

  pharmacyStatus?:
    string | null

  lat:
    number | null

  lng:
    number | null

  googlePlaceId?:
    string | null

  activityCategory?:
    string | null

  additionReason?:
    string | null

  estimatedMinutes?:
    number | null

  scheduledDate: string

  scheduledTime:
    string | null

  order: number
  required: boolean

  status:
    | 'PENDING'
    | 'IN_PROGRESS'
    | 'DONE'
    | 'SKIPPED'
    | 'CANCELLED'
    | 'RESCHEDULED'

  addedBy:
    string | null

  addedAt:
    string | null

  updatedBy:
    string | null

  updatedAt:
    string | null

  removedBy:
    string | null

  removedAt:
    string | null

  removalReason:
    string | null

  /**
   * Origen por el que el supervisor tenía
   * acceso a la unidad en la fecha programada.
   */
  accessType:
    PharmacyAccessType

  accessValidForScheduledDate:
    boolean

  permanentAssignmentId:
    string | null

  assignedSupervisorId:
    string | null

  assignedSupervisorName:
    string | null

  temporaryCoverage:
    TemporaryCoverageInfo | null
}

export interface WorkPlanRevision {
  id: string
  planId: string
  revisionNumber: number

  status:
    | 'PENDING_APPROVAL'
    | 'APPROVED'
    | 'REJECTED'

  submittedBy: string
  submittedAt: string

  reviewedBy:
    string | null

  reviewedAt:
    string | null

  reviewComment:
    string | null

  createdAt: string
  updatedAt: string
}

export interface WorkPlanEvent {
  id: string
  planId: string

  entityType:
    | 'PLAN'
    | 'PLAN_ITEM'
    | 'REVISION'
    | 'EXECUTION'

  entityId:
    string | null

  revisionNumber:
    number | null

  eventType: string

  actorId:
    string | null

  actorArea:
    string | null

  actorRole:
    string | null

  previousStatus:
    string | null

  newStatus:
    string | null

  comment:
    string | null

  beforeData:
    | Record<string, unknown>
    | null

  afterData:
    | Record<string, unknown>
    | null

  metadata:
    Record<string, unknown>

  createdAt: string
}

export interface PharmacyCatalogItem {
  id: string
  clues: string
  name: string

  region:
    string | null

  status:
    string | null

  /**
   * Supervisor titular permanente actual.
   */
  assignedSupervisor:
    string | null

  assignedSupervisorId:
    string | null

  activeAssignmentId:
    string | null

  assignedToCurrentSupervisor:
    boolean

  /**
   * Forma por la que el supervisor autenticado
   * puede utilizar la unidad.
   */
  accessType:
    PharmacyAccessType

  accessibleByCoverage:
    boolean

  temporaryCoverage:
    TemporaryCoverageInfo | null

  locationName:
    string | null

  address:
    string | null

  lat:
    number | null

  lng:
    number | null

  state:
    string | null

  project:
    string | null
}

export interface PharmacyCatalogFilters {
  regions: string[]
  projects: string[]
  states: string[]
  statuses: string[]

  scopeMode?:
    'ALL' | 'ASSIGNED_ONLY'
}

export interface CreateWorkPlanPayload {
  periodStart: string
  periodEnd: string

  planType:
    WorkPlanType
}

export interface UpdateWorkPlanPayload {
  periodStart?: string
  periodEnd?: string

  planType?:
    WorkPlanType
}

export interface AddWorkPlanItemPayload {
  pharmacyId: string
  scheduledDate: string

  scheduledTime?:
    string | null

  required?: boolean

  order?:
    number | null
}

export interface UpdateWorkPlanItemPayload {
  pharmacyId?: string
  scheduledDate?: string

  scheduledTime?:
    string | null

  required?: boolean
  order?: number
}

export interface PharmacyCatalogQuery {
  search?: string
  region?: string
  project?: string
  state?: string
  status?: string

  limit?: number
  offset?: number
}

interface WorkPlansResponse {
  plans:
    WorkPlanSummary[]
}

interface WorkPlanMutationResponse {
  ok: boolean

  plan:
    WorkPlan
}

interface WorkPlanSubmitResponse {
  ok: boolean

  plan:
    WorkPlan

  revisionNumber: number
}

interface WorkPlanDetailResponse {
  plan:
    WorkPlan

  items:
    WorkPlanItem[]

  revisions:
    WorkPlanRevision[]

  events:
    WorkPlanEvent[]
}

interface WorkPlanItemMutationResponse {
  ok: boolean

  planStatus:
    WorkPlanStatus

  item:
    WorkPlanItem
}

interface PharmacyCatalogResponse {
  pharmacies:
    PharmacyCatalogItem[]

  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }

  filters: {
    search:
      string | null

    region:
      string | null

    project:
      string | null

    state:
      string | null

    status:
      string | null
  }

  scopeMode:
    'ALL' | 'ASSIGNED_ONLY'
}

export interface CancellationApprovalRequest {
  itemId: string
  planId: string

  supervisorId: string
  supervisorName: string

  coordinatorId:
    string | null

  coordinatorName:
    string | null

  planType:
    WorkPlanType

  periodStart: string
  periodEnd: string

  revisionNumber: number

  pharmacyId: string

  name: string

  address:
    string | null

  clues:
    string | null

  region:
    string | null

  project:
    string | null

  scheduledDate: string

  scheduledTime:
    string | null

  required: boolean

  requestReason: string

  requestNotes:
    string | null

  requestedAt: string
}

export interface CancellationApprovalsResponse {
  pendingCount: number

  requests:
    CancellationApprovalRequest[]
}

export interface CancellationApprovalMutationResponse {
  ok: boolean

  itemId: string

  status:
    | 'PENDING'
    | 'CANCELLED'

  cancellationRequestStatus:
    | 'APPROVED'
    | 'REJECTED'
}

export function getMyWorkPlans(
  accessToken: string,
  includeArchived = false,
): Promise<WorkPlansResponse> {
  const query =
    includeArchived
      ? '?includeArchived=true'
      : ''

  return apiRequest<WorkPlansResponse>(
    `/api/mobile/work-plans/mine${query}`,
    {
      method:
        'GET',
    },
    accessToken,
  )
}

export function getPendingWorkPlanApprovals(
  accessToken: string,
): Promise<PendingApprovalsResponse> {
  return apiRequest<PendingApprovalsResponse>(
    '/api/mobile/work-plans/approvals/pending',
    {
      method:
        'GET',
    },
    accessToken,
  )
}

export function getPendingCancellationApprovals(
  accessToken: string,
): Promise<CancellationApprovalsResponse> {
  return apiRequest<CancellationApprovalsResponse>(
    '/api/mobile/work-plans/approvals/cancellation-requests/pending',
    {
      method:
        'GET',
    },
    accessToken,
  )
}

export function getWorkPlanApprovalDetail(
  planId: string,
  accessToken: string,
): Promise<ApprovalWorkPlanDetail> {
  return apiRequest<ApprovalWorkPlanDetail>(
    `/api/mobile/work-plans/approvals/${encodeURIComponent(
      planId,
    )}`,
    {
      method:
        'GET',
    },
    accessToken,
  )
}

export function approveWorkPlan(
  planId: string,
  accessToken: string,
): Promise<ApprovalMutationResponse> {
  return apiRequest<ApprovalMutationResponse>(
    `/api/mobile/work-plans/approvals/${encodeURIComponent(
      planId,
    )}/approve`,
    {
      method:
        'POST',
    },
    accessToken,
  )
}

export function rejectWorkPlan(
  planId: string,
  comment: string,
  accessToken: string,
): Promise<ApprovalMutationResponse> {
  return apiRequest<ApprovalMutationResponse>(
    `/api/mobile/work-plans/approvals/${encodeURIComponent(
      planId,
    )}/reject`,
    {
      method:
        'POST',

      body:
        JSON.stringify({
          comment,
        }),
    },
    accessToken,
  )
}

export function approveCancellationRequest(
  itemId: string,
  accessToken: string,
): Promise<CancellationApprovalMutationResponse> {
  return apiRequest<CancellationApprovalMutationResponse>(
    `/api/mobile/work-plans/approvals/cancellation-requests/${encodeURIComponent(
      itemId,
    )}/approve`,
    {
      method:
        'POST',
    },
    accessToken,
  )
}

export function rejectCancellationRequest(
  itemId: string,
  comment: string,
  accessToken: string,
): Promise<CancellationApprovalMutationResponse> {
  return apiRequest<CancellationApprovalMutationResponse>(
    `/api/mobile/work-plans/approvals/cancellation-requests/${encodeURIComponent(
      itemId,
    )}/reject`,
    {
      method:
        'POST',

      body:
        JSON.stringify({
          comment,
        }),
    },
    accessToken,
  )
}

export function createWorkPlan(
  payload:
    CreateWorkPlanPayload,

  accessToken: string,
): Promise<WorkPlanMutationResponse> {
  return apiRequest<WorkPlanMutationResponse>(
    '/api/mobile/work-plans',
    {
      method:
        'POST',

      body:
        JSON.stringify(
          payload,
        ),
    },
    accessToken,
  )
}

export function getWorkPlanDetail(
  planId: string,
  accessToken: string,
): Promise<WorkPlanDetailResponse> {
  return apiRequest<WorkPlanDetailResponse>(
    `/api/mobile/work-plans/${encodeURIComponent(
      planId,
    )}`,
    {
      method:
        'GET',
    },
    accessToken,
  )
}

export function updateWorkPlan(
  planId: string,

  payload:
    UpdateWorkPlanPayload,

  accessToken: string,
): Promise<WorkPlanMutationResponse> {
  return apiRequest<WorkPlanMutationResponse>(
    `/api/mobile/work-plans/${encodeURIComponent(
      planId,
    )}`,
    {
      method:
        'PATCH',

      body:
        JSON.stringify(
          payload,
        ),
    },
    accessToken,
  )
}

export function submitWorkPlan(
  planId: string,
  accessToken: string,
): Promise<WorkPlanSubmitResponse> {
  return apiRequest<WorkPlanSubmitResponse>(
    `/api/mobile/work-plans/${encodeURIComponent(
      planId,
    )}/submit`,
    {
      method:
        'POST',
    },
    accessToken,
  )
}

export function archiveWorkPlan(
  planId: string,

  comment:
    string | null,

  accessToken: string,
): Promise<WorkPlanMutationResponse> {
  return apiRequest<WorkPlanMutationResponse>(
    `/api/mobile/work-plans/${encodeURIComponent(
      planId,
    )}/archive`,
    {
      method:
        'POST',

      body:
        JSON.stringify({
          comment,
        }),
    },
    accessToken,
  )
}

export function getPharmacyCatalogFilters(
  accessToken: string,
): Promise<PharmacyCatalogFilters> {
  return apiRequest<PharmacyCatalogFilters>(
    '/api/mobile/work-plans/catalog/pharmacies/filters',
    {
      method:
        'GET',
    },
    accessToken,
  )
}

export function getPharmacyCatalog(
  query:
    PharmacyCatalogQuery,

  accessToken: string,
): Promise<PharmacyCatalogResponse> {
  const params =
    new URLSearchParams()

  addQueryParameter(
    params,
    'search',
    query.search,
  )

  addQueryParameter(
    params,
    'region',
    query.region,
  )

  addQueryParameter(
    params,
    'project',
    query.project,
  )

  addQueryParameter(
    params,
    'state',
    query.state,
  )

  addQueryParameter(
    params,
    'status',
    query.status,
  )

  if (
    query.limit !==
    undefined
  ) {
    params.set(
      'limit',
      String(
        query.limit,
      ),
    )
  }

  if (
    query.offset !==
    undefined
  ) {
    params.set(
      'offset',
      String(
        query.offset,
      ),
    )
  }

  const queryString =
    params.toString()

  const path =
    queryString
      ? `/api/mobile/work-plans/catalog/pharmacies?${queryString}`
      : '/api/mobile/work-plans/catalog/pharmacies'

  return apiRequest<PharmacyCatalogResponse>(
    path,
    {
      method:
        'GET',
    },
    accessToken,
  )
}

export function addWorkPlanItem(
  planId: string,

  payload:
    AddWorkPlanItemPayload,

  accessToken: string,
): Promise<WorkPlanItemMutationResponse> {
  return apiRequest<WorkPlanItemMutationResponse>(
    `/api/mobile/work-plans/${encodeURIComponent(
      planId,
    )}/items`,
    {
      method:
        'POST',

      body:
        JSON.stringify(
          payload,
        ),
    },
    accessToken,
  )
}

export function updateWorkPlanItem(
  planId: string,
  itemId: string,

  payload:
    UpdateWorkPlanItemPayload,

  accessToken: string,
): Promise<WorkPlanItemMutationResponse> {
  return apiRequest<WorkPlanItemMutationResponse>(
    `/api/mobile/work-plans/${encodeURIComponent(
      planId,
    )}/items/${encodeURIComponent(
      itemId,
    )}`,
    {
      method:
        'PATCH',

      body:
        JSON.stringify(
          payload,
        ),
    },
    accessToken,
  )
}

export function removeWorkPlanItem(
  planId: string,
  itemId: string,

  reason:
    string | null,

  accessToken: string,
): Promise<WorkPlanItemMutationResponse> {
  return apiRequest<WorkPlanItemMutationResponse>(
    `/api/mobile/work-plans/${encodeURIComponent(
      planId,
    )}/items/${encodeURIComponent(
      itemId,
    )}/remove`,
    {
      method:
        'POST',

      body:
        JSON.stringify({
          reason,
        }),
    },
    accessToken,
  )
}

export function reorderWorkPlanItems(
  planId: string,

  payload: {
    scheduledDate: string
    itemIds: string[]
  },

  accessToken: string,
): Promise<{
  ok: boolean
  planStatus: WorkPlanStatus
  scheduledDate: string
  itemIds: string[]
}> {
  return apiRequest(
    `/api/mobile/work-plans/${encodeURIComponent(
      planId,
    )}/items/reorder`,
    {
      method:
        'POST',

      body:
        JSON.stringify(
          payload,
        ),
    },
    accessToken,
  )
}

function addQueryParameter(
  params:
    URLSearchParams,

  key: string,

  value:
    string | undefined,
) {
  const normalized =
    String(
      value ??
      '',
    ).trim()

  if (normalized) {
    params.set(
      key,
      normalized,
    )
  }
}
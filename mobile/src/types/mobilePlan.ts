export type MobilePlanStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'DONE'
  | 'SKIPPED'
  | 'CANCELLED'
  | 'RESCHEDULED'

export type MobilePlanItemType =
  | 'PHARMACY'
  | 'EXTRA_STOP'

export type MobilePlanItemSource =
  | 'PLAN'
  | 'SUPERVISOR_ADHOC'

export type MobileCancellationRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'

export type MobileWorkPlan = {
  id: string
  status: string
  planType: string
  periodStart: string
  periodEnd: string
}

export type MobilePlanItem = {
  id: string
  planId: string | null
  pharmacyId: string | null

  itemType: MobilePlanItemType | null
  source: MobilePlanItemSource | null

  clues: string | null
  name: string | null
  address: string | null
  region: string | null
  project: string | null

  lat: number | null
  lng: number | null

  googlePlaceId: string | null
  activityCategory: string | null
  additionReason: string | null
  estimatedMinutes: number | null

  addedBy: string | null
  addedAt: string | null

  updatedBy: string | null
  updatedAt: string | null

  scheduledDate: string | null
  scheduledTime: string | null

  order: number
  required: boolean

  status: MobilePlanStatus

  checkInAt: string | null
  checkOutAt: string | null

  checkInLat: number | null
  checkInLng: number | null
  checkOutLat: number | null
  checkOutLng: number | null

  dwellSeconds: number | null

  notes: string | null
  skipReason: string | null

  skippedAt: string | null
  skippedBy: string | null

  rescheduledFromItemId: string | null
  rescheduledToItemId: string | null

  rescheduleReason: string | null
  rescheduleNotes: string | null

  rescheduledAt: string | null
  rescheduledBy: string | null

  cancellationRequestStatus:
    MobileCancellationRequestStatus | null

  cancellationRequestReason: string | null
  cancellationRequestNotes: string | null

  cancellationRequestedAt: string | null
  cancellationRequestedBy: string | null

  cancellationReviewedAt: string | null
  cancellationReviewedBy: string | null

  cancellationReviewComment: string | null

  cancellationReason: string | null
  cancellationNotes: string | null

  cancelledAt: string | null
  cancelledBy: string | null
}

export type TodayPlanResponse = {
  plan: MobileWorkPlan | null

  /*
   * El backend ya devuelve todos los planes
   * que participan en el trabajo del día.
   *
   * Por ahora PlanContext sigue utilizando
   * `plan` como plan principal.
   */
  plans?: MobileWorkPlan[]

  items: MobilePlanItem[]
}

export type PlanItemExecutionResponse = {
  ok: boolean
  item: MobilePlanItem
}

export type ReschedulePlanItemPayload = {
  scheduledDate: string
  scheduledTime?: string | null
  reason: string
  notes?: string
}

export type ReschedulePlanItemResponse = {
  ok: boolean

  originalItem:
    MobilePlanItem | null

  newItem:
    MobilePlanItem | null
}

export type RequestPlanItemCancellationPayload = {
  reason: string
  notes?: string
}

export type RequestPlanItemCancellationResponse = {
  ok: boolean
  item: MobilePlanItem
}
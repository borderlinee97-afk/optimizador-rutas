import {
  getTodayPlan,
} from '../lib/api'
import type {
  MobileCancellationRequestStatus,
  MobilePlanItem,
  MobilePlanItemSource,
  MobilePlanItemType,
  MobileWorkPlan,
  TodayPlanResponse,
} from '../types/mobilePlan'
import {
  db,
  initDB,
} from '../../storage/db'

export type CachedPlanSnapshot = {
  plan:
    MobileWorkPlan | null

  items:
    MobilePlanItem[]

  syncedAt:
    number | null
}

type CachedPlanRow = {
  plan_id:
    string | null

  status:
    string | null

  plan_type:
    string | null

  period_start:
    string | null

  period_end:
    string | null

  synced_at:
    number
}

type CachedItemRow = {
  id:
    string

  plan_id:
    string | null

  pharmacy_id:
    string | null

  item_type:
    MobilePlanItemType

  source:
    MobilePlanItemSource

  clues:
    string | null

  name:
    string

  address:
    string | null

  region:
    string | null

  project:
    string | null

  lat:
    number | null

  lng:
    number | null

  google_place_id:
    string | null

  activity_category:
    string | null

  addition_reason:
    string | null

  estimated_minutes:
    number | null

  added_by:
    string | null

  added_at:
    number | null

  updated_by:
    string | null

  updated_at:
    number | null

  scheduled_date:
    string | null

  scheduled_time:
    string | null

  ord:
    number

  required:
    number

  status:
    MobilePlanItem['status']

  check_in_at:
    number | null

  check_out_at:
    number | null

  check_in_lat:
    number | null

  check_in_lng:
    number | null

  check_out_lat:
    number | null

  check_out_lng:
    number | null

  dwell_seconds:
    number | null

  notes:
    string | null

  skip_reason:
    string | null

  skipped_at:
    number | null

  skipped_by:
    string | null

  rescheduled_from_item_id:
    string | null

  rescheduled_to_item_id:
    string | null

  reschedule_reason:
    string | null

  reschedule_notes:
    string | null

  rescheduled_at:
    number | null

  rescheduled_by:
    string | null

  cancellation_request_status:
    MobileCancellationRequestStatus | null

  cancellation_request_reason:
    string | null

  cancellation_request_notes:
    string | null

  cancellation_requested_at:
    number | null

  cancellation_requested_by:
    string | null

  cancellation_reviewed_at:
    number | null

  cancellation_reviewed_by:
    string | null

  cancellation_review_comment:
    string | null

  cancellation_reason:
    string | null

  cancellation_notes:
    string | null

  cancelled_at:
    number | null

  cancelled_by:
    string | null
}

export async function syncTodayPlan(
  accessToken: string,
): Promise<TodayPlanResponse> {
  const response =
    await getTodayPlan(
      accessToken,
    )

  initDB()

  const syncedAt =
    Date.now()

  db.withTransactionSync(
    () => {
      db.runSync(`
        DELETE FROM plan_items
      `)

      db.runSync(`
        DELETE FROM plan_cache
        WHERE cache_key = 'today'
      `)

      if (
        !response.plan
      ) {
        return
      }

      db.runSync(
        `
        INSERT INTO plan_cache (
          cache_key,
          plan_id,
          status,
          plan_type,
          period_start,
          period_end,
          synced_at
        )
        VALUES (
          'today',
          ?,
          ?,
          ?,
          ?,
          ?,
          ?
        )
        `,
        [
          response.plan.id,
          response.plan.status,
          response.plan.planType,
          response.plan.periodStart,
          response.plan.periodEnd,
          syncedAt,
        ],
      )

      for (
        const item
        of response.items
      ) {
        insertPlanItem(
          item,
          syncedAt,
        )
      }
    },
  )

  return response
}

export function readCachedTodayPlan():
  CachedPlanSnapshot {
  initDB()

  const cachedPlan =
    db.getFirstSync(
      `
      SELECT
        plan_id,
        status,
        plan_type,
        period_start,
        period_end,
        synced_at

      FROM plan_cache

      WHERE cache_key =
        'today'

      LIMIT 1
      `,
    ) as
      CachedPlanRow | null

  const cachedItems =
    db.getAllSync(
      `
      SELECT
        id,
        plan_id,
        pharmacy_id,

        item_type,
        source,

        clues,
        name,
        address,
        region,
        project,

        lat,
        lng,

        google_place_id,
        activity_category,
        addition_reason,
        estimated_minutes,

        added_by,
        added_at,

        updated_by,
        updated_at,

        scheduled_date,
        scheduled_time,

        ord,
        required,
        status,

        check_in_at,
        check_out_at,

        check_in_lat,
        check_in_lng,
        check_out_lat,
        check_out_lng,

        dwell_seconds,
        notes,
        skip_reason,

        skipped_at,
        skipped_by,

        rescheduled_from_item_id,
        rescheduled_to_item_id,

        reschedule_reason,
        reschedule_notes,

        rescheduled_at,
        rescheduled_by,

        cancellation_request_status,
        cancellation_request_reason,
        cancellation_request_notes,

        cancellation_requested_at,
        cancellation_requested_by,

        cancellation_reviewed_at,
        cancellation_reviewed_by,
        cancellation_review_comment,

        cancellation_reason,
        cancellation_notes,
        cancelled_at,
        cancelled_by

      FROM plan_items

      ORDER BY
        scheduled_time ASC,
        ord ASC
      `,
    ) as CachedItemRow[]

  const plan:
    MobileWorkPlan | null =
    cachedPlan?.plan_id
      ? {
          id:
            cachedPlan.plan_id,

          status:
            cachedPlan.status ??
            '',

          planType:
            cachedPlan.plan_type ??
            '',

          periodStart:
            cachedPlan.period_start ??
            '',

          periodEnd:
            cachedPlan.period_end ??
            '',
        }
      : null

  return {
    plan,

    items:
      cachedItems.map(
        mapCachedItem,
      ),

    syncedAt:
      cachedPlan
        ?.synced_at ??
      null,
  }
}

/**
 * Actualiza localmente cualquier cambio
 * de ejecución que regrese del backend.
 *
 * Incluye:
 * - check-in / check-out
 * - no realizada
 * - reprogramación
 * - solicitud de cancelación
 * - cancelación final
 */
export function updateCachedExecution(
  item:
    MobilePlanItem,
) {
  initDB()

  const result =
    db.runSync(
      `
      UPDATE plan_items

      SET
        status = ?,

        check_in_at = ?,
        check_out_at = ?,

        check_in_lat = ?,
        check_in_lng = ?,
        check_out_lat = ?,
        check_out_lng = ?,

        dwell_seconds = ?,

        notes = ?,
        skip_reason = ?,

        skipped_at = ?,
        skipped_by = ?,

        rescheduled_from_item_id = ?,
        rescheduled_to_item_id = ?,

        reschedule_reason = ?,
        reschedule_notes = ?,

        rescheduled_at = ?,
        rescheduled_by = ?,

        cancellation_request_status = ?,
        cancellation_request_reason = ?,
        cancellation_request_notes = ?,

        cancellation_requested_at = ?,
        cancellation_requested_by = ?,

        cancellation_reviewed_at = ?,
        cancellation_reviewed_by = ?,
        cancellation_review_comment = ?,

        cancellation_reason = ?,
        cancellation_notes = ?,

        cancelled_at = ?,
        cancelled_by = ?,

        updated_by =
          COALESCE(
            ?,
            updated_by
          ),

        updated_at =
          COALESCE(
            ?,
            updated_at
          ),

        synced_at = ?

      WHERE id = ?
      `,
      [
        item.status,

        parseDateToTimestamp(
          item.checkInAt,
        ),

        parseDateToTimestamp(
          item.checkOutAt,
        ),

        item.checkInLat ??
          null,

        item.checkInLng ??
          null,

        item.checkOutLat ??
          null,

        item.checkOutLng ??
          null,

        item.dwellSeconds ??
          null,

        item.notes ??
          null,

        item.skipReason ??
          null,

        parseDateToTimestamp(
          item.skippedAt,
        ),

        item.skippedBy ??
          null,

        item.rescheduledFromItemId ??
          null,

        item.rescheduledToItemId ??
          null,

        item.rescheduleReason ??
          null,

        item.rescheduleNotes ??
          null,

        parseDateToTimestamp(
          item.rescheduledAt,
        ),

        item.rescheduledBy ??
          null,

        item.cancellationRequestStatus ??
          null,

        item.cancellationRequestReason ??
          null,

        item.cancellationRequestNotes ??
          null,

        parseDateToTimestamp(
          item.cancellationRequestedAt,
        ),

        item.cancellationRequestedBy ??
          null,

        parseDateToTimestamp(
          item.cancellationReviewedAt,
        ),

        item.cancellationReviewedBy ??
          null,

        item.cancellationReviewComment ??
          null,

        item.cancellationReason ??
          null,

        item.cancellationNotes ??
          null,

        parseDateToTimestamp(
          item.cancelledAt,
        ),

        item.cancelledBy ??
          null,

        item.updatedBy ??
          null,

        parseDateToTimestamp(
          item.updatedAt,
        ),

        Date.now(),

        item.id,
      ],
    )

  if (
    result.changes !==
    1
  ) {
    throw new Error(
      'No fue posible actualizar la actividad en la caché local.',
    )
  }
}

export function clearCachedPlan() {
  initDB()

  db.withTransactionSync(
    () => {
      db.runSync(`
        DELETE FROM plan_items
      `)

      db.runSync(`
        DELETE FROM plan_cache
      `)
    },
  )
}

function insertPlanItem(
  item:
    MobilePlanItem,

  syncedAt:
    number,
) {
  const itemType =
    resolveItemType(
      item,
    )

  const source =
    resolveItemSource(
      item,
      itemType,
    )

  const displayName =
    item.name
      ?.trim() ||
    item.clues
      ?.trim() ||
    (
      itemType ===
      'EXTRA_STOP'
        ? 'Parada adicional sin nombre'
        : 'Farmacia sin nombre'
    )

  /*
   * Construimos columnas y valores de forma
   * paralela para evitar errores de conteo
   * de placeholders conforme crezca el modelo.
   */
  const columns = [
    'id',
    'plan_id',
    'pharmacy_id',

    'item_type',
    'source',

    'clues',
    'name',
    'address',
    'region',
    'project',

    'lat',
    'lng',

    'google_place_id',
    'activity_category',
    'addition_reason',
    'estimated_minutes',

    'added_by',
    'added_at',

    'updated_by',
    'updated_at',

    'scheduled_date',
    'scheduled_time',

    'ord',
    'required',
    'status',

    'check_in_at',
    'check_out_at',

    'check_in_lat',
    'check_in_lng',
    'check_out_lat',
    'check_out_lng',

    'dwell_seconds',
    'notes',
    'skip_reason',

    'skipped_at',
    'skipped_by',

    'rescheduled_from_item_id',
    'rescheduled_to_item_id',

    'reschedule_reason',
    'reschedule_notes',

    'rescheduled_at',
    'rescheduled_by',

    'cancellation_request_status',
    'cancellation_request_reason',
    'cancellation_request_notes',

    'cancellation_requested_at',
    'cancellation_requested_by',

    'cancellation_reviewed_at',
    'cancellation_reviewed_by',
    'cancellation_review_comment',

    'cancellation_reason',
    'cancellation_notes',
    'cancelled_at',
    'cancelled_by',

    'synced_at',
  ]

  const values = [
    item.id,
    item.planId,
    item.pharmacyId,

    itemType,
    source,

    item.clues,
    displayName,
    item.address,
    item.region,
    item.project,

    item.lat,
    item.lng,

    item.googlePlaceId,
    item.activityCategory,
    item.additionReason,
    item.estimatedMinutes,

    item.addedBy,

    parseDateToTimestamp(
      item.addedAt,
    ),

    item.updatedBy,

    parseDateToTimestamp(
      item.updatedAt,
    ),

    item.scheduledDate,
    item.scheduledTime,

    item.order,

    item.required
      ? 1
      : 0,

    item.status,

    parseDateToTimestamp(
      item.checkInAt,
    ),

    parseDateToTimestamp(
      item.checkOutAt,
    ),

    item.checkInLat,
    item.checkInLng,
    item.checkOutLat,
    item.checkOutLng,

    item.dwellSeconds,
    item.notes,
    item.skipReason,

    parseDateToTimestamp(
      item.skippedAt,
    ),

    item.skippedBy,

    item.rescheduledFromItemId,
    item.rescheduledToItemId,

    item.rescheduleReason,
    item.rescheduleNotes,

    parseDateToTimestamp(
      item.rescheduledAt,
    ),

    item.rescheduledBy,

    item.cancellationRequestStatus,
    item.cancellationRequestReason,
    item.cancellationRequestNotes,

    parseDateToTimestamp(
      item.cancellationRequestedAt,
    ),

    item.cancellationRequestedBy,

    parseDateToTimestamp(
      item.cancellationReviewedAt,
    ),

    item.cancellationReviewedBy,
    item.cancellationReviewComment,

    item.cancellationReason,
    item.cancellationNotes,

    parseDateToTimestamp(
      item.cancelledAt,
    ),

    item.cancelledBy,

    syncedAt,
  ]

  const placeholders =
    columns
      .map(
        () => '?',
      )
      .join(', ')

  db.runSync(
    `
    INSERT INTO plan_items (
      ${columns.join(
        ', ',
      )}
    )
    VALUES (
      ${placeholders}
    )
    `,
    values,
  )
}

function mapCachedItem(
  row:
    CachedItemRow,
): MobilePlanItem {
  return {
    id:
      row.id,

    planId:
      row.plan_id,

    pharmacyId:
      row.pharmacy_id,

    itemType:
      row.item_type,

    source:
      row.source,

    clues:
      row.clues,

    name:
      row.name,

    address:
      row.address,

    region:
      row.region,

    project:
      row.project,

    lat:
      row.lat,

    lng:
      row.lng,

    googlePlaceId:
      row.google_place_id,

    activityCategory:
      row.activity_category,

    additionReason:
      row.addition_reason,

    estimatedMinutes:
      row.estimated_minutes,

    addedBy:
      row.added_by,

    addedAt:
      timestampToIso(
        row.added_at,
      ),

    updatedBy:
      row.updated_by,

    updatedAt:
      timestampToIso(
        row.updated_at,
      ),

    scheduledDate:
      row.scheduled_date,

    scheduledTime:
      row.scheduled_time,

    order:
      Number(
        row.ord,
      ),

    required:
      Number(
        row.required,
      ) === 1,

    status:
      row.status,

    checkInAt:
      timestampToIso(
        row.check_in_at,
      ),

    checkOutAt:
      timestampToIso(
        row.check_out_at,
      ),

    checkInLat:
      row.check_in_lat,

    checkInLng:
      row.check_in_lng,

    checkOutLat:
      row.check_out_lat,

    checkOutLng:
      row.check_out_lng,

    dwellSeconds:
      row.dwell_seconds,

    notes:
      row.notes,

    skipReason:
      row.skip_reason,

    skippedAt:
      timestampToIso(
        row.skipped_at,
      ),

    skippedBy:
      row.skipped_by,

    rescheduledFromItemId:
      row.rescheduled_from_item_id,

    rescheduledToItemId:
      row.rescheduled_to_item_id,

    rescheduleReason:
      row.reschedule_reason,

    rescheduleNotes:
      row.reschedule_notes,

    rescheduledAt:
      timestampToIso(
        row.rescheduled_at,
      ),

    rescheduledBy:
      row.rescheduled_by,

    cancellationRequestStatus:
      row.cancellation_request_status,

    cancellationRequestReason:
      row.cancellation_request_reason,

    cancellationRequestNotes:
      row.cancellation_request_notes,

    cancellationRequestedAt:
      timestampToIso(
        row.cancellation_requested_at,
      ),

    cancellationRequestedBy:
      row.cancellation_requested_by,

    cancellationReviewedAt:
      timestampToIso(
        row.cancellation_reviewed_at,
      ),

    cancellationReviewedBy:
      row.cancellation_reviewed_by,

    cancellationReviewComment:
      row.cancellation_review_comment,

    cancellationReason:
      row.cancellation_reason,

    cancellationNotes:
      row.cancellation_notes,

    cancelledAt:
      timestampToIso(
        row.cancelled_at,
      ),

    cancelledBy:
      row.cancelled_by,
  }
}

function resolveItemType(
  item:
    MobilePlanItem,
): MobilePlanItemType {
  if (
    item.itemType ===
      'PHARMACY' ||
    item.itemType ===
      'EXTRA_STOP'
  ) {
    return item.itemType
  }

  return item.pharmacyId ===
    null
    ? 'EXTRA_STOP'
    : 'PHARMACY'
}

function resolveItemSource(
  item:
    MobilePlanItem,

  itemType:
    MobilePlanItemType,
): MobilePlanItemSource {
  if (
    item.source ===
      'PLAN' ||
    item.source ===
      'SUPERVISOR_ADHOC'
  ) {
    return item.source
  }

  return itemType ===
    'EXTRA_STOP'
    ? 'SUPERVISOR_ADHOC'
    : 'PLAN'
}

function parseDateToTimestamp(
  value:
    | string
    | null
    | undefined,
): number | null {
  if (!value) {
    return null
  }

  const timestamp =
    new Date(
      value,
    ).getTime()

  return Number.isFinite(
    timestamp,
  )
    ? timestamp
    : null
}

function timestampToIso(
  value:
    | number
    | null,
): string | null {
  if (!value) {
    return null
  }

  const date =
    new Date(
      value,
    )

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return null
  }

  return date.toISOString()
}
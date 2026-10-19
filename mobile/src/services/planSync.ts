import {
  ApiError,
  getTodayPlan,
} from '../lib/api'
import type {
  MobileCancellationRequestStatus,
  MobilePlanItem,
  MobilePlanItemSource,
  MobilePlanItemType,
  MobileVisitActivity,
  MobileWorkPlan,
  TodayPlanResponse,
} from '../types/mobilePlan'
import {
  db,
  initDB,
  getDatabaseUserId,
  isDatabaseActive,
  isLegacyRecoveryActive,
} from '../../storage/db'

export type CachedPlanSnapshot = {
  downloadWindow?: { startDate: string; endDate: string }

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
  const owner = getDatabaseUserId()
  if (!owner || !isDatabaseActive(owner)) throw new Error('No hay una cuenta local autorizada.')
  const response =
    await getTodayPlan(
      accessToken,
    )

  // A response for a signed-out/replaced account must never enter another cache.
  if (!isDatabaseActive(owner)) throw new Error('La cuenta cambió durante la sincronización.')
  if (isLegacyRecoveryActive()) throw new ApiError('La recuperación local está en curso. Intenta sincronizar al terminar.', 409, 'LOCAL_RECOVERY_IN_PROGRESS')

  initDB()

  const syncedAt =
    Date.now()

  db.withTransactionSync(
    () => {
      if (hasPendingPlanOperations(response.items.map(item => item.id))) {
        throw new ApiError('Hay evidencias u operaciones locales pendientes. Se conservó el plan descargado hasta resolverlas.', 409, 'LOCAL_PENDING_OPERATIONS')
      }
      db.runSync(`
        DELETE FROM plan_item_activities
        WHERE plan_item_id IN (SELECT id FROM plan_items WHERE NOT EXISTS (
          SELECT 1 FROM legacy_recovery_receipts r WHERE r.source_table = 'plan_items' AND r.source_id = plan_items.id
        ))
      `)

      db.runSync(`
        DELETE FROM plan_items
        WHERE NOT EXISTS (SELECT 1 FROM legacy_recovery_receipts r
          WHERE r.source_table = 'plan_items' AND r.source_id = plan_items.id)
      `)
      db.runSync("UPDATE legacy_recovery_receipts SET hidden_from_today = 1 WHERE source_table = 'plan_items'")

      db.runSync(`
        DELETE FROM plan_cache
        WHERE cache_key = 'today'
      `)

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
          response.plan?.id ?? null,
          response.plan?.status ?? null,
          response.plan?.planType ?? null,
          response.plan?.periodStart ?? null,
          response.plan?.periodEnd ?? null,
          syncedAt,
        ],
      )

      db.runSync("DELETE FROM plan_download_window WHERE cache_key = 'today'")
      if (response.downloadWindow?.scope === 'week') {
        db.runSync("INSERT INTO plan_download_window (cache_key, start_date, end_date, plans_json) VALUES ('today', ?, ?, ?)", [response.downloadWindow.startDate, response.downloadWindow.endDate, JSON.stringify(response.plans ?? (response.plan ? [response.plan] : []))])
      }

      for (
        const item
        of response.items
      ) {
        // A recovered historical visit may reappear in today's authoritative response.
        db.runSync('DELETE FROM plan_items WHERE id = ?', [item.id])
        insertPlanItem(
          item,
          syncedAt,
        )

        insertPlanItemActivities(
          item.id,
          item.activities ??
            [],
          syncedAt,
        )
        db.runSync("UPDATE legacy_recovery_receipts SET hidden_from_today = 0 WHERE source_table = 'plan_items' AND source_id = ?", [item.id])
      }
    },
  )

  return response
}

export function readCachedTodayPlan(date = mexicoPlanDate()):
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

  const window = db.getFirstSync("SELECT start_date, end_date, plans_json FROM plan_download_window WHERE cache_key = 'today'") as { start_date: string; end_date: string; plans_json: string } | null

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
      WHERE (NOT EXISTS (SELECT 1 FROM plan_download_window WHERE cache_key = 'today') OR scheduled_date = ?)
      AND NOT EXISTS (SELECT 1 FROM legacy_recovery_receipts r
        WHERE r.source_table = 'plan_items' AND r.source_id = plan_items.id AND r.hidden_from_today = 1)

      ORDER BY
        scheduled_time ASC,
        ord ASC
      `,
      [date],
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

  const plans: MobileWorkPlan[] = window ? JSON.parse(window.plans_json) : []
  const selected = window ? (plans.find(p => cachedItems.some(item => item.plan_id === p.id)) ?? plans.find(p => p.periodStart.slice(0, 10) <= date && p.periodEnd.slice(0, 10) >= date) ?? null) : plan

  return {
    downloadWindow: window ? { startDate: window.start_date, endDate: window.end_date } : undefined,
    plan: selected,

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

export function replaceCachedVisitActivities(
  planItemId: string,
  activities: MobileVisitActivity[],
) {
  initDB()

  db.withTransactionSync(
    () => {
      db.runSync(
        `
        DELETE FROM plan_item_activities

        WHERE plan_item_id = ?
        `,
        [
          planItemId,
        ],
      )

      insertPlanItemActivities(
        planItemId,
        activities,
        Date.now(),
      )
    },
  )
}

export function clearCachedPlan() {
  initDB()
  if (hasPendingPlanOperations()) throw new Error('Se conservaron las operaciones locales pendientes.')

  db.withTransactionSync(
    () => {
      db.runSync(`
        DELETE FROM plan_item_activities
        WHERE plan_item_id IN (SELECT id FROM plan_items WHERE NOT EXISTS (
          SELECT 1 FROM legacy_recovery_receipts r WHERE r.source_table = 'plan_items' AND r.source_id = plan_items.id
        ))
      `)

      db.runSync(`
        DELETE FROM plan_items
        WHERE NOT EXISTS (SELECT 1 FROM legacy_recovery_receipts r
          WHERE r.source_table = 'plan_items' AND r.source_id = plan_items.id)
      `)
      db.runSync("UPDATE legacy_recovery_receipts SET hidden_from_today = 1 WHERE source_table = 'plan_items'")

      db.runSync("DELETE FROM plan_download_window WHERE cache_key = 'today'")
      db.runSync(`
        DELETE FROM plan_cache
      `)
    },
  )
}

/** Rebuild an orphan's parent from an exact-owner backend response, as history. */
export function archiveVerifiedRecoveryVisit(item: MobilePlanItem, userId: string, profileId: string) {
  if (!isDatabaseActive(userId)) throw new Error('La cuenta cambió durante la recuperación.')
  db.withTransactionSync(() => {
    const existing = db.getFirstSync<{ plan_id: string | null }>('SELECT plan_id FROM plan_items WHERE id = ?', [item.id])
    if (existing && existing.plan_id !== item.planId) throw new Error('La visita de destino tiene otro plan.')
    if (!existing) {
      insertPlanItem(item, Date.now())
    }
    for (const activity of item.activities ?? []) {
      const cached = db.getFirstSync<{ plan_item_id: string }>('SELECT plan_item_id FROM plan_item_activities WHERE id = ?', [activity.id])
      if (cached && cached.plan_item_id !== item.id) throw new Error('La actividad de destino tiene otra visita.')
      if (!cached) insertPlanItemActivities(item.id, [activity], Date.now())
    }
    db.runSync(`INSERT INTO legacy_recovery_receipts
      (source_table, source_id, source_hash, auth_user_id, profile_id, outcome, hidden_from_today, recovered_at)
      VALUES ('plan_items', ?, ?, ?, ?, 'SERVER_PARENT', ?, ?) ON CONFLICT(source_table, source_id) DO NOTHING`,
      [item.id, `server:${item.planId}:${item.id}`, userId, profileId, existing ? 0 : 1, Date.now()])
  })
}

function hasPendingPlanOperations(incomingIds: string[] = []) {
  const incoming = new Set(incomingIds)
  return db.getAllSync<{ plan_item_id: string | null; archived: number }>(`
    SELECT plan_item_id, EXISTS (
      SELECT 1 FROM legacy_recovery_receipts r WHERE r.source_table = 'plan_items'
        AND r.source_id = evidence_queue.plan_item_id AND r.hidden_from_today = 1) AS archived
    FROM evidence_queue WHERE status <> 'READY'
    UNION ALL
    SELECT plan_item_id, EXISTS (
      SELECT 1 FROM legacy_recovery_receipts r WHERE r.source_table = 'plan_items'
        AND r.source_id = execution_outbox.plan_item_id AND r.hidden_from_today = 1) AS archived
    FROM execution_outbox WHERE status <> 'SYNCED'
  `).some(row => !row.archived || incoming.has(row.plan_item_id ?? ''))
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

function insertPlanItemActivities(
  planItemId: string,
  activities: MobileVisitActivity[],
  syncedAt: number,
) {
  for (
    const activity
    of activities
  ) {
    db.runSync(
      `
      INSERT INTO plan_item_activities (
        id,
        plan_item_id,
        activity_type,
        note,
        ord,
        status,
        execution_note,
        completed_by,
        completed_at,
        skipped_by,
        skipped_at,
        skip_reason,
        created_by,
        created_at,
        updated_by,
        updated_at,
        synced_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      `,
      [
        activity.id,
        planItemId,
        activity.activityType,
        activity.note,
        activity.order,
        activity.status,
        activity.executionNote,
        activity.completedBy,
        parseDateToTimestamp(
          activity.completedAt,
        ),
        activity.skippedBy,
        parseDateToTimestamp(
          activity.skippedAt,
        ),
        activity.skipReason,
        activity.createdBy,
        parseDateToTimestamp(
          activity.createdAt,
        ),
        activity.updatedBy,
        parseDateToTimestamp(
          activity.updatedAt,
        ),
        syncedAt,
      ],
    )
  }
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
      'SUPERVISOR_ADHOC' ||
    item.source ===
      'HIERARCHY_ASSIGNED'
  ) {
    return item.source
  }

  return itemType === 'EXTRA_STOP'
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

export function mexicoPlanDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const value = (key: string) => parts.find(part => part.type === key)!.value
  return `${value('year')}-${value('month')}-${value('day')}`
}

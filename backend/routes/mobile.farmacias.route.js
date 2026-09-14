import { Router } from 'express'

import { pool } from '../db/pool.js'
import { requireAuth } from '../middleware/requireAuth.js'
import {
  appendWorkPlanEvent,
} from '../services/workPlanAudit.service.js'
import {
  getPharmacyAccess,
} from '../services/pharmacyAccess.service.js'

const router = Router()

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ALLOWED_SKIP_REASONS = new Set([
  'UNIT_CLOSED',
  'ACCESS_RESTRICTED',
  'STAFF_ABSENT',
  'ROAD_BLOCKED',
  'SECURITY_RISK',
  'RESCHEDULE_REQUESTED',
  'OTHER',
])

const ALLOWED_RESCHEDULE_REASONS =
  new Set([
    'TIME_INSUFFICIENT',
    'UNIT_CLOSED_TEMPORARILY',
    'ACCESS_RESTRICTED',
    'ROAD_BLOCKED',
    'SECURITY_RISK',
    'OPERATIONAL_PRIORITY',
    'SUPERVISOR_REQUEST',
    'OTHER',
  ])

const ALLOWED_CANCELLATION_REQUEST_REASONS =
  new Set([
    'UNIT_CLOSED_DEFINITIVELY',
    'OPERATION_CANCELLED',
    'DUPLICATE_UNIT',
    'UNIT_OUT_OF_SERVICE',
    'COORDINATION_INSTRUCTION',
    'OTHER',
  ])

const PLAN_ITEM_SELECT = `
  SELECT
    wpi.id AS plan_item_id,
    wpi.plan_id,
    wpi.pharmacy_id,

    wpi.item_type,
    wpi.source,

    f.clues,

    COALESCE(
      NULLIF(
        TRIM(
          wpi.custom_name
        ),
        ''
      ),
      NULLIF(
        TRIM(
          f.unidad
        ),
        ''
      ),
      f.clues,
      'Actividad sin nombre'
    ) AS name,

    COALESCE(
      NULLIF(
        TRIM(
          wpi.custom_address
        ),
        ''
      ),
      f.direccion
    ) AS direccion,

    f.region_sanitaria,
    f.proyecto,

    COALESCE(
      wpi.custom_lat,
      f.latitud::double precision
    ) AS lat,

    COALESCE(
      wpi.custom_lng,
      f.longitud::double precision
    ) AS lng,

    wpi.google_place_id,
    wpi.activity_category,
    wpi.addition_reason,
    wpi.estimated_minutes,

    wpi.added_by,
    wpi.added_at,

    wpi.updated_by,
    wpi.updated_at,

    wpi.scheduled_date,
    wpi.scheduled_time::text,
    wpi.ord,
    wpi.required,
    wpi.status,

    wpi.check_in_at,
    wpi.check_out_at,

    wpi.check_in_lat,
    wpi.check_in_lng,

    wpi.check_out_lat,
    wpi.check_out_lng,

    wpi.dwell_seconds,

    wpi.notes,
    wpi.skip_reason,

    wpi.skipped_at,
    wpi.skipped_by,

    wpi.rescheduled_from_item_id,
    wpi.rescheduled_to_item_id,

    wpi.reschedule_reason,
    wpi.reschedule_notes,

    wpi.rescheduled_at,
    wpi.rescheduled_by,

    wpi.cancellation_request_status,
    wpi.cancellation_request_reason,
    wpi.cancellation_request_notes,

    wpi.cancellation_requested_at,
    wpi.cancellation_requested_by,

    wpi.cancellation_reviewed_at,
    wpi.cancellation_reviewed_by,

    wpi.cancellation_review_comment,

    wpi.cancellation_reason,
    wpi.cancellation_notes,

    wpi.cancelled_at,
    wpi.cancelled_by

  FROM public.work_plan_item wpi

  LEFT JOIN public.farmacia f
    ON f.id =
      wpi.pharmacy_id
`

router.use(requireAuth)
router.use(loadSupervisorProfile)

/**
 * GET /api/mobile/farmacias/my-plan/today
 *
 * Devuelve todas las actividades autorizadas
 * para hoy provenientes de:
 *
 * - plan ordinario aprobado
 * - planes extraordinarios aprobados
 * - paradas adicionales asociadas
 */
router.get(
  '/my-plan/today',
  async (req, res) => {
    try {
      /*
       * 1. Todos los planes aprobados
       * vigentes para la fecha actual.
       */
      const plansResult =
        await pool.query(
          `
          SELECT
            wp.id,
            wp.status,
            wp.plan_type,
            wp.period_start,
            wp.period_end

          FROM public.work_plan wp

          WHERE wp.supervisor_id = $1

            AND wp.status =
              'APPROVED'

            AND wp.archived_at
              IS NULL

            AND CURRENT_DATE
              BETWEEN
                wp.period_start
                AND wp.period_end

          ORDER BY
            CASE
              WHEN wp.plan_type =
                'ORDINARY'
              THEN 0

              WHEN wp.plan_type =
                'EXTRAORDINARY'
              THEN 1

              ELSE 2
            END,

            wp.created_at DESC
          `,
          [
            req.profile.id,
          ],
        )

      if (
        plansResult.rowCount ===
        0
      ) {
        return res.json({
          plan: null,
          plans: [],
          items: [],
        })
      }

      const plans =
        plansResult.rows

      /*
       * El ORDINARY queda como plan principal
       * cuando existe. Se mantiene `plan`
       * por compatibilidad con PlanContext
       * y la caché móvil actual.
       */
      const primaryPlan =
        plans[0]

      /*
       * 2. Todas las actividades autorizadas
       * correspondientes específicamente a hoy.
       *
       * Usamos PLAN_ITEM_SELECT para no tener
       * dos SELECT distintos que mantener.
       */
      const itemsResult =
        await pool.query(
          `
          ${PLAN_ITEM_SELECT}

          INNER JOIN public.work_plan wp
            ON wp.id =
              wpi.plan_id

          WHERE wp.supervisor_id =
              $1

            AND wp.status =
              'APPROVED'

            AND wp.archived_at
              IS NULL

            AND CURRENT_DATE
              BETWEEN
                wp.period_start
                AND wp.period_end

            AND wpi.scheduled_date =
              CURRENT_DATE

            AND wpi.removed_at
              IS NULL

          ORDER BY
            wpi.scheduled_time ASC
              NULLS LAST,

            CASE
              WHEN wp.plan_type =
                'ORDINARY'
              THEN 0

              WHEN wp.plan_type =
                'EXTRAORDINARY'
              THEN 1

              ELSE 2
            END,

            wpi.ord ASC,

            wpi.added_at ASC
              NULLS LAST
          `,
          [
            req.profile.id,
          ],
        )

      const mappedPlans =
        plans.map(
          (
            plan,
          ) => ({
            id:
              plan.id,

            status:
              plan.status,

            planType:
              plan.plan_type,

            periodStart:
              plan.period_start,

            periodEnd:
              plan.period_end,
          }),
        )

      return res.json({
        plan: {
          id:
            primaryPlan.id,

          status:
            primaryPlan.status,

          planType:
            primaryPlan.plan_type,

          periodStart:
            primaryPlan.period_start,

          periodEnd:
            primaryPlan.period_end,
        },

        plans:
          mappedPlans,

        items:
          itemsResult.rows.map(
            mapPlanItem,
          ),
      })
    } catch (error) {
      console.error(
        '[mobile.farmacias][my-plan/today]',
        error,
      )

      return res.status(500).json({
        error:
          'No fue posible obtener el trabajo del día',

        code:
          'TODAY_PLAN_FETCH_FAILED',
      })
    }
  },
)

/**
 * POST
 * /api/mobile/farmacias/items/:itemId/check-in
 */
router.post(
  '/items/:itemId/check-in',
  async (req, res) => {
    const itemId =
      req.params.itemId

    const invalidIdResponse =
      validateItemId(itemId)

    if (invalidIdResponse) {
      return res
        .status(400)
        .json(invalidIdResponse)
    }

    const coordinates =
      parseCoordinates(req.body)

    if (!coordinates.ok) {
      return res.status(400).json({
        error:
          coordinates.error,

        code:
          'INVALID_EXECUTION_COORDINATES',
      })
    }

    const client =
      await pool.connect()

    try {
      await client.query(
        'BEGIN',
      )

      const item =
        await getLockedOwnedItem(
          client,
          itemId,
          req.profile.id,
        )

      if (!item) {
        await client.query(
          'ROLLBACK',
        )

        return res.status(404).json({
          error:
            'La actividad no existe o no pertenece al usuario autenticado',

          code:
            'PLAN_ITEM_NOT_FOUND',
        })
      }

      const validation =
        validateExecutableItem(
          item,
          'PENDING',
        )

      if (validation) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(409)
          .json(validation)
      }

      const activeVisitResult =
        await client.query(
          `
          SELECT
            wpi.id

          FROM public.work_plan_item wpi

          INNER JOIN public.work_plan wp
            ON wp.id = wpi.plan_id

          WHERE wp.supervisor_id = $1
            AND wpi.status =
              'IN_PROGRESS'
            AND wpi.id <> $2

          LIMIT 1

          FOR UPDATE OF wpi
          `,
          [
            req.profile.id,
            itemId,
          ],
        )

      if (
        activeVisitResult.rowCount >
        0
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res.status(409).json({
          error:
            'Debes finalizar la actividad activa antes de iniciar otra',

          code:
            'ACTIVE_VISIT_EXISTS',

          activeItemId:
            activeVisitResult
              .rows[0]
              .id,
        })
      }

      await client.query(
        `
        UPDATE public.work_plan_item

        SET
          status = 'IN_PROGRESS',

          check_in_at = NOW(),
          check_in_lat = $2,
          check_in_lng = $3,

          check_out_at = NULL,
          check_out_lat = NULL,
          check_out_lng = NULL,

          dwell_seconds = NULL,
          skip_reason = NULL,
          notes = NULL

        WHERE id = $1
        `,
        [
          itemId,
          coordinates.lat,
          coordinates.lng,
        ],
      )

      const completeItem =
        await getCompletePlanItem(
          client,
          itemId,
        )

      if (!completeItem) {
        throw new Error(
          'La actividad actualizada no pudo recuperarse',
        )
      }

      await client.query(
        'COMMIT',
      )

      return res.status(201).json({
        ok: true,

        item:
          mapPlanItem(
            completeItem,
          ),
      })
    } catch (error) {
      await rollbackSafely(
        client,
      )

      console.error(
        '[mobile.farmacias][check-in]',
        error,
      )

      return res.status(500).json({
        error:
          'No fue posible registrar el check-in',

        code:
          'CHECK_IN_FAILED',
      })
    } finally {
      client.release()
    }
  },
)

/**
 * POST
 * /api/mobile/farmacias/items/:itemId/check-out
 */
router.post(
  '/items/:itemId/check-out',
  async (req, res) => {
    const itemId =
      req.params.itemId

    const invalidIdResponse =
      validateItemId(itemId)

    if (invalidIdResponse) {
      return res
        .status(400)
        .json(invalidIdResponse)
    }

    const coordinates =
      parseCoordinates(req.body)

    if (!coordinates.ok) {
      return res.status(400).json({
        error:
          coordinates.error,

        code:
          'INVALID_EXECUTION_COORDINATES',
      })
    }

    const client =
      await pool.connect()

    try {
      await client.query(
        'BEGIN',
      )

      const item =
        await getLockedOwnedItem(
          client,
          itemId,
          req.profile.id,
        )

      if (!item) {
        await client.query(
          'ROLLBACK',
        )

        return res.status(404).json({
          error:
            'La actividad no existe o no pertenece al usuario autenticado',

          code:
            'PLAN_ITEM_NOT_FOUND',
        })
      }

      if (
        item.plan_status !==
        'APPROVED'
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res.status(409).json({
          error:
            'El plan de trabajo no está autorizado',

          code:
            'PLAN_NOT_APPROVED',
        })
      }

      if (
        item.status !==
          'IN_PROGRESS' ||
        !item.check_in_at
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res.status(409).json({
          error:
            'La actividad no tiene una ejecución activa',

          code:
            'ITEM_NOT_IN_PROGRESS',
        })
      }

      await client.query(
        `
        UPDATE public.work_plan_item

        SET
          status = 'DONE',

          check_out_at = NOW(),
          check_out_lat = $2,
          check_out_lng = $3,

          dwell_seconds =
            GREATEST(
              0,

              FLOOR(
                EXTRACT(
                  EPOCH FROM (
                    NOW() -
                    check_in_at
                  )
                )
              )::integer
            )

        WHERE id = $1
        `,
        [
          itemId,
          coordinates.lat,
          coordinates.lng,
        ],
      )

      const completeItem =
        await getCompletePlanItem(
          client,
          itemId,
        )

      if (!completeItem) {
        throw new Error(
          'La actividad finalizada no pudo recuperarse',
        )
      }

      await client.query(
        'COMMIT',
      )

      return res.json({
        ok: true,

        item:
          mapPlanItem(
            completeItem,
          ),
      })
    } catch (error) {
      await rollbackSafely(
        client,
      )

      console.error(
        '[mobile.farmacias][check-out]',
        error,
      )

      return res.status(500).json({
        error:
          'No fue posible registrar el check-out',

        code:
          'CHECK_OUT_FAILED',
      })
    } finally {
      client.release()
    }
  },
)

/**
 * POST
 * /api/mobile/farmacias/items/:itemId/skip
 */
router.post(
  '/items/:itemId/skip',
  async (req, res) => {
    const itemId =
      req.params.itemId

    const reason =
      String(
        req.body?.reason ??
          '',
      ).trim()

    const notes =
      String(
        req.body?.notes ??
          '',
      ).trim()

    const invalidIdResponse =
      validateItemId(itemId)

    if (invalidIdResponse) {
      return res
        .status(400)
        .json(invalidIdResponse)
    }

    if (!reason) {
      return res.status(400).json({
        error:
          'Debes seleccionar un motivo',

        code:
          'SKIP_REASON_REQUIRED',
      })
    }

    if (
      !ALLOWED_SKIP_REASONS.has(
        reason,
      )
    ) {
      return res.status(400).json({
        error:
          'El motivo seleccionado no es válido',

        code:
          'INVALID_SKIP_REASON',
      })
    }

    if (
      reason === 'OTHER' &&
      !notes
    ) {
      return res.status(400).json({
        error:
          'Describe el motivo por el cual no fue posible realizar la actividad',

        code:
          'SKIP_NOTES_REQUIRED',
      })
    }

    if (notes.length > 1000) {
      return res.status(400).json({
        error:
          'Las observaciones no pueden superar 1000 caracteres',

        code:
          'SKIP_NOTES_TOO_LONG',
      })
    }

    const client =
      await pool.connect()

    try {
      await client.query(
        'BEGIN',
      )

      const item =
        await getLockedOwnedItem(
          client,
          itemId,
          req.profile.id,
        )

      if (!item) {
        await client.query(
          'ROLLBACK',
        )

        return res.status(404).json({
          error:
            'La actividad no existe o no pertenece al usuario autenticado',

          code:
            'PLAN_ITEM_NOT_FOUND',
        })
      }

      const validation =
        validateExecutableItem(
          item,
          'PENDING',
        )

      if (validation) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(409)
          .json(validation)
      }

      const activeVisitResult =
        await client.query(
          `
          SELECT
            wpi.id

          FROM public.work_plan_item wpi

          INNER JOIN public.work_plan wp
            ON wp.id = wpi.plan_id

          WHERE wp.supervisor_id = $1
            AND wpi.status =
              'IN_PROGRESS'

          LIMIT 1

          FOR UPDATE OF wpi
          `,
          [
            req.profile.id,
          ],
        )

      if (
        activeVisitResult.rowCount >
        0
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res.status(409).json({
          error:
            'Debes finalizar la actividad activa antes de cerrar otra actividad',

          code:
            'ACTIVE_VISIT_EXISTS',

          activeItemId:
            activeVisitResult
              .rows[0]
              .id,
        })
      }

      await client.query(
        `
        UPDATE public.work_plan_item

        SET
          status = 'SKIPPED',

          skip_reason = $2,

          notes =
            NULLIF($3, ''),

          skipped_at = NOW(),
          skipped_by = $4,

          updated_by = $4,
          updated_at = NOW(),

          check_in_at = NULL,
          check_out_at = NULL,

          check_in_lat = NULL,
          check_in_lng = NULL,
          check_out_lat = NULL,
          check_out_lng = NULL,

          dwell_seconds = NULL

        WHERE id = $1
        `,
        [
          itemId,
          reason,
          notes,
          req.profile.id,
        ],
      )

      const completeItem =
        await getCompletePlanItem(
          client,
          itemId,
        )

        await appendWorkPlanEvent(
          client,
          {
            planId:
              item.plan_id,

            entityType:
              'PLAN_ITEM',

            entityId:
              itemId,

            revisionNumber:
              Number(
                item.revision_number ??
                0,
              ),

            eventType:
              'VISIT_SKIPPED',

            actor:
              req.profile,

            previousStatus:
              'PENDING',

            newStatus:
              'SKIPPED',

            comment:
              notes ||
              reason,

            beforeData:
              item,

            afterData:
              mapPlanItem(
                completeItem,
              ),

            metadata: {
              reason,
              notes:
                notes ||
                null,
            },
          },
        )

      if (!completeItem) {
        throw new Error(
          'La actividad omitida no pudo recuperarse',
        )
      }

      await client.query(
        'COMMIT',
      )

      return res.json({
        ok: true,

        item:
          mapPlanItem(
            completeItem,
          ),
      })
    } catch (error) {
      await rollbackSafely(
        client,
      )

      console.error(
        '[mobile.farmacias][skip]',
        error,
      )

      return res.status(500).json({
        error:
          'No fue posible cerrar la actividad',

        code:
          'SKIP_PLAN_ITEM_FAILED',
      })
    } finally {
      client.release()
    }
  },
)

/**
 * POST
 * /api/mobile/farmacias/items/:itemId/reschedule
 *
 * Reprograma una visita aprobada pendiente
 * a un día posterior dentro del mismo plan.
 *
 * No modifica la visita original:
 *
 * original -> RESCHEDULED
 * nueva     -> PENDING
 */
router.post(
  '/items/:itemId/reschedule',
  async (req, res) => {
    const itemId =
      req.params.itemId

    const scheduledDate =
      normalizeDateInput(
        req.body?.scheduledDate,
      )

    const scheduledTime =
      normalizeTimeInput(
        req.body?.scheduledTime,
      )

    const reason =
      String(
        req.body?.reason ??
        '',
      ).trim()

    const notes =
      String(
        req.body?.notes ??
        '',
      ).trim()

    const invalidIdResponse =
      validateItemId(
        itemId,
      )

    if (
      invalidIdResponse
    ) {
      return res
        .status(400)
        .json(
          invalidIdResponse,
        )
    }

    if (!scheduledDate) {
      return res.status(400).json({
        error:
          'Debes seleccionar la nueva fecha',

        code:
          'RESCHEDULE_DATE_REQUIRED',
      })
    }

    if (!reason) {
      return res.status(400).json({
        error:
          'Debes seleccionar un motivo de reprogramación',

        code:
          'RESCHEDULE_REASON_REQUIRED',
      })
    }

    if (
      !ALLOWED_RESCHEDULE_REASONS.has(
        reason,
      )
    ) {
      return res.status(400).json({
        error:
          'El motivo de reprogramación no es válido',

        code:
          'INVALID_RESCHEDULE_REASON',
      })
    }

    if (
      reason ===
        'OTHER' &&
      !notes
    ) {
      return res.status(400).json({
        error:
          'Describe el motivo de la reprogramación',

        code:
          'RESCHEDULE_NOTES_REQUIRED',
      })
    }

    if (
      notes.length >
      1000
    ) {
      return res.status(400).json({
        error:
          'Las observaciones no pueden superar 1000 caracteres',

        code:
          'RESCHEDULE_NOTES_TOO_LONG',
      })
    }

    const client =
      await pool.connect()

    try {
      await client.query(
        'BEGIN',
      )

      const item =
        await getLockedOwnedItem(
          client,
          itemId,
          req.profile.id,
        )

      if (!item) {
        await client.query(
          'ROLLBACK',
        )

        return res.status(404).json({
          error:
            'La actividad no existe o no pertenece al usuario autenticado',

          code:
            'PLAN_ITEM_NOT_FOUND',
        })
      }

      const validation =
        validateExecutableItem(
          item,
          'PENDING',
        )

      if (validation) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(409)
          .json(
            validation,
          )
      }

      if (
        item.item_type !==
          'PHARMACY' ||
        item.source !==
          'PLAN' ||
        !item.pharmacy_id
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res.status(409).json({
          error:
            'Esta función solo aplica a visitas programadas a unidades del plan.',

          code:
            'RESCHEDULE_NOT_ALLOWED_FOR_EXTRA_STOP',
        })
      }

      const todayResult =
        await client.query(
          `
          SELECT
            CURRENT_DATE::text
              AS today
          `,
        )

      const today =
        todayResult.rows[0]
          .today

      const periodEnd =
        normalizeDateValue(
          item.period_end,
        )

      if (
        scheduledDate <=
        today
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res.status(409).json({
          error:
            'La visita debe reprogramarse a un día posterior',

          code:
            'RESCHEDULE_DATE_NOT_FUTURE',
        })
      }

      if (
        scheduledDate >
        periodEnd
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res.status(409).json({
          error:
            'La nueva fecha debe permanecer dentro del periodo del plan aprobado',

          code:
            'RESCHEDULE_DATE_OUTSIDE_PLAN',
        })
      }

      const pharmacyAccess =
        await getPharmacyAccess(
          client,
          {
            pharmacyId:
              item.pharmacy_id,

            profile:
              req.profile,

            accessDate:
              scheduledDate,
          },
        )

      if (
        !pharmacyAccess.exists ||
        !pharmacyAccess.allowed
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res.status(403).json({
          error:
            'La unidad no está autorizada para el supervisor en la nueva fecha seleccionada.',

          code:
            'PHARMACY_ACCESS_NOT_ALLOWED',
        })
      }

      const activeVisitResult =
        await client.query(
          `
          SELECT
            wpi.id

          FROM public.work_plan_item wpi

          INNER JOIN public.work_plan wp
            ON wp.id =
              wpi.plan_id

          WHERE wp.supervisor_id =
              $1

            AND wpi.status =
              'IN_PROGRESS'

          LIMIT 1

          FOR UPDATE OF wpi
          `,
          [
            req.profile.id,
          ],
        )

      if (
        activeVisitResult.rowCount >
        0
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res.status(409).json({
          error:
            'Debes finalizar la actividad activa antes de reprogramar otra',

          code:
            'ACTIVE_VISIT_EXISTS',
        })
      }

      const originalResult =
        await client.query(
          `
          SELECT *

          FROM public.work_plan_item

          WHERE id = $1

          LIMIT 1
          `,
          [
            itemId,
          ],
        )

      const original =
        originalResult.rows[0]

      const orderResult =
        await client.query(
          `
          SELECT
            COALESCE(
              MAX(ord),
              0
            ) + 1
              AS next_order

          FROM public.work_plan_item

          WHERE plan_id = $1

            AND scheduled_date =
              $2::date

            AND removed_at
              IS NULL
          `,
          [
            item.plan_id,
            scheduledDate,
          ],
        )

      const newOrder =
        Number(
          orderResult
            .rows[0]
            .next_order,
        )

      const insertResult =
        await client.query(
          `
          INSERT INTO public.work_plan_item (
            plan_id,
            pharmacy_id,

            scheduled_date,
            scheduled_time,

            ord,
            required,

            status,

            item_type,
            source,

            custom_name,
            custom_address,
            google_place_id,
            custom_lat,
            custom_lng,

            activity_category,
            addition_reason,
            estimated_minutes,

            added_by,
            added_at,

            updated_by,
            updated_at,

            rescheduled_from_item_id
          )
          VALUES (
            $1,
            $2,

            $3::date,
            $4::time,

            $5,
            $6,

            'PENDING',

            $7,
            $8,

            $9,
            $10,
            $11,
            $12,
            $13,

            $14,
            $15,
            $16,

            $17,
            NOW(),

            $17,
            NOW(),

            $18
          )

          RETURNING id
          `,
          [
            original.plan_id,
            original.pharmacy_id,

            scheduledDate,
            scheduledTime,

            newOrder,
            original.required,

            original.item_type,
            original.source,

            original.custom_name,
            original.custom_address,
            original.google_place_id,
            original.custom_lat,
            original.custom_lng,

            original.activity_category,
            original.addition_reason,
            original.estimated_minutes,

            req.profile.id,
            itemId,
          ],
        )

      const newItemId =
        insertResult
          .rows[0]
          .id

      await client.query(
        `
        UPDATE public.work_plan_item

        SET
          status =
            'RESCHEDULED',

          rescheduled_to_item_id =
            $2,

          reschedule_reason =
            $3,

          reschedule_notes =
            NULLIF(
              $4,
              ''
            ),

          rescheduled_at =
            NOW(),

          rescheduled_by =
            $5,

          updated_by =
            $5,

          updated_at =
            NOW()

        WHERE id = $1
        `,
        [
          itemId,
          newItemId,
          reason,
          notes,
          req.profile.id,
        ],
      )

      const oldCompleteItem =
        await getCompletePlanItem(
          client,
          itemId,
        )

      const newCompleteItem =
        await getCompletePlanItem(
          client,
          newItemId,
        )

      await appendWorkPlanEvent(
        client,
        {
          planId:
            item.plan_id,

          entityType:
            'PLAN_ITEM',

          entityId:
            itemId,

          revisionNumber:
            Number(
              item.revision_number ??
              0,
            ),

          eventType:
            'VISIT_RESCHEDULED',

          actor:
            req.profile,

          previousStatus:
            'PENDING',

          newStatus:
            'RESCHEDULED',

          comment:
            notes ||
            reason,

          beforeData:
            original,

          afterData:
            oldCompleteItem
              ? mapPlanItem(
                  oldCompleteItem,
                )
              : null,

          metadata: {
            reason,

            originalDate:
              normalizeDateValue(
                item.scheduled_date,
              ),

            newDate:
              scheduledDate,

            newTime:
              scheduledTime,

            newItemId,
          },
        },
      )

      await appendWorkPlanEvent(
        client,
        {
          planId:
            item.plan_id,

          entityType:
            'PLAN_ITEM',

          entityId:
            newItemId,

          revisionNumber:
            Number(
              item.revision_number ??
              0,
            ),

          eventType:
            'VISIT_RESCHEDULED_CREATED',

          actor:
            req.profile,

          previousStatus:
            null,

          newStatus:
            'PENDING',

          afterData:
            newCompleteItem
              ? mapPlanItem(
                  newCompleteItem,
                )
              : null,

          metadata: {
            originalItemId:
              itemId,

            reason,
          },
        },
      )

      await client.query(
        'COMMIT',
      )

      return res.status(201).json({
        ok: true,

        originalItem:
          oldCompleteItem
            ? mapPlanItem(
                oldCompleteItem,
              )
            : null,

        newItem:
          newCompleteItem
            ? mapPlanItem(
                newCompleteItem,
              )
            : null,
      })
    } catch (error) {
      await rollbackSafely(
        client,
      )

      console.error(
        '[mobile.farmacias][reschedule]',
        error,
      )

      return res.status(500).json({
        error:
          'No fue posible reprogramar la actividad',

        code:
          'RESCHEDULE_PLAN_ITEM_FAILED',
      })
    } finally {
      client.release()
    }
  },
)

/**
 * POST
 * /api/mobile/farmacias/items/:itemId/request-cancellation
 *
 * El supervisor NO cancela una visita
 * perteneciente a un plan aprobado.
 *
 * Registra una solicitud para revisión.
 */
router.post(
  '/items/:itemId/request-cancellation',
  async (req, res) => {
    const itemId =
      req.params.itemId

    const reason =
      String(
        req.body?.reason ??
        '',
      ).trim()

    const notes =
      String(
        req.body?.notes ??
        '',
      ).trim()

    const invalidIdResponse =
      validateItemId(
        itemId,
      )

    if (
      invalidIdResponse
    ) {
      return res
        .status(400)
        .json(
          invalidIdResponse,
        )
    }

    if (!reason) {
      return res.status(400).json({
        error:
          'Debes seleccionar un motivo',

        code:
          'CANCELLATION_REQUEST_REASON_REQUIRED',
      })
    }

    if (
      !ALLOWED_CANCELLATION_REQUEST_REASONS.has(
        reason,
      )
    ) {
      return res.status(400).json({
        error:
          'El motivo seleccionado no es válido',

        code:
          'INVALID_CANCELLATION_REQUEST_REASON',
      })
    }

    if (
      reason ===
        'OTHER' &&
      !notes
    ) {
      return res.status(400).json({
        error:
          'Describe el motivo de la solicitud',

        code:
          'CANCELLATION_REQUEST_NOTES_REQUIRED',
      })
    }

    if (
      notes.length >
      1000
    ) {
      return res.status(400).json({
        error:
          'Las observaciones no pueden superar 1000 caracteres',

        code:
          'CANCELLATION_REQUEST_NOTES_TOO_LONG',
      })
    }

    const client =
      await pool.connect()

    try {
      await client.query(
        'BEGIN',
      )

      const item =
        await getLockedOwnedItem(
          client,
          itemId,
          req.profile.id,
        )

      if (!item) {
        await client.query(
          'ROLLBACK',
        )

        return res.status(404).json({
          error:
            'La actividad no existe o no pertenece al usuario autenticado',

          code:
            'PLAN_ITEM_NOT_FOUND',
        })
      }

      const validation =
        validateExecutableItem(
          item,
          'PENDING',
        )

      if (validation) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(409)
          .json(
            validation,
          )
      }

      if (
        item.item_type !==
          'PHARMACY' ||
        item.source !==
          'PLAN'
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res.status(409).json({
          error:
            'Las paradas adicionales utilizan su propio flujo de cancelación',

          code:
            'CANCELLATION_REQUEST_NOT_ALLOWED_FOR_EXTRA_STOP',
        })
      }

      const activeVisitResult =
        await client.query(
          `
          SELECT
            wpi.id

          FROM public.work_plan_item wpi

          INNER JOIN public.work_plan wp
            ON wp.id =
              wpi.plan_id

          WHERE wp.supervisor_id =
              $1

            AND wpi.status =
              'IN_PROGRESS'

          LIMIT 1

          FOR UPDATE OF wpi
          `,
          [
            req.profile.id,
          ],
        )

      if (
        activeVisitResult.rowCount >
        0
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res.status(409).json({
          error:
            'Debes finalizar la actividad activa antes de solicitar la cancelación de otra',

          code:
            'ACTIVE_VISIT_EXISTS',
        })
      }

      await client.query(
        `
        UPDATE public.work_plan_item

        SET
          cancellation_request_status =
            'PENDING',

          cancellation_request_reason =
            $2,

          cancellation_request_notes =
            NULLIF(
              $3,
              ''
            ),

          cancellation_requested_at =
            NOW(),

          cancellation_requested_by =
            $4,

          cancellation_reviewed_at =
            NULL,

          cancellation_reviewed_by =
            NULL,

          cancellation_review_comment =
            NULL,

          updated_by =
            $4,

          updated_at =
            NOW()

        WHERE id = $1
        `,
        [
          itemId,
          reason,
          notes,
          req.profile.id,
        ],
      )

      const completeItem =
        await getCompletePlanItem(
          client,
          itemId,
        )

      await appendWorkPlanEvent(
        client,
        {
          planId:
            item.plan_id,

          entityType:
            'PLAN_ITEM',

          entityId:
            itemId,

          revisionNumber:
            Number(
              item.revision_number ??
              0,
            ),

          eventType:
            'VISIT_CANCELLATION_REQUESTED',

          actor:
            req.profile,

          previousStatus:
            'PENDING',

          newStatus:
            'PENDING',

          comment:
            notes ||
            reason,

          beforeData:
            item,

          afterData:
            completeItem
              ? mapPlanItem(
                  completeItem,
                )
              : null,

          metadata: {
            reason,

            notes:
              notes ||
              null,
          },
        },
      )

      await client.query(
        'COMMIT',
      )

      return res.status(201).json({
        ok: true,

        item:
          completeItem
            ? mapPlanItem(
                completeItem,
              )
            : null,
      })
    } catch (error) {
      await rollbackSafely(
        client,
      )

      console.error(
        '[mobile.farmacias][request-cancellation]',
        error,
      )

      return res.status(500).json({
        error:
          'No fue posible solicitar la cancelación',

        code:
          'CANCELLATION_REQUEST_FAILED',
      })
    } finally {
      client.release()
    }
  },
)

async function getLockedOwnedItem(
  client,
  itemId,
  supervisorId,
) {
  const result =
    await client.query(
      `
      SELECT
        wpi.id,
        wpi.plan_id,
        wpi.pharmacy_id,

        wpi.item_type,
        wpi.source,

        wpi.status,
        wpi.scheduled_date,
        wpi.scheduled_time,
        wpi.ord,
        wpi.required,

        wpi.check_in_at,

        wpi.cancellation_request_status,

        wp.status
          AS plan_status,

        wp.plan_type,
        wp.period_start,
        wp.period_end,
        wp.revision_number,

        (
          wpi.scheduled_date =
            CURRENT_DATE
        ) AS is_today

      FROM public.work_plan_item wpi

      INNER JOIN public.work_plan wp
        ON wp.id =
          wpi.plan_id

      WHERE wpi.id = $1

        AND wp.supervisor_id = $2

        AND wp.archived_at
          IS NULL

        AND wpi.removed_at
          IS NULL

      FOR UPDATE OF wpi
      `,
      [
        itemId,
        supervisorId,
      ],
    )

  return result.rows[0] ??
    null
}

function validateExecutableItem(
  item,
  expectedStatus,
) {
  if (
    item.plan_status !==
    'APPROVED'
  ) {
    return {
      error:
        'El plan de trabajo no está autorizado',

      code:
        'PLAN_NOT_APPROVED',
    }
  }

  if (!item.is_today) {
    return {
      error:
        'La actividad no está programada para hoy',

      code:
        'ITEM_NOT_SCHEDULED_TODAY',
    }
  }

  if (
    item.cancellation_request_status ===
    'PENDING'
  ) {
    return {
      error:
        'La actividad tiene una solicitud de cancelación pendiente de revisión',

      code:
        'CANCELLATION_REQUEST_PENDING',
    }
  }

  if (
    item.status !==
    expectedStatus
  ) {
    return {
      error:
        'La actividad ya no se encuentra pendiente',

      code:
        'ITEM_NOT_PENDING',
    }
  }

  return null
}

async function getCompletePlanItem(
  client,
  itemId,
) {
  const result =
    await client.query(
      `
      ${PLAN_ITEM_SELECT}

      WHERE wpi.id = $1

      LIMIT 1
      `,
      [itemId],
    )

  return result.rows[0] ??
    null
}

async function loadSupervisorProfile(
  req,
  res,
  next,
) {
  try {
    const result =
      await pool.query(
        `
        SELECT
          id,
          nombre,
          area,
          rol,
          activo,
          superior_id,
          pharmacy_scope_mode

        FROM public.personas

        WHERE auth_user_id = $1

        LIMIT 1
        `,
        [
          req.auth.user.id,
        ],
      )

    if (
      result.rowCount === 0
    ) {
      return res.status(403).json({
        error:
          'La cuenta no tiene un perfil operativo vinculado',

        code:
          'PROFILE_NOT_FOUND',
      })
    }

    const profile =
      result.rows[0]

    if (!profile.activo) {
      return res.status(403).json({
        error:
          'El perfil operativo se encuentra inactivo',

        code:
          'PROFILE_INACTIVE',
      })
    }

    if (
      profile.area !==
        'FARMACIAS' ||
      profile.rol !==
        'SUPERVISOR'
    ) {
      return res.status(403).json({
        error:
          'Esta función está disponible únicamente para supervisores de Farmacias',

        code:
          'ROLE_NOT_ALLOWED',
      })
    }

    req.profile =
      profile

    return next()
  } catch (error) {
    console.error(
      '[mobile.farmacias][profile]',
      error,
    )

    return res.status(500).json({
      error:
        'No fue posible validar el perfil operativo',

      code:
        'PROFILE_VALIDATION_FAILED',
    })
  }
}

function validateItemId(
  itemId,
) {
  if (
    UUID_PATTERN.test(
      itemId,
    )
  ) {
    return null
  }

  return {
    error:
      'El identificador de la actividad no es válido',

    code:
      'INVALID_PLAN_ITEM_ID',
  }
}

function parseCoordinates(
  body = {},
) {
  const lat =
    Number(body.lat)

  const lng =
    Number(body.lng)

  if (
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90
  ) {
    return {
      ok: false,

      error:
        'La latitud no es válida',
    }
  }

  if (
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180
  ) {
    return {
      ok: false,

      error:
        'La longitud no es válida',
    }
  }

  return {
    ok: true,
    lat,
    lng,
  }
}

function mapPlanItem(row) {
  const itemType =
    row.item_type ??
    (
      row.pharmacy_id ==
      null
        ? 'EXTRA_STOP'
        : 'PHARMACY'
    )

  const source =
    row.source ??
    (
      itemType ===
      'EXTRA_STOP'
        ? 'SUPERVISOR_ADHOC'
        : 'PLAN'
    )

  const name =
    row.name ??
    row.custom_name ??
    row.clues ??
    'Actividad sin nombre'

  const address =
    row.direccion ??
    row.custom_address ??
    null

  const lat =
    row.lat ??
    row.custom_lat ??
    null

  const lng =
    row.lng ??
    row.custom_lng ??
    null

  return {
    id:
      row.plan_item_id ??
      row.id,

    planId:
      row.plan_id ??
      null,

    pharmacyId:
      row.pharmacy_id ==
      null
        ? null
        : String(
            row.pharmacy_id,
          ),

    itemType,
    source,

    clues:
      row.clues ??
      null,

    name,
    address,

    region:
      row.region_sanitaria ??
      null,

    project:
      row.proyecto ??
      null,

    lat:
      toNullableNumber(
        lat,
      ),

    lng:
      toNullableNumber(
        lng,
      ),

    googlePlaceId:
      row.google_place_id ??
      null,

    activityCategory:
      row.activity_category ??
      null,

    additionReason:
      row.addition_reason ??
      null,

    estimatedMinutes:
      toNullableNumber(
        row.estimated_minutes,
      ),

    addedBy:
      row.added_by ??
      null,

    addedAt:
      row.added_at ??
      null,

    updatedBy:
      row.updated_by ??
      null,

    updatedAt:
      row.updated_at ??
      null,

    scheduledDate:
      row.scheduled_date ??
      null,

    scheduledTime:
      row.scheduled_time ??
      null,

    order:
      Number(
        row.ord ??
        0,
      ),

    required:
      row.required ==
      null
        ? true
        : Boolean(
            row.required,
          ),

    status:
      row.status,

    checkInAt:
      row.check_in_at ??
      null,

    checkOutAt:
      row.check_out_at ??
      null,

    checkInLat:
      toNullableNumber(
        row.check_in_lat,
      ),

    checkInLng:
      toNullableNumber(
        row.check_in_lng,
      ),

    checkOutLat:
      toNullableNumber(
        row.check_out_lat,
      ),

    checkOutLng:
      toNullableNumber(
        row.check_out_lng,
      ),

    dwellSeconds:
      toNullableNumber(
        row.dwell_seconds,
      ),

    notes:
      row.notes ??
      null,

    skipReason:
      row.skip_reason ??
      null,

    skippedAt:
      row.skipped_at ??
      null,

    skippedBy:
      row.skipped_by ??
      null,

    rescheduledFromItemId:
      row.rescheduled_from_item_id ??
      null,

    rescheduledToItemId:
      row.rescheduled_to_item_id ??
      null,

    rescheduleReason:
      row.reschedule_reason ??
      null,

    rescheduleNotes:
      row.reschedule_notes ??
      null,

    rescheduledAt:
      row.rescheduled_at ??
      null,

    rescheduledBy:
      row.rescheduled_by ??
      null,

    cancellationRequestStatus:
      row.cancellation_request_status ??
      null,

    cancellationRequestReason:
      row.cancellation_request_reason ??
      null,

    cancellationRequestNotes:
      row.cancellation_request_notes ??
      null,

    cancellationRequestedAt:
      row.cancellation_requested_at ??
      null,

    cancellationRequestedBy:
      row.cancellation_requested_by ??
      null,

    cancellationReviewedAt:
      row.cancellation_reviewed_at ??
      null,

    cancellationReviewedBy:
      row.cancellation_reviewed_by ??
      null,

    cancellationReviewComment:
      row.cancellation_review_comment ??
      null,

    cancellationReason:
      row.cancellation_reason ??
      null,

    cancellationNotes:
      row.cancellation_notes ??
      null,

    cancelledAt:
      row.cancelled_at ??
      null,

    cancelledBy:
      row.cancelled_by ??
      null,
  }
}

function toNullableNumber(
  value,
) {
  if (value == null) {
    return null
  }

  const numberValue =
    Number(value)

  return Number.isFinite(
    numberValue,
  )
    ? numberValue
    : null
}

function normalizeDateValue(
  value,
) {
  if (
    value instanceof Date
  ) {
    return value
      .toISOString()
      .slice(
        0,
        10,
      )
  }

  return String(
    value ?? '',
  ).slice(
    0,
    10,
  )
}

function normalizeDateInput(
  value,
) {
  const normalized =
    String(
      value ?? '',
    ).trim()

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      normalized,
    )
  ) {
    return null
  }

  return normalized
}

function normalizeTimeInput(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() ===
      ''
  ) {
    return null
  }

  const normalized =
    String(
      value,
    ).trim()

  const match =
    normalized.match(
      /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/,
    )

  if (!match) {
    return null
  }

  return `${match[1]}:${match[2]}:00`
}

async function rollbackSafely(
  client,
) {
  try {
    await client.query(
      'ROLLBACK',
    )
  } catch (rollbackError) {
    console.error(
      '[mobile.farmacias][rollback]',
      rollbackError,
    )
  }
}

export default router
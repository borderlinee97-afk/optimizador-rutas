import { Router } from 'express'

import { pool } from '../db/pool.js'
import { requireAuth } from '../middleware/requireAuth.js'
import {
  appendWorkPlanEvent,
} from '../services/workPlanAudit.service.js'

const router = Router()

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

router.use(requireAuth)
router.use(loadFarmaciasProfile)
router.use(requireManager)

/**
 * GET
 * /api/mobile/work-plans/approvals/pending
 *
 * Devuelve únicamente planes PENDING_APPROVAL
 * correspondientes a supervisores bajo la
 * estructura del gerente autenticado.
 */
router.get(
  '/pending',
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            wp.id,
            wp.supervisor_id,
            wp.status,
            wp.plan_type,
            wp.period_start,
            wp.period_end,
            wp.revision_number,

            wp.created_by,
            wp.created_at,
            wp.updated_by,
            wp.updated_at,

            wp.submitted_by,
            wp.submitted_at,

            wp.approved_by,
            wp.approved_at,

            wp.rejected_by,
            wp.rejected_at,
            wp.rejection_comment,

            wp.archived_by,
            wp.archived_at,

            supervisor.nombre
              AS supervisor_name,

            coordinator.id
              AS coordinator_id,

            coordinator.nombre
              AS coordinator_name,

            COUNT(wpi.id)
              FILTER (
                WHERE wpi.removed_at
                  IS NULL
              ) AS total_items,

            COUNT(wpi.id)
              FILTER (
                WHERE wpi.removed_at
                  IS NULL
                AND wpi.status =
                  'PENDING'
              ) AS pending_items,

            COUNT(wpi.id)
              FILTER (
                WHERE wpi.removed_at
                  IS NULL
                AND wpi.status =
                  'IN_PROGRESS'
              ) AS in_progress_items,

            COUNT(wpi.id)
              FILTER (
                WHERE wpi.removed_at
                  IS NULL
                AND wpi.status =
                  'DONE'
              ) AS done_items,

            COUNT(wpi.id)
              FILTER (
                WHERE wpi.removed_at
                  IS NULL
                AND wpi.status =
                  'SKIPPED'
              ) AS skipped_items,

            COUNT(wpi.id)
              FILTER (
                WHERE wpi.removed_at
                  IS NULL
                AND wpi.status =
                  'CANCELLED'
              ) AS cancelled_items

          FROM public.work_plan wp

          INNER JOIN public.personas
            supervisor

            ON supervisor.id =
              wp.supervisor_id

          LEFT JOIN public.personas
            coordinator

            ON coordinator.id =
              supervisor.superior_id

            AND coordinator.area =
              'FARMACIAS'

            AND coordinator.rol =
              'COORDINADOR'

          LEFT JOIN public.work_plan_item wpi
            ON wpi.plan_id =
              wp.id

          WHERE wp.status =
              'PENDING_APPROVAL'

            AND wp.archived_at
              IS NULL

            AND supervisor.area =
              'FARMACIAS'

            AND supervisor.rol =
              'SUPERVISOR'

            AND supervisor.activo =
              TRUE

            AND (
              supervisor.superior_id =
                $1

              OR coordinator.superior_id =
                $1
            )

          GROUP BY
            wp.id,
            supervisor.nombre,
            coordinator.id,
            coordinator.nombre

          ORDER BY
            wp.submitted_at ASC
              NULLS LAST,
            wp.period_start ASC,
            supervisor.nombre ASC
          `,
          [
            req.profile.id,
          ],
        )

      return res.json({
        pendingCount:
          result.rowCount,

        plans:
          result.rows.map(
            mapApprovalSummary,
          ),
      })
    } catch (error) {
      console.error(
        '[mobile.work-plan-approvals][pending]',
        error,
      )

      return res.status(500).json({
        error:
          'No fue posible obtener los planes pendientes de aprobación',

        code:
          'WORK_PLAN_APPROVALS_FETCH_FAILED',
      })
    }
  },
)

/**
 * GET
 * /api/mobile/work-plans/approvals/cancellation-requests/pending
 *
 * Solicitudes de cancelación pendientes
 * correspondientes a supervisores dentro
 * de la estructura del gerente autenticado.
 */
router.get(
  '/cancellation-requests/pending',
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            wpi.id
              AS item_id,

            wpi.plan_id,
            wpi.pharmacy_id,

            wpi.scheduled_date,
            wpi.scheduled_time::text,

            wpi.required,
            wpi.status,

            wpi.cancellation_request_status,
            wpi.cancellation_request_reason,
            wpi.cancellation_request_notes,
            wpi.cancellation_requested_at,
            wpi.cancellation_requested_by,

            wp.plan_type,
            wp.period_start,
            wp.period_end,
            wp.revision_number,

            supervisor.id
              AS supervisor_id,

            supervisor.nombre
              AS supervisor_name,

            coordinator.id
              AS coordinator_id,

            coordinator.nombre
              AS coordinator_name,

            f.clues,

            COALESCE(
              NULLIF(
                TRIM(
                  f.unidad
                ),
                ''
              ),
              f.clues,
              'Farmacia sin nombre'
            ) AS name,

            f.direccion
              AS address,

            f.region_sanitaria,
            f.proyecto

          FROM public.work_plan_item wpi

          INNER JOIN public.work_plan wp
            ON wp.id =
              wpi.plan_id

          INNER JOIN public.personas supervisor
            ON supervisor.id =
              wp.supervisor_id

          LEFT JOIN public.personas coordinator
            ON coordinator.id =
              supervisor.superior_id

            AND coordinator.area =
              'FARMACIAS'

            AND coordinator.rol =
              'COORDINADOR'

          LEFT JOIN public.farmacia f
            ON f.id =
              wpi.pharmacy_id

          WHERE
            wpi.cancellation_request_status =
              'PENDING'

            AND wpi.status =
              'PENDING'

            AND wpi.item_type =
              'PHARMACY'

            AND wpi.source =
              'PLAN'

            AND wpi.removed_at
              IS NULL

            AND wp.status =
              'APPROVED'

            AND wp.archived_at
              IS NULL

            AND supervisor.area =
              'FARMACIAS'

            AND supervisor.rol =
              'SUPERVISOR'

            AND supervisor.activo =
              TRUE

            AND (
              supervisor.superior_id =
                $1

              OR coordinator.superior_id =
                $1
            )

          ORDER BY
            wpi.cancellation_requested_at ASC,
            wpi.scheduled_date ASC,
            wpi.scheduled_time ASC
              NULLS LAST
          `,
          [
            req.profile.id,
          ],
        )

      return res.json({
        pendingCount:
          result.rowCount,

        requests:
          result.rows.map(
            mapCancellationRequest,
          ),
      })
    } catch (error) {
      console.error(
        '[mobile.work-plan-approvals][cancellation-requests][pending]',
        error,
      )

      return res.status(500).json({
        error:
          'No fue posible obtener las solicitudes de cancelación',

        code:
          'CANCELLATION_REQUESTS_FETCH_FAILED',
      })
    }
  },
)

/**
 * GET
 * /api/mobile/work-plans/approvals/:planId
 *
 * Detalle de un plan visible para el gerente.
 */
router.get(
  '/:planId',
  async (req, res) => {
    const planId =
      req.params.planId

    if (
      !UUID_PATTERN.test(
        planId,
      )
    ) {
      return res.status(400).json({
        error:
          'El identificador del plan no es válido',

        code:
          'INVALID_WORK_PLAN_ID',
      })
    }

    try {
      const planResult =
        await pool.query(
          `
          SELECT
            wp.*,

            supervisor.nombre
              AS supervisor_name,

            coordinator.id
              AS coordinator_id,

            coordinator.nombre
              AS coordinator_name

          FROM public.work_plan wp

          INNER JOIN public.personas
            supervisor

            ON supervisor.id =
              wp.supervisor_id

          LEFT JOIN public.personas
            coordinator

            ON coordinator.id =
              supervisor.superior_id

            AND coordinator.area =
              'FARMACIAS'

            AND coordinator.rol =
              'COORDINADOR'

          WHERE wp.id = $1

            AND supervisor.area =
              'FARMACIAS'

            AND supervisor.rol =
              'SUPERVISOR'

            AND (
              supervisor.superior_id =
                $2

              OR coordinator.superior_id =
                $2
            )

          LIMIT 1
          `,
          [
            planId,
            req.profile.id,
          ],
        )

      if (
        planResult.rowCount ===
        0
      ) {
        return res.status(404).json({
          error:
            'El plan no existe o no pertenece a la estructura del gerente',

          code:
            'WORK_PLAN_APPROVAL_NOT_FOUND',
        })
      }

      const itemsResult =
        await pool.query(
          `
          SELECT
            wpi.id,
            wpi.plan_id,
            wpi.pharmacy_id,

            wpi.item_type,
            wpi.source,

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
            ) AS address,

            f.clues,
            f.region_sanitaria,
            f.proyecto,
            f.estado,

            f.estatus::text
              AS pharmacy_status,

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

            wpi.scheduled_date,
            wpi.scheduled_time::text,
            wpi.ord,
            wpi.required,
            wpi.status,

            wpi.added_by,
            wpi.added_at,

            wpi.updated_by,
            wpi.updated_at,

            wpi.removed_by,
            wpi.removed_at,
            wpi.removal_reason

          FROM public.work_plan_item wpi

          LEFT JOIN public.farmacia f
            ON f.id =
              wpi.pharmacy_id

          WHERE wpi.plan_id = $1
            AND wpi.removed_at
              IS NULL

          ORDER BY
            wpi.scheduled_date ASC,
            wpi.ord ASC,
            wpi.scheduled_time ASC
              NULLS LAST
          `,
          [
            planId,
          ],
        )

      const revisionsResult =
        await pool.query(
          `
          SELECT
            id,
            plan_id,
            revision_number,
            status,
            submitted_by,
            submitted_at,
            reviewed_by,
            reviewed_at,
            review_comment,
            created_at,
            updated_at

          FROM public.work_plan_revision

          WHERE plan_id = $1

          ORDER BY
            revision_number DESC
          `,
          [
            planId,
          ],
        )

      const eventsResult =
        await pool.query(
          `
          SELECT
            id,
            plan_id,
            entity_type,
            entity_id,
            revision_number,
            event_type,

            actor_id,
            actor_area,
            actor_role,

            previous_status,
            new_status,

            comment,
            before_data,
            after_data,
            metadata,
            created_at

          FROM public.work_plan_event

          WHERE plan_id = $1

          ORDER BY
            created_at DESC

          LIMIT 200
          `,
          [
            planId,
          ],
        )

      return res.json({
        plan:
          mapPlan(
            planResult.rows[0],
          ),

        supervisor: {
          id:
            planResult
              .rows[0]
              .supervisor_id,

          name:
            planResult
              .rows[0]
              .supervisor_name,

          coordinatorId:
            planResult
              .rows[0]
              .coordinator_id,

          coordinatorName:
            planResult
              .rows[0]
              .coordinator_name,
        },

        items:
          itemsResult.rows.map(
            mapPlanItem,
          ),

        revisions:
          revisionsResult.rows.map(
            mapRevision,
          ),

        events:
          eventsResult.rows.map(
            mapEvent,
          ),
      })
    } catch (error) {
      console.error(
        '[mobile.work-plan-approvals][detail]',
        error,
      )

      return res.status(500).json({
        error:
          'No fue posible obtener el detalle del plan',

        code:
          'WORK_PLAN_APPROVAL_DETAIL_FAILED',
      })
    }
  },
)

/**
 * POST
 * /api/mobile/work-plans/approvals/:planId/approve
 */
router.post(
  '/:planId/approve',
  async (req, res) => {
    const planId =
      req.params.planId

    if (
      !UUID_PATTERN.test(
        planId,
      )
    ) {
      return res.status(400).json({
        error:
          'El identificador del plan no es válido',

        code:
          'INVALID_WORK_PLAN_ID',
      })
    }

    const client =
      await pool.connect()

    try {
      await client.query(
        'BEGIN',
      )

      const plan =
        await lockManagerPlan(
          client,
          planId,
          req.profile.id,
        )

      const validationError =
        validatePendingPlan(
          plan,
        )

      if (
        validationError
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(
            validationError.status,
          )
          .json(
            validationError.response,
          )
      }

      const itemsResult =
        await client.query(
          `
          SELECT COUNT(*) AS total

          FROM public.work_plan_item

          WHERE plan_id = $1
            AND removed_at
              IS NULL
          `,
          [
            planId,
          ],
        )

      if (
        Number(
          itemsResult
            .rows[0]
            .total,
        ) === 0
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res.status(409).json({
          error:
            'No puede aprobarse un plan sin visitas',

          code:
            'WORK_PLAN_WITHOUT_ITEMS',
        })
      }

      const updateResult =
        await client.query(
          `
          UPDATE public.work_plan

          SET
            status =
              'APPROVED',

            approved_by = $2,
            approved_at = NOW(),

            rejected_by = NULL,
            rejected_at = NULL,
            rejection_comment = NULL,

            updated_by = $2

          WHERE id = $1

          RETURNING *
          `,
          [
            planId,
            req.profile.id,
          ],
        )

      const approvedPlan =
        updateResult.rows[0]

      await client.query(
        `
        UPDATE public.work_plan_revision

        SET
          status =
            'APPROVED',

          reviewed_by = $3,
          reviewed_at = NOW(),
          review_comment = NULL,

          updated_at = NOW()

        WHERE plan_id = $1
          AND revision_number = $2
        `,
        [
          planId,
          approvedPlan
            .revision_number,
          req.profile.id,
        ],
      )

      await appendWorkPlanEvent(
        client,
        {
          planId,

          entityType:
            'REVISION',

          entityId:
            planId,

          revisionNumber:
            Number(
              approvedPlan
                .revision_number,
            ),

          eventType:
            'PLAN_APPROVED',

          actor:
            req.profile,

          previousStatus:
            'PENDING_APPROVAL',

          newStatus:
            'APPROVED',

          beforeData:
            plan,

          afterData:
            approvedPlan,
        },
      )

      await client.query(
        'COMMIT',
      )

      return res.json({
        ok: true,

        plan:
          mapPlan(
            approvedPlan,
          ),
      })
    } catch (error) {
      await rollbackSafely(
        client,
      )

      console.error(
        '[mobile.work-plan-approvals][approve]',
        error,
      )

      return res.status(500).json({
        error:
          'No fue posible aprobar el plan',

        code:
          'WORK_PLAN_APPROVE_FAILED',
      })
    } finally {
      client.release()
    }
  },
)

/**
 * POST
 * /api/mobile/work-plans/approvals/:planId/reject
 *
 * comment es obligatorio.
 */
router.post(
  '/:planId/reject',
  async (req, res) => {
    const planId =
      req.params.planId

    if (
      !UUID_PATTERN.test(
        planId,
      )
    ) {
      return res.status(400).json({
        error:
          'El identificador del plan no es válido',

        code:
          'INVALID_WORK_PLAN_ID',
      })
    }

    const comment =
      normalizeOptionalText(
        req.body?.comment,
      )

    if (!comment) {
      return res.status(400).json({
        error:
          'Debes indicar el motivo del rechazo',

        code:
          'REJECTION_COMMENT_REQUIRED',
      })
    }

    if (
      comment.length >
      2000
    ) {
      return res.status(400).json({
        error:
          'El motivo del rechazo no puede superar 2000 caracteres',

        code:
          'REJECTION_COMMENT_TOO_LONG',
      })
    }

    const client =
      await pool.connect()

    try {
      await client.query(
        'BEGIN',
      )

      const plan =
        await lockManagerPlan(
          client,
          planId,
          req.profile.id,
        )

      const validationError =
        validatePendingPlan(
          plan,
        )

      if (
        validationError
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(
            validationError.status,
          )
          .json(
            validationError.response,
          )
      }

      const updateResult =
        await client.query(
          `
          UPDATE public.work_plan

          SET
            status =
              'REJECTED',

            rejected_by = $2,
            rejected_at = NOW(),
            rejection_comment = $3,

            approved_by = NULL,
            approved_at = NULL,

            updated_by = $2

          WHERE id = $1

          RETURNING *
          `,
          [
            planId,
            req.profile.id,
            comment,
          ],
        )

      const rejectedPlan =
        updateResult.rows[0]

      await client.query(
        `
        UPDATE public.work_plan_revision

        SET
          status =
            'REJECTED',

          reviewed_by = $3,
          reviewed_at = NOW(),
          review_comment = $4,

          updated_at = NOW()

        WHERE plan_id = $1
          AND revision_number = $2
        `,
        [
          planId,
          rejectedPlan
            .revision_number,
          req.profile.id,
          comment,
        ],
      )

      await appendWorkPlanEvent(
        client,
        {
          planId,

          entityType:
            'REVISION',

          entityId:
            planId,

          revisionNumber:
            Number(
              rejectedPlan
                .revision_number,
            ),

          eventType:
            'PLAN_REJECTED',

          actor:
            req.profile,

          previousStatus:
            'PENDING_APPROVAL',

          newStatus:
            'REJECTED',

          comment,

          beforeData:
            plan,

          afterData:
            rejectedPlan,
        },
      )

      await client.query(
        'COMMIT',
      )

      return res.json({
        ok: true,

        plan:
          mapPlan(
            rejectedPlan,
          ),
      })
    } catch (error) {
      await rollbackSafely(
        client,
      )

      console.error(
        '[mobile.work-plan-approvals][reject]',
        error,
      )

      return res.status(500).json({
        error:
          'No fue posible rechazar el plan',

        code:
          'WORK_PLAN_REJECT_FAILED',
      })
    } finally {
      client.release()
    }
  },
)

/**
 * POST
 * /api/mobile/work-plans/approvals/cancellation-requests/:itemId/approve
 */
router.post(
  '/cancellation-requests/:itemId/approve',
  async (req, res) => {
    const itemId =
      req.params.itemId

    if (
      !UUID_PATTERN.test(
        itemId,
      )
    ) {
      return res.status(400).json({
        error:
          'El identificador de la visita no es válido',

        code:
          'INVALID_PLAN_ITEM_ID',
      })
    }

    const client =
      await pool.connect()

    try {
      await client.query(
        'BEGIN',
      )

      const item =
        await lockManagerCancellationRequest(
          client,
          itemId,
          req.profile.id,
        )

      const validationError =
        validatePendingCancellationRequest(
          item,
        )

      if (validationError) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(
            validationError.status,
          )
          .json(
            validationError.response,
          )
      }

      const updateResult =
        await client.query(
          `
          UPDATE public.work_plan_item

          SET
            status =
              'CANCELLED',

            cancellation_request_status =
              'APPROVED',

            cancellation_reviewed_at =
              NOW(),

            cancellation_reviewed_by =
              $2,

            cancellation_review_comment =
              NULL,

            cancelled_at =
              NOW(),

            cancelled_by =
              $2,

            updated_by =
              $2,

            updated_at =
              NOW()

          WHERE id = $1

          RETURNING *
          `,
          [
            itemId,
            req.profile.id,
          ],
        )

      const updatedItem =
        updateResult.rows[0]

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
            'VISIT_CANCELLATION_APPROVED',

          actor:
            req.profile,

          previousStatus:
            'PENDING',

          newStatus:
            'CANCELLED',

          beforeData:
            item,

          afterData:
            updatedItem,

          metadata: {
            cancellationRequestReason:
              item.cancellation_request_reason,

            requestedBy:
              item.cancellation_requested_by,
          },
        },
      )

      await client.query(
        'COMMIT',
      )

      return res.json({
        ok: true,

        itemId,

        status:
          'CANCELLED',

        cancellationRequestStatus:
          'APPROVED',
      })
    } catch (error) {
      await rollbackSafely(
        client,
      )

      console.error(
        '[mobile.work-plan-approvals][cancellation-approve]',
        error,
      )

      return res.status(500).json({
        error:
          'No fue posible aprobar la cancelación',

        code:
          'CANCELLATION_REQUEST_APPROVE_FAILED',
      })
    } finally {
      client.release()
    }
  },
)

/**
 * POST
 * /api/mobile/work-plans/approvals/cancellation-requests/:itemId/reject
 */
router.post(
  '/cancellation-requests/:itemId/reject',
  async (req, res) => {
    const itemId =
      req.params.itemId

    if (
      !UUID_PATTERN.test(
        itemId,
      )
    ) {
      return res.status(400).json({
        error:
          'El identificador de la visita no es válido',

        code:
          'INVALID_PLAN_ITEM_ID',
      })
    }

    const comment =
      normalizeOptionalText(
        req.body?.comment,
      )

    if (!comment) {
      return res.status(400).json({
        error:
          'Debes indicar el motivo del rechazo',

        code:
          'CANCELLATION_REJECTION_COMMENT_REQUIRED',
      })
    }

    if (
      comment.length >
      2000
    ) {
      return res.status(400).json({
        error:
          'El comentario no puede superar 2000 caracteres',

        code:
          'CANCELLATION_REJECTION_COMMENT_TOO_LONG',
      })
    }

    const client =
      await pool.connect()

    try {
      await client.query(
        'BEGIN',
      )

      const item =
        await lockManagerCancellationRequest(
          client,
          itemId,
          req.profile.id,
        )

      const validationError =
        validatePendingCancellationRequest(
          item,
        )

      if (validationError) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(
            validationError.status,
          )
          .json(
            validationError.response,
          )
      }

      const updateResult =
        await client.query(
          `
          UPDATE public.work_plan_item

          SET
            cancellation_request_status =
              'REJECTED',

            cancellation_reviewed_at =
              NOW(),

            cancellation_reviewed_by =
              $2,

            cancellation_review_comment =
              $3,

            updated_by =
              $2,

            updated_at =
              NOW()

          WHERE id = $1

          RETURNING *
          `,
          [
            itemId,
            req.profile.id,
            comment,
          ],
        )

      const updatedItem =
        updateResult.rows[0]

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
            'VISIT_CANCELLATION_REJECTED',

          actor:
            req.profile,

          previousStatus:
            'PENDING',

          newStatus:
            'PENDING',

          comment,

          beforeData:
            item,

          afterData:
            updatedItem,

          metadata: {
            cancellationRequestReason:
              item.cancellation_request_reason,

            requestedBy:
              item.cancellation_requested_by,
          },
        },
      )

      await client.query(
        'COMMIT',
      )

      return res.json({
        ok: true,

        itemId,

        status:
          'PENDING',

        cancellationRequestStatus:
          'REJECTED',
      })
    } catch (error) {
      await rollbackSafely(
        client,
      )

      console.error(
        '[mobile.work-plan-approvals][cancellation-reject]',
        error,
      )

      return res.status(500).json({
        error:
          'No fue posible rechazar la solicitud de cancelación',

        code:
          'CANCELLATION_REQUEST_REJECT_FAILED',
      })
    } finally {
      client.release()
    }
  },
)

async function lockManagerCancellationRequest(
  client,
  itemId,
  managerId,
) {
  const result =
    await client.query(
      `
      SELECT
        wpi.*,

        wp.status
          AS plan_status,

        wp.archived_at
          AS plan_archived_at,

        wp.revision_number,

        wp.supervisor_id,

        supervisor.nombre
          AS supervisor_name,

        coordinator.id
          AS coordinator_id,

        coordinator.nombre
          AS coordinator_name

      FROM public.work_plan_item wpi

      INNER JOIN public.work_plan wp
        ON wp.id =
          wpi.plan_id

      INNER JOIN public.personas supervisor
        ON supervisor.id =
          wp.supervisor_id

      LEFT JOIN public.personas coordinator
        ON coordinator.id =
          supervisor.superior_id

        AND coordinator.area =
          'FARMACIAS'

        AND coordinator.rol =
          'COORDINADOR'

      WHERE wpi.id = $1

        AND supervisor.area =
          'FARMACIAS'

        AND supervisor.rol =
          'SUPERVISOR'

        AND supervisor.activo =
          TRUE

        AND (
          supervisor.superior_id =
            $2

          OR coordinator.superior_id =
            $2
        )

      FOR UPDATE OF wpi
      `,
      [
        itemId,
        managerId,
      ],
    )

  return result.rows[0] ??
    null
}

function validatePendingCancellationRequest(
  item,
) {
  if (!item) {
    return {
      status: 404,

      response: {
        error:
          'La solicitud no existe o no pertenece a la estructura del gerente',

        code:
          'CANCELLATION_REQUEST_NOT_FOUND',
      },
    }
  }

  if (
    item.plan_archived_at ||
    item.plan_status !==
      'APPROVED'
  ) {
    return {
      status: 409,

      response: {
        error:
          'El plan ya no se encuentra autorizado para ejecución',

        code:
          'CANCELLATION_REQUEST_PLAN_NOT_APPROVED',
      },
    }
  }

  if (
    item.item_type !==
      'PHARMACY' ||
    item.source !==
      'PLAN'
  ) {
    return {
      status: 409,

      response: {
        error:
          'La solicitud no corresponde a una visita programada',

        code:
          'INVALID_CANCELLATION_REQUEST_ITEM',
      },
    }
  }

  if (
    item.status !==
      'PENDING'
  ) {
    return {
      status: 409,

      response: {
        error:
          'La visita ya no se encuentra pendiente',

        code:
          'CANCELLATION_REQUEST_ITEM_NOT_PENDING',
      },
    }
  }

  if (
    item.cancellation_request_status !==
      'PENDING'
  ) {
    return {
      status: 409,

      response: {
        error:
          'La solicitud ya fue resuelta',

        code:
          'CANCELLATION_REQUEST_ALREADY_REVIEWED',
      },
    }
  }

  return null
}

async function loadFarmaciasProfile(
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
          superior_id

        FROM public.personas

        WHERE auth_user_id = $1

        LIMIT 1
        `,
        [
          req.auth.user.id,
        ],
      )

    if (
      result.rowCount ===
      0
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
      'FARMACIAS'
    ) {
      return res.status(403).json({
        error:
          'Esta función está disponible únicamente para el área de Farmacias',

        code:
          'AREA_NOT_ALLOWED',
      })
    }

    req.profile =
      profile

    return next()
  } catch (error) {
    console.error(
      '[mobile.work-plan-approvals][profile]',
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

function requireManager(
  req,
  res,
  next,
) {
  if (
    req.profile?.rol !==
    'GERENTE'
  ) {
    return res.status(403).json({
      error:
        'Esta operación está disponible únicamente para gerentes',

      code:
        'MANAGER_ROLE_REQUIRED',
    })
  }

  return next()
}

async function lockManagerPlan(
  client,
  planId,
  managerId,
) {
  const result =
    await client.query(
      `
      SELECT
        wp.*,

        supervisor.nombre
          AS supervisor_name,

        coordinator.id
          AS coordinator_id,

        coordinator.nombre
          AS coordinator_name

      FROM public.work_plan wp

      INNER JOIN public.personas
        supervisor

        ON supervisor.id =
          wp.supervisor_id

      LEFT JOIN public.personas
        coordinator

        ON coordinator.id =
          supervisor.superior_id

        AND coordinator.area =
          'FARMACIAS'

        AND coordinator.rol =
          'COORDINADOR'

      WHERE wp.id = $1

        AND supervisor.area =
          'FARMACIAS'

        AND supervisor.rol =
          'SUPERVISOR'

        AND (
          supervisor.superior_id =
            $2

          OR coordinator.superior_id =
            $2
        )

      FOR UPDATE OF wp
      `,
      [
        planId,
        managerId,
      ],
    )

  return (
    result.rows[0] ??
    null
  )
}

function validatePendingPlan(
  plan,
) {
  if (!plan) {
    return {
      status: 404,

      response: {
        error:
          'El plan no existe o no pertenece a la estructura del gerente',

        code:
          'WORK_PLAN_APPROVAL_NOT_FOUND',
      },
    }
  }

  if (
    plan.archived_at ||
    plan.status ===
      'ARCHIVED'
  ) {
    return {
      status: 409,

      response: {
        error:
          'El plan se encuentra archivado',

        code:
          'WORK_PLAN_ARCHIVED',
      },
    }
  }

  if (
    plan.status !==
    'PENDING_APPROVAL'
  ) {
    return {
      status: 409,

      response: {
        error:
          'El plan ya no se encuentra pendiente de aprobación',

        code:
          'WORK_PLAN_NOT_PENDING_APPROVAL',
      },
    }
  }

  return null
}

function mapCancellationRequest(
  row,
) {
  return {
    itemId:
      row.item_id,

    planId:
      row.plan_id,

    supervisorId:
      row.supervisor_id,

    supervisorName:
      row.supervisor_name,

    coordinatorId:
      row.coordinator_id,

    coordinatorName:
      row.coordinator_name,

    planType:
      row.plan_type,

    periodStart:
      normalizeDateValue(
        row.period_start,
      ),

    periodEnd:
      normalizeDateValue(
        row.period_end,
      ),

    revisionNumber:
      Number(
        row.revision_number ??
        0,
      ),

    pharmacyId:
      String(
        row.pharmacy_id,
      ),

    name:
      row.name,

    address:
      row.address,

    clues:
      row.clues,

    region:
      row.region_sanitaria,

    project:
      row.proyecto,

    scheduledDate:
      normalizeDateValue(
        row.scheduled_date,
      ),

    scheduledTime:
      row.scheduled_time,

    required:
      Boolean(
        row.required,
      ),

    requestReason:
      row.cancellation_request_reason,

    requestNotes:
      row.cancellation_request_notes,

    requestedAt:
      row.cancellation_requested_at,
  }
}

function mapApprovalSummary(
  row,
) {
  return {
    ...mapPlan(
      row,
    ),

    supervisorName:
      row.supervisor_name,

    coordinatorId:
      row.coordinator_id,

    coordinatorName:
      row.coordinator_name,

    totalItems:
      Number(
        row.total_items ??
        0,
      ),

    pendingItems:
      Number(
        row.pending_items ??
        0,
      ),

    inProgressItems:
      Number(
        row.in_progress_items ??
        0,
      ),

    doneItems:
      Number(
        row.done_items ??
        0,
      ),

    skippedItems:
      Number(
        row.skipped_items ??
        0,
      ),

    cancelledItems:
      Number(
        row.cancelled_items ??
        0,
      ),
  }
}

function mapPlan(
  row,
) {
  return {
    id:
      row.id,

    supervisorId:
      row.supervisor_id,

    status:
      row.status,

    planType:
      row.plan_type,

    periodStart:
      normalizeDateValue(
        row.period_start,
      ),

    periodEnd:
      normalizeDateValue(
        row.period_end,
      ),

    revisionNumber:
      Number(
        row.revision_number ??
        0,
      ),

    createdBy:
      row.created_by,

    createdAt:
      row.created_at,

    updatedBy:
      row.updated_by,

    updatedAt:
      row.updated_at,

    submittedBy:
      row.submitted_by,

    submittedAt:
      row.submitted_at,

    approvedBy:
      row.approved_by,

    approvedAt:
      row.approved_at,

    rejectedBy:
      row.rejected_by,

    rejectedAt:
      row.rejected_at,

    rejectionComment:
      row.rejection_comment,

    archivedBy:
      row.archived_by,

    archivedAt:
      row.archived_at,
  }
}

function mapPlanItem(
  row,
) {
  return {
    id:
      row.id,

    planId:
      row.plan_id,

    pharmacyId:
      row.pharmacy_id ===
      null
        ? null
        : String(
            row.pharmacy_id,
          ),

    itemType:
      row.item_type,

    source:
      row.source,

    name:
      row.name,

    address:
      row.address,

    clues:
      row.clues,

    region:
      row.region_sanitaria,

    project:
      row.proyecto,

    state:
      row.estado,

    pharmacyStatus:
      row.pharmacy_status,

    lat:
      toNullableNumber(
        row.lat,
      ),

    lng:
      toNullableNumber(
        row.lng,
      ),

    googlePlaceId:
      row.google_place_id,

    activityCategory:
      row.activity_category,

    additionReason:
      row.addition_reason,

    estimatedMinutes:
      toNullableNumber(
        row.estimated_minutes,
      ),

    scheduledDate:
      normalizeDateValue(
        row.scheduled_date,
      ),

    scheduledTime:
      row.scheduled_time,

    order:
      Number(
        row.ord,
      ),

    required:
      Boolean(
        row.required,
      ),

    status:
      row.status,

    addedBy:
      row.added_by,

    addedAt:
      row.added_at,

    updatedBy:
      row.updated_by,

    updatedAt:
      row.updated_at,

    removedBy:
      row.removed_by,

    removedAt:
      row.removed_at,

    removalReason:
      row.removal_reason,
  }
}

function mapRevision(
  row,
) {
  return {
    id:
      row.id,

    planId:
      row.plan_id,

    revisionNumber:
      Number(
        row.revision_number,
      ),

    status:
      row.status,

    submittedBy:
      row.submitted_by,

    submittedAt:
      row.submitted_at,

    reviewedBy:
      row.reviewed_by,

    reviewedAt:
      row.reviewed_at,

    reviewComment:
      row.review_comment,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  }
}

function mapEvent(
  row,
) {
  return {
    id:
      row.id,

    planId:
      row.plan_id,

    entityType:
      row.entity_type,

    entityId:
      row.entity_id,

    revisionNumber:
      row.revision_number ===
      null
        ? null
        : Number(
            row.revision_number,
          ),

    eventType:
      row.event_type,

    actorId:
      row.actor_id,

    actorArea:
      row.actor_area,

    actorRole:
      row.actor_role,

    previousStatus:
      row.previous_status,

    newStatus:
      row.new_status,

    comment:
      row.comment,

    beforeData:
      row.before_data,

    afterData:
      row.after_data,

    metadata:
      row.metadata,

    createdAt:
      row.created_at,
  }
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

function normalizeOptionalText(
  value,
) {
  const normalized =
    String(
      value ?? '',
    ).trim()

  return normalized ||
    null
}

function toNullableNumber(
  value,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null
  }

  const numberValue =
    Number(
      value,
    )

  return Number.isFinite(
    numberValue,
  )
    ? numberValue
    : null
}

async function rollbackSafely(
  client,
) {
  try {
    await client.query(
      'ROLLBACK',
    )
  } catch (
    rollbackError
  ) {
    console.error(
      '[mobile.work-plan-approvals][rollback]',
      rollbackError,
    )
  }
}

export default router
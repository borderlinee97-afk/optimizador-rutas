import {
  Router,
} from 'express'

import {
  pool,
} from '../db/pool.js'

import {
  requireAuth,
} from '../middleware/requireAuth.js'

import {
  appendWorkPlanEvent,
} from '../services/workPlanAudit.service.js'

import {
  findUnauthorizedPlanPharmacy,
  normalizePharmacyScopeMode,
} from '../services/pharmacyAccess.service.js'

const router =
  Router()

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/

const ALLOWED_PLAN_TYPES =
  new Set([
    'ORDINARY',
    'EXTRAORDINARY',
  ])

router.use(
  requireAuth,
)

router.use(
  loadFarmaciasProfile,
)

/**
 * ============================================================
 * GET /api/mobile/work-plans/mine
 * ============================================================
 *
 * Lista los planes pertenecientes al supervisor autenticado.
 */

router.get(
  '/mine',
  async (
    req,
    res,
  ) => {
    const roleError =
      requireSupervisor(
        req,
      )

    if (roleError) {
      return res
        .status(403)
        .json(
          roleError,
        )
    }

    const includeArchived =
      req.query.includeArchived ===
      'true'

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

          FROM public.work_plan
            wp

          LEFT JOIN public.work_plan_item
            wpi

            ON wpi.plan_id =
              wp.id

          WHERE wp.supervisor_id =
              $1::uuid

            AND (
              $2::boolean =
                TRUE

              OR wp.archived_at
                IS NULL
            )

          GROUP BY
            wp.id

          ORDER BY
            wp.period_start DESC,
            wp.created_at DESC
          `,
          [
            req.profile.id,
            includeArchived,
          ],
        )

      return res.json({
        plans:
          result.rows.map(
            mapPlanSummary,
          ),
      })
    } catch (
      error
    ) {
      console.error(
        '[mobile.work-plans][mine]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'No fue posible obtener los planes de trabajo',

          code:
            'WORK_PLANS_FETCH_FAILED',
        })
    }
  },
)

/**
 * ============================================================
 * POST /api/mobile/work-plans
 * ============================================================
 *
 * Crea un plan en estado DRAFT.
 */

router.post(
  '/',
  async (
    req,
    res,
  ) => {
    const roleError =
      requireSupervisor(
        req,
      )

    if (roleError) {
      return res
        .status(403)
        .json(
          roleError,
        )
    }

    const payload =
      parsePlanPayload(
        req.body,
      )

    if (!payload.ok) {
      return res
        .status(400)
        .json(
          payload.response,
        )
    }

    const client =
      await pool.connect()

    try {
      await client.query(
        'BEGIN',
      )

      const result =
        await client.query(
          `
          INSERT INTO public.work_plan (
            supervisor_id,
            status,

            period_start,
            period_end,

            plan_type,
            revision_number,

            created_by,
            updated_by
          )
          VALUES (
            $1::uuid,
            'DRAFT',

            $2::date,
            $3::date,

            $4::text,
            0,

            $1::uuid,
            $1::uuid
          )

          RETURNING *
          `,
          [
            req.profile.id,
            payload.value.periodStart,
            payload.value.periodEnd,
            payload.value.planType,
          ],
        )

      const plan =
        result.rows[0]

      await appendWorkPlanEvent(
        client,
        {
          planId:
            plan.id,

          entityType:
            'PLAN',

          entityId:
            plan.id,

          revisionNumber:
            0,

          eventType:
            'PLAN_CREATED',

          actor:
            req.profile,

          previousStatus:
            null,

          newStatus:
            'DRAFT',

          afterData:
            plan,
        },
      )

      await client.query(
        'COMMIT',
      )

      return res
        .status(201)
        .json({
          ok:
            true,

          plan:
            mapPlan(
              plan,
            ),
        })
    } catch (
      error
    ) {
      await rollbackSafely(
        client,
      )

      console.error(
        '[mobile.work-plans][POST]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'No fue posible crear el plan de trabajo',

          code:
            'WORK_PLAN_CREATE_FAILED',
        })
    } finally {
      client.release()
    }
  },
)

/**
 * ============================================================
 * GET /api/mobile/work-plans/:planId
 * ============================================================
 *
 * Devuelve:
 *
 * - plan;
 * - visitas;
 * - revisiones;
 * - eventos;
 * - origen del acceso territorial de cada visita.
 *
 * El origen del acceso se calcula usando la fecha programada
 * de la visita:
 *
 * - PERMANENT_ASSIGNMENT;
 * - TEMPORARY_COVERAGE;
 * - ALL;
 * - NONE.
 */

router.get(
  '/:planId',
  async (
    req,
    res,
  ) => {
    const roleError =
      requireSupervisor(
        req,
      )

    if (roleError) {
      return res
        .status(403)
        .json(
          roleError,
        )
    }

    const planId =
      req.params.planId

    if (
      !UUID_PATTERN.test(
        planId,
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            'El identificador del plan no es válido',

          code:
            'INVALID_WORK_PLAN_ID',
        })
    }

    const scopeMode =
      normalizePharmacyScopeMode(
        req.profile
          .pharmacy_scope_mode,
      )

    try {
      const planResult =
        await pool.query(
          `
          SELECT
            *

          FROM public.work_plan

          WHERE id =
              $1::uuid

            AND supervisor_id =
              $2::uuid

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
        return res
          .status(404)
          .json({
            error:
              'El plan de trabajo no existe',

            code:
              'WORK_PLAN_NOT_FOUND',
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
                BTRIM(
                  wpi.custom_name
                ),
                ''
              ),

              NULLIF(
                BTRIM(
                  farmacia.unidad
                ),
                ''
              ),

              farmacia.clues,

              'Actividad sin nombre'
            ) AS name,

            COALESCE(
              NULLIF(
                BTRIM(
                  wpi.custom_address
                ),
                ''
              ),

              farmacia.direccion
            ) AS address,

            farmacia.clues,
            farmacia.region_sanitaria,
            farmacia.proyecto,
            farmacia.estado,

            farmacia.estatus::text
              AS pharmacy_status,

            COALESCE(
              wpi.custom_lat,
              farmacia.latitud::double precision
            ) AS lat,

            COALESCE(
              wpi.custom_lng,
              farmacia.longitud::double precision
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
            wpi.removal_reason,

            permanent_assignment.id
              AS permanent_assignment_id,

            permanent_assignment.supervisor_id
              AS assigned_supervisor_id,

            assigned_supervisor.nombre
              AS assigned_supervisor_name,

            temporary_coverage.id
              AS temporary_coverage_id,

            temporary_coverage.start_date
              AS temporary_coverage_start_date,

            temporary_coverage.end_date
              AS temporary_coverage_end_date,

            temporary_coverage.coordinator_id
              AS temporary_coverage_coordinator_id,

            coverage_coordinator.nombre
              AS temporary_coverage_coordinator_name,

            temporary_coverage.titular_supervisor_id
              AS coverage_titular_supervisor_id,

            coverage_titular.nombre
              AS coverage_titular_supervisor_name,

            CASE
              WHEN temporary_coverage.id
                IS NULL
              THEN NULL

              WHEN CURRENT_DATE <
                temporary_coverage.start_date
              THEN 'SCHEDULED'

              WHEN CURRENT_DATE BETWEEN
                temporary_coverage.start_date
                AND temporary_coverage.end_date
              THEN 'ACTIVE'

              ELSE 'EXPIRED'
            END AS temporary_coverage_status,

            CASE
              WHEN wpi.item_type::text =
                'EXTRA_STOP'
              THEN 'ALL'

              WHEN permanent_assignment.id
                IS NOT NULL
              THEN 'PERMANENT_ASSIGNMENT'

              WHEN temporary_coverage.id
                IS NOT NULL
              THEN 'TEMPORARY_COVERAGE'

              WHEN $3::text =
                'ALL'
              THEN 'ALL'

              ELSE 'NONE'
            END AS access_type

          FROM public.work_plan_item
            wpi

          LEFT JOIN public.farmacia
            farmacia

            ON farmacia.id =
              wpi.pharmacy_id

          /*
           * Busca una asignación permanente del supervisor
           * que cubra la fecha programada de la visita.
           *
           * También permite reconstruir asignaciones históricas
           * que posteriormente fueron revocadas.
           */
          LEFT JOIN LATERAL (
            SELECT
              assignment.id,
              assignment.supervisor_id

            FROM public.pharmacy_supervisor_assignment
              assignment

            WHERE assignment.pharmacy_id =
                wpi.pharmacy_id

              AND assignment.supervisor_id =
                $2::uuid

              AND assignment.assigned_at::date <=
                wpi.scheduled_date

              AND (
                assignment.revoked_at
                  IS NULL

                OR assignment.revoked_at::date >=
                  wpi.scheduled_date
              )

            ORDER BY
              assignment.assigned_at DESC,
              assignment.created_at DESC

            LIMIT 1
          ) permanent_assignment
            ON wpi.pharmacy_id
              IS NOT NULL

          LEFT JOIN public.personas
            assigned_supervisor

            ON assigned_supervisor.id =
              permanent_assignment.supervisor_id

          /*
           * Busca una cobertura aprobada que cubra exactamente
           * la fecha programada de la visita.
           */
          LEFT JOIN LATERAL (
            SELECT
              coverage.id,
              coverage.coordinator_id,
              coverage.titular_supervisor_id,
              coverage.start_date,
              coverage.end_date

            FROM public.pharmacy_supervisor_coverage
              coverage

            WHERE coverage.pharmacy_id =
                wpi.pharmacy_id

              AND coverage.covering_supervisor_id =
                $2::uuid

              AND coverage.status =
                'APPROVED'

              AND coverage.cancelled_at
                IS NULL

              AND wpi.scheduled_date BETWEEN
                coverage.start_date
                AND coverage.end_date

            ORDER BY
              coverage.start_date DESC,
              coverage.created_at DESC

            LIMIT 1
          ) temporary_coverage
            ON wpi.pharmacy_id
              IS NOT NULL

          LEFT JOIN public.personas
            coverage_titular

            ON coverage_titular.id =
              temporary_coverage
                .titular_supervisor_id

          LEFT JOIN public.personas
            coverage_coordinator

            ON coverage_coordinator.id =
              temporary_coverage
                .coordinator_id

          WHERE wpi.plan_id =
              $1::uuid

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
            req.profile.id,
            scopeMode,
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

          WHERE plan_id =
            $1::uuid

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

          WHERE plan_id =
            $1::uuid

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
    } catch (
      error
    ) {
      console.error(
        '[mobile.work-plans][detail]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'No fue posible obtener el detalle del plan',

          code:
            'WORK_PLAN_DETAIL_FAILED',
        })
    }
  },
)

/**
 * ============================================================
 * PATCH /api/mobile/work-plans/:planId
 * ============================================================
 *
 * Modifica periodo y tipo.
 *
 * Solo se permite en:
 *
 * - DRAFT;
 * - REJECTED.
 */

router.patch(
  '/:planId',
  async (
    req,
    res,
  ) => {
    const roleError =
      requireSupervisor(
        req,
      )

    if (roleError) {
      return res
        .status(403)
        .json(
          roleError,
        )
    }

    const planId =
      req.params.planId

    if (
      !UUID_PATTERN.test(
        planId,
      )
    ) {
      return res
        .status(400)
        .json({
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

      const currentResult =
        await client.query(
          `
          SELECT
            *

          FROM public.work_plan

          WHERE id =
              $1::uuid

            AND supervisor_id =
              $2::uuid

          FOR UPDATE
          `,
          [
            planId,
            req.profile.id,
          ],
        )

      if (
        currentResult.rowCount ===
        0
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(404)
          .json({
            error:
              'El plan de trabajo no existe',

            code:
              'WORK_PLAN_NOT_FOUND',
          })
      }

      const currentPlan =
        currentResult.rows[0]

      if (
        currentPlan.archived_at
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(409)
          .json({
            error:
              'El plan se encuentra archivado',

            code:
              'WORK_PLAN_ARCHIVED',
          })
      }

      if (
        ![
          'DRAFT',
          'REJECTED',
        ].includes(
          currentPlan.status,
        )
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(409)
          .json({
            error:
              'El plan no puede modificarse en su estado actual',

            code:
              'WORK_PLAN_NOT_EDITABLE',
          })
      }

      const payload =
        parsePlanPayload({
          periodStart:
            req.body?.periodStart ??
            currentPlan.period_start,

          periodEnd:
            req.body?.periodEnd ??
            currentPlan.period_end,

          planType:
            req.body?.planType ??
            currentPlan.plan_type,
        })

      if (!payload.ok) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(400)
          .json(
            payload.response,
          )
      }

      const outsideItemsResult =
        await client.query(
          `
          SELECT
            COUNT(*) AS total

          FROM public.work_plan_item

          WHERE plan_id =
              $1::uuid

            AND removed_at
              IS NULL

            AND scheduled_date
              NOT BETWEEN
                $2::date
                AND $3::date
          `,
          [
            planId,
            payload.value.periodStart,
            payload.value.periodEnd,
          ],
        )

      if (
        Number(
          outsideItemsResult
            .rows[0]
            .total,
        ) >
        0
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(409)
          .json({
            error:
              'Existen visitas programadas fuera del nuevo periodo',

            code:
              'ITEMS_OUTSIDE_NEW_PERIOD',
          })
      }

      const updateResult =
        await client.query(
          `
          UPDATE public.work_plan

          SET
            period_start =
              $2::date,

            period_end =
              $3::date,

            plan_type =
              $4::text,

            status =
              CASE
                WHEN status =
                  'REJECTED'
                THEN 'DRAFT'

                ELSE status
              END,

            updated_by =
              $5::uuid

          WHERE id =
            $1::uuid

          RETURNING *
          `,
          [
            planId,
            payload.value.periodStart,
            payload.value.periodEnd,
            payload.value.planType,
            req.profile.id,
          ],
        )

      const updatedPlan =
        updateResult.rows[0]

      await appendWorkPlanEvent(
        client,
        {
          planId,

          entityType:
            'PLAN',

          entityId:
            planId,

          revisionNumber:
            updatedPlan
              .revision_number,

          eventType:
            'PLAN_UPDATED',

          actor:
            req.profile,

          previousStatus:
            currentPlan.status,

          newStatus:
            updatedPlan.status,

          beforeData:
            currentPlan,

          afterData:
            updatedPlan,
        },
      )

      await client.query(
        'COMMIT',
      )

      return res.json({
        ok:
          true,

        plan:
          mapPlan(
            updatedPlan,
          ),
      })
    } catch (
      error
    ) {
      await rollbackSafely(
        client,
      )

      console.error(
        '[mobile.work-plans][PATCH]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'No fue posible modificar el plan de trabajo',

          code:
            'WORK_PLAN_UPDATE_FAILED',
        })
    } finally {
      client.release()
    }
  },
)

/**
 * ============================================================
 * POST /api/mobile/work-plans/:planId/submit
 * ============================================================
 */

router.post(
  '/:planId/submit',
  async (
    req,
    res,
  ) => {
    const roleError =
      requireSupervisor(
        req,
      )

    if (roleError) {
      return res
        .status(403)
        .json(
          roleError,
        )
    }

    const planId =
      req.params.planId

    if (
      !UUID_PATTERN.test(
        planId,
      )
    ) {
      return res
        .status(400)
        .json({
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

      const currentResult =
        await client.query(
          `
          SELECT
            *

          FROM public.work_plan

          WHERE id =
              $1::uuid

            AND supervisor_id =
              $2::uuid

          FOR UPDATE
          `,
          [
            planId,
            req.profile.id,
          ],
        )

      if (
        currentResult.rowCount ===
        0
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(404)
          .json({
            error:
              'El plan de trabajo no existe',

            code:
              'WORK_PLAN_NOT_FOUND',
          })
      }

      const currentPlan =
        currentResult.rows[0]

      if (
        currentPlan.archived_at
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(409)
          .json({
            error:
              'El plan se encuentra archivado',

            code:
              'WORK_PLAN_ARCHIVED',
          })
      }

      if (
        ![
          'DRAFT',
          'REJECTED',
        ].includes(
          currentPlan.status,
        )
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(409)
          .json({
            error:
              'El plan no puede enviarse en su estado actual',

            code:
              'WORK_PLAN_NOT_SUBMITTABLE',
          })
      }

      const itemsResult =
        await client.query(
          `
          SELECT
            wpi.*,

            COALESCE(
              NULLIF(
                BTRIM(
                  wpi.custom_name
                ),
                ''
              ),

              NULLIF(
                BTRIM(
                  farmacia.unidad
                ),
                ''
              ),

              farmacia.clues,

              'Actividad sin nombre'
            ) AS resolved_name

          FROM public.work_plan_item
            wpi

          LEFT JOIN public.farmacia
            farmacia

            ON farmacia.id =
              wpi.pharmacy_id

          WHERE wpi.plan_id =
              $1::uuid

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

      if (
        itemsResult.rowCount ===
        0
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(409)
          .json({
            error:
              'Agrega al menos una visita antes de enviar el plan',

            code:
              'WORK_PLAN_WITHOUT_ITEMS',
          })
      }

      const periodStart =
        normalizeDateValue(
          currentPlan.period_start,
        )

      const periodEnd =
        normalizeDateValue(
          currentPlan.period_end,
        )

      const invalidItem =
        itemsResult.rows.find(
          item => {
            const scheduledDate =
              normalizeDateValue(
                item.scheduled_date,
              )

            return (
              scheduledDate <
                periodStart ||
              scheduledDate >
                periodEnd
            )
          },
        )

      if (
        invalidItem
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(409)
          .json({
            error:
              'El plan contiene visitas fuera del periodo autorizado',

            code:
              'WORK_PLAN_ITEM_OUTSIDE_PERIOD',

            itemId:
              invalidItem.id,
          })
      }

      /*
       * Valida cada farmacia utilizando su fecha programada.
       *
       * Una cobertura temporal solo autoriza la visita cuando
       * scheduled_date está dentro de start_date/end_date.
       */
      const unauthorizedPharmacy =
        await findUnauthorizedPlanPharmacy(
          client,
          {
            planId,

            profile:
              req.profile,
          },
        )

      if (
        unauthorizedPharmacy
      ) {
        await client.query(
          'ROLLBACK',
        )

        const pharmacyName =
          unauthorizedPharmacy
            .unidad ??
          unauthorizedPharmacy
            .clues ??
          'Farmacia sin nombre'

        const scheduledDate =
          normalizeDateValue(
            unauthorizedPharmacy
              .scheduled_date,
          )

        return res
          .status(409)
          .json({
            error:
              `La farmacia "${pharmacyName}" no está autorizada para la fecha ${scheduledDate}.`,

            code:
              'WORK_PLAN_CONTAINS_UNAUTHORIZED_PHARMACY',

            itemId:
              unauthorizedPharmacy
                .item_id,

            pharmacyId:
              String(
                unauthorizedPharmacy
                  .pharmacy_id,
              ),

            scheduledDate,
          })
      }

      const newRevision =
        Number(
          currentPlan
            .revision_number ??
          0,
        ) +
        1

      const updateResult =
        await client.query(
          `
          UPDATE public.work_plan

          SET
            status =
              'PENDING_APPROVAL',

            revision_number =
              $2::integer,

            submitted_by =
              $3::uuid,

            submitted_at =
              NOW(),

            approved_by =
              NULL,

            approved_at =
              NULL,

            rejected_by =
              NULL,

            rejected_at =
              NULL,

            rejection_comment =
              NULL,

            updated_by =
              $3::uuid

          WHERE id =
            $1::uuid

          RETURNING *
          `,
          [
            planId,
            newRevision,
            req.profile.id,
          ],
        )

      const submittedPlan =
        updateResult.rows[0]

      const hierarchyResult =
        await client.query(
          `
          SELECT
            supervisor.id
              AS supervisor_id,

            supervisor.nombre
              AS supervisor_name,

            coordinator.id
              AS coordinator_id,

            coordinator.nombre
              AS coordinator_name,

            CASE
              WHEN supervisor.superior_id =
                manager_direct.id
              THEN manager_direct.id

              ELSE manager.id
            END AS manager_id,

            CASE
              WHEN supervisor.superior_id =
                manager_direct.id
              THEN manager_direct.nombre

              ELSE manager.nombre
            END AS manager_name

          FROM public.personas
            supervisor

          LEFT JOIN public.personas
            coordinator

            ON coordinator.id =
              supervisor.superior_id

            AND coordinator.area::text =
              'FARMACIAS'

            AND coordinator.rol::text =
              'COORDINADOR'

          LEFT JOIN public.personas
            manager

            ON manager.id =
              coordinator.superior_id

            AND manager.area::text =
              'FARMACIAS'

            AND manager.rol::text =
              'GERENTE'

          LEFT JOIN public.personas
            manager_direct

            ON manager_direct.id =
              supervisor.superior_id

            AND manager_direct.area::text =
              'FARMACIAS'

            AND manager_direct.rol::text =
              'GERENTE'

          WHERE supervisor.id =
            $1::uuid

          LIMIT 1
          `,
          [
            req.profile.id,
          ],
        )

      const hierarchy =
        hierarchyResult.rows[0] ??
        null

      const snapshot = {
        plan:
          mapPlan(
            submittedPlan,
          ),

        items:
          itemsResult.rows.map(
            mapSnapshotItem,
          ),

        hierarchy,

        generatedAt:
          new Date()
            .toISOString(),
      }

      await client.query(
        `
        INSERT INTO public.work_plan_revision (
          plan_id,
          revision_number,
          status,

          submitted_by,
          submitted_at,

          snapshot
        )
        VALUES (
          $1::uuid,
          $2::integer,
          'PENDING_APPROVAL',

          $3::uuid,
          NOW(),

          $4::jsonb
        )
        `,
        [
          planId,
          newRevision,
          req.profile.id,
          JSON.stringify(
            snapshot,
          ),
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
            newRevision,

          eventType:
            'PLAN_SUBMITTED',

          actor:
            req.profile,

          previousStatus:
            currentPlan.status,

          newStatus:
            'PENDING_APPROVAL',

          beforeData:
            currentPlan,

          afterData:
            submittedPlan,

          metadata: {
            itemCount:
              itemsResult.rowCount,

            supervisorId:
              req.profile.id,

            coordinatorId:
              hierarchy
                ?.coordinator_id ??
              null,

            managerId:
              hierarchy
                ?.manager_id ??
              null,
          },
        },
      )

      await client.query(
        'COMMIT',
      )

      return res.json({
        ok:
          true,

        plan:
          mapPlan(
            submittedPlan,
          ),

        revisionNumber:
          newRevision,
      })
    } catch (
      error
    ) {
      await rollbackSafely(
        client,
      )

      console.error(
        '[mobile.work-plans][submit]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'No fue posible enviar el plan para aprobación',

          code:
            'WORK_PLAN_SUBMIT_FAILED',
        })
    } finally {
      client.release()
    }
  },
)

/**
 * ============================================================
 * POST /api/mobile/work-plans/:planId/archive
 * ============================================================
 */

router.post(
  '/:planId/archive',
  async (
    req,
    res,
  ) => {
    const roleError =
      requireSupervisor(
        req,
      )

    if (roleError) {
      return res
        .status(403)
        .json(
          roleError,
        )
    }

    const planId =
      req.params.planId

    if (
      !UUID_PATTERN.test(
        planId,
      )
    ) {
      return res
        .status(400)
        .json({
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

    const client =
      await pool.connect()

    try {
      await client.query(
        'BEGIN',
      )

      const currentResult =
        await client.query(
          `
          SELECT
            *

          FROM public.work_plan

          WHERE id =
              $1::uuid

            AND supervisor_id =
              $2::uuid

          FOR UPDATE
          `,
          [
            planId,
            req.profile.id,
          ],
        )

      if (
        currentResult.rowCount ===
        0
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(404)
          .json({
            error:
              'El plan de trabajo no existe',

            code:
              'WORK_PLAN_NOT_FOUND',
          })
      }

      const currentPlan =
        currentResult.rows[0]

      if (
        ![
          'DRAFT',
          'REJECTED',
        ].includes(
          currentPlan.status,
        )
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(409)
          .json({
            error:
              'Solo pueden eliminarse planes en borrador o rechazados',

            code:
              'WORK_PLAN_NOT_ARCHIVABLE',
          })
      }

      const updateResult =
        await client.query(
          `
          UPDATE public.work_plan

          SET
            status =
              'ARCHIVED',

            archived_by =
              $2::uuid,

            archived_at =
              NOW(),

            updated_by =
              $2::uuid

          WHERE id =
            $1::uuid

          RETURNING *
          `,
          [
            planId,
            req.profile.id,
          ],
        )

      const archivedPlan =
        updateResult.rows[0]

      await appendWorkPlanEvent(
        client,
        {
          planId,

          entityType:
            'PLAN',

          entityId:
            planId,

          revisionNumber:
            archivedPlan
              .revision_number,

          eventType:
            'PLAN_ARCHIVED',

          actor:
            req.profile,

          previousStatus:
            currentPlan.status,

          newStatus:
            'ARCHIVED',

          comment,

          beforeData:
            currentPlan,

          afterData:
            archivedPlan,
        },
      )

      await client.query(
        'COMMIT',
      )

      return res.json({
        ok:
          true,

        plan:
          mapPlan(
            archivedPlan,
          ),
      })
    } catch (
      error
    ) {
      await rollbackSafely(
        client,
      )

      console.error(
        '[mobile.work-plans][archive]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'No fue posible eliminar el plan de trabajo',

          code:
            'WORK_PLAN_ARCHIVE_FAILED',
        })
    } finally {
      client.release()
    }
  },
)

/**
 * ============================================================
 * PERFIL
 * ============================================================
 */

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
          superior_id,
          pharmacy_scope_mode

        FROM public.personas

        WHERE auth_user_id =
          $1::uuid

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
      return res
        .status(403)
        .json({
          error:
            'La cuenta no tiene un perfil operativo vinculado',

          code:
            'PROFILE_NOT_FOUND',
        })
    }

    const profile =
      result.rows[0]

    if (
      !profile.activo
    ) {
      return res
        .status(403)
        .json({
          error:
            'El perfil operativo se encuentra inactivo',

          code:
            'PROFILE_INACTIVE',
        })
    }

    const area =
      String(
        profile.area ??
        '',
      )
        .trim()
        .toUpperCase()

    const role =
      String(
        profile.rol ??
        '',
      )
        .trim()
        .toUpperCase()

    if (
      area !==
      'FARMACIAS'
    ) {
      return res
        .status(403)
        .json({
          error:
            'Esta función está disponible únicamente para el área de Farmacias',

          code:
            'AREA_NOT_ALLOWED',
        })
    }

    req.profile = {
      ...profile,

      area,

      rol:
        role,

      pharmacy_scope_mode:
        normalizePharmacyScopeMode(
          profile
            .pharmacy_scope_mode,
        ),
    }

    return next()
  } catch (
    error
  ) {
    console.error(
      '[mobile.work-plans][profile]',
      error,
    )

    return res
      .status(500)
      .json({
        error:
          'No fue posible validar el perfil operativo',

        code:
          'PROFILE_VALIDATION_FAILED',
      })
  }
}

function requireSupervisor(
  req,
) {
  if (
    req.profile?.rol ===
    'SUPERVISOR'
  ) {
    return null
  }

  return {
    error:
      'Esta operación está disponible únicamente para supervisores',

    code:
      'SUPERVISOR_ROLE_REQUIRED',
  }
}

/**
 * ============================================================
 * VALIDACIÓN DE PLAN
 * ============================================================
 */

function parsePlanPayload(
  body = {},
) {
  const periodStart =
    normalizeDateValue(
      body.periodStart,
    )

  const periodEnd =
    normalizeDateValue(
      body.periodEnd,
    )

  const planType =
    String(
      body.planType ??
      'ORDINARY',
    )
      .trim()
      .toUpperCase()

  if (
    !isValidIsoDate(
      periodStart,
    )
  ) {
    return {
      ok:
        false,

      response: {
        error:
          'La fecha inicial no es válida',

        code:
          'INVALID_PERIOD_START',
      },
    }
  }

  if (
    !isValidIsoDate(
      periodEnd,
    )
  ) {
    return {
      ok:
        false,

      response: {
        error:
          'La fecha final no es válida',

        code:
          'INVALID_PERIOD_END',
      },
    }
  }

  if (
    periodEnd <
    periodStart
  ) {
    return {
      ok:
        false,

      response: {
        error:
          'La fecha final no puede ser anterior a la fecha inicial',

        code:
          'INVALID_PLAN_PERIOD',
      },
    }
  }

  if (
    !ALLOWED_PLAN_TYPES.has(
      planType,
    )
  ) {
    return {
      ok:
        false,

      response: {
        error:
          'El tipo de plan no es válido',

        code:
          'INVALID_PLAN_TYPE',
      },
    }
  }

  return {
    ok:
      true,

    value: {
      periodStart,
      periodEnd,
      planType,
    },
  }
}

function normalizeDateValue(
  value,
) {
  if (
    value instanceof
    Date
  ) {
    return value
      .toISOString()
      .slice(
        0,
        10,
      )
  }

  return String(
    value ??
    '',
  )
    .trim()
    .slice(
      0,
      10,
    )
}

function isValidIsoDate(
  value,
) {
  if (
    !ISO_DATE_PATTERN.test(
      value,
    )
  ) {
    return false
  }

  const date =
    new Date(
      `${value}T00:00:00.000Z`,
    )

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return false
  }

  return (
    date
      .toISOString()
      .slice(
        0,
        10,
      ) ===
    value
  )
}

function normalizeOptionalText(
  value,
) {
  const normalized =
    String(
      value ??
      '',
    ).trim()

  return normalized ||
    null
}

/**
 * ============================================================
 * MAPEO
 * ============================================================
 */

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

function mapPlanSummary(
  row,
) {
  return {
    ...mapPlan(
      row,
    ),

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

function mapPlanItem(
  row,
) {
  const accessType =
    String(
      row.access_type ??
      (
        row.item_type ===
          'EXTRA_STOP'
          ? 'ALL'
          : 'NONE'
      ),
    )
      .trim()
      .toUpperCase()

  const temporaryCoverage =
    row.temporary_coverage_id
      ? {
          id:
            row
              .temporary_coverage_id,

          status:
            row
              .temporary_coverage_status,

          startDate:
            normalizeDateValue(
              row
                .temporary_coverage_start_date,
            ),

          endDate:
            normalizeDateValue(
              row
                .temporary_coverage_end_date,
            ),

          coordinatorId:
            row
              .temporary_coverage_coordinator_id,

          coordinatorName:
            row
              .temporary_coverage_coordinator_name,

          titularSupervisorId:
            row
              .coverage_titular_supervisor_id,

          titularSupervisorName:
            row
              .coverage_titular_supervisor_name,

          activeToday:
            row
              .temporary_coverage_status ===
            'ACTIVE',

          scheduled:
            row
              .temporary_coverage_status ===
            'SCHEDULED',
        }
      : null

  return {
    id:
      row.id,

    planId:
      row.plan_id,

    pharmacyId:
      row.pharmacy_id ===
        null ||
      row.pharmacy_id ===
        undefined
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

    accessType,

    accessValidForScheduledDate:
      accessType !==
      'NONE',

    permanentAssignmentId:
      row.permanent_assignment_id ??
      null,

    assignedSupervisorId:
      row.assigned_supervisor_id ??
      null,

    assignedSupervisorName:
      row.assigned_supervisor_name ??
      null,

    temporaryCoverage,
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

function mapSnapshotItem(
  row,
) {
  return {
    id:
      row.id,

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
      row.resolved_name,

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

    activityCategory:
      row.activity_category,

    additionReason:
      row.addition_reason,

    estimatedMinutes:
      toNullableNumber(
        row.estimated_minutes,
      ),
  }
}

function toNullableNumber(
  value,
) {
  if (
    value ===
      null ||
    value ===
      undefined
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

/**
 * ============================================================
 * TRANSACCIONES
 * ============================================================
 */

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
      '[mobile.work-plans][rollback]',
      rollbackError,
    )
  }
}

export default router
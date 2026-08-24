import { Router } from 'express'

import { pool } from '../db/pool.js'
import { requireAuth } from '../middleware/requireAuth.js'
import {
  appendWorkPlanEvent,
} from '../services/workPlanAudit.service.js'
import {
  getPharmacyAccess,
  normalizePharmacyScopeMode,
} from '../services/pharmacyAccess.service.js'

const router = Router()

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const BIGINT_PATTERN =
  /^\d+$/

const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/

const TIME_PATTERN =
  /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/

router.use(requireAuth)
router.use(loadFarmaciasProfile)
router.use(requireSupervisor)

/**
 * POST
 * /api/mobile/work-plans/:planId/items
 *
 * Agrega una farmacia al borrador del plan.
 */
router.post(
  '/:planId/items',
  async (req, res) => {
    const planId =
      req.params.planId

    if (
      !UUID_PATTERN.test(planId)
    ) {
      return res.status(400).json({
        error:
          'El identificador del plan no es válido',

        code:
          'INVALID_WORK_PLAN_ID',
      })
    }

    const payload =
      parseCreateItemPayload(
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

      const plan =
        await lockOwnedPlan(
          client,
          planId,
          req.profile.id,
        )

      const planError =
        validateEditablePlan(
          plan,
        )

      if (planError) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(planError.status)
          .json(planError.response)
      }

      if (
        !dateIsInsidePlan(
          payload.value
            .scheduledDate,
          plan,
        )
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res.status(409).json({
          error:
            'La fecha de la visita se encuentra fuera del periodo del plan',

          code:
            'ITEM_OUTSIDE_PLAN_PERIOD',
        })
      }

      const pharmacyAccess =
      await getPharmacyAccess(
          client,
          {
          pharmacyId:
              payload.value
              .pharmacyId,

          profile:
              req.profile,

          accessDate:
            payload.value.scheduledDate,
          },
      )

      const pharmacyAccessError =
      getPharmacyAccessError(
          pharmacyAccess,
      )

      if (pharmacyAccessError) {
      await client.query(
          'ROLLBACK',
      )

      return res
          .status(
          pharmacyAccessError
              .status,
          )
          .json(
          pharmacyAccessError
              .response,
          )
      }

      const pharmacy =
      pharmacyAccess.pharmacy

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

            added_by,
            added_at,

            updated_by,
            updated_at
          )
          VALUES (
            $1,
            $2,

            $3,
            $4,

            999999,
            $5,
            'PENDING',

            'PHARMACY',
            'PLAN',

            $6,
            NOW(),

            $6,
            NOW()
          )
          RETURNING *
          `,
          [
            planId,

            payload.value
              .pharmacyId,

            payload.value
              .scheduledDate,

            payload.value
              .scheduledTime,

            payload.value
              .required,

            req.profile.id,
          ],
        )

      const insertedItem =
        insertResult.rows[0]

      await placeItemAtOrder(
        client,
        {
          planId,

          itemId:
            insertedItem.id,

          scheduledDate:
            payload.value
              .scheduledDate,

          requestedOrder:
            payload.value.order,
        },
      )

      const editedPlan =
        await markPlanEdited(
          client,
          plan,
          req.profile,
        )

      const completeItem =
        await getCompletePlanItem(
          client,
          insertedItem.id,
        )

      await appendWorkPlanEvent(
        client,
        {
          planId,

          entityType:
            'PLAN_ITEM',

          entityId:
            insertedItem.id,

          revisionNumber:
            Number(
              editedPlan
                .revision_number ??
              0,
            ),

          eventType:
            'ITEM_CREATED',

          actor:
            req.profile,

          previousStatus:
            null,

          newStatus:
            'PENDING',

          afterData:
            completeItem,

          metadata: {
            pharmacyId:
              String(
                pharmacy.id,
              ),

            pharmacyClues:
              pharmacy.clues,
          },
        },
      )

      await client.query(
        'COMMIT',
      )

      return res
        .status(201)
        .json({
          ok: true,

          planStatus:
            editedPlan.status,

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
        '[mobile.work-plan-items][POST]',
        error,
      )

      return res.status(500).json({
        error:
          'No fue posible agregar la visita al plan',

        code:
          'WORK_PLAN_ITEM_CREATE_FAILED',
      })
    } finally {
      client.release()
    }
  },
)

/**
 * PATCH
 * /api/mobile/work-plans/:planId/items/:itemId
 *
 * Permite cambiar:
 * - farmacia;
 * - fecha;
 * - hora;
 * - orden;
 * - obligatoriedad.
 */
router.patch(
  '/:planId/items/:itemId',
  async (req, res) => {
    const planId =
      req.params.planId

    const itemId =
      req.params.itemId

    const idError =
      validatePlanAndItemIds(
        planId,
        itemId,
      )

    if (idError) {
      return res
        .status(400)
        .json(idError)
    }

    const client =
      await pool.connect()

    try {
      await client.query(
        'BEGIN',
      )

      const plan =
        await lockOwnedPlan(
          client,
          planId,
          req.profile.id,
        )

      const planError =
        validateEditablePlan(
          plan,
        )

      if (planError) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(planError.status)
          .json(planError.response)
      }

      const currentItem =
        await lockPlanItem(
          client,
          planId,
          itemId,
        )

      const itemError =
        validateEditableItem(
          currentItem,
        )

      if (itemError) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(itemError.status)
          .json(itemError.response)
      }

      const payload =
        parseUpdateItemPayload(
          req.body,
          currentItem,
        )

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

      if (
        !dateIsInsidePlan(
          payload.value
            .scheduledDate,
          plan,
        )
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res.status(409).json({
          error:
            'La fecha de la visita se encuentra fuera del periodo del plan',

          code:
            'ITEM_OUTSIDE_PLAN_PERIOD',
        })
      }

      const pharmacyAccess =
        await getPharmacyAccess(
          client,
          {
            pharmacyId:
              payload.value
                .pharmacyId,

            profile:
              req.profile,

            accessDate:
              payload.value.scheduledDate,
          },
        )

      const pharmacyAccessError =
        getPharmacyAccessError(
          pharmacyAccess,
        )

      if (pharmacyAccessError) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(
            pharmacyAccessError
              .status,
          )
          .json(
            pharmacyAccessError
              .response,
          )
      }

      const beforeItem =
        await getCompletePlanItem(
          client,
          itemId,
        )

      const previousDate =
        normalizeDateValue(
          currentItem
            .scheduled_date,
        )

      await client.query(
        `
        UPDATE public.work_plan_item

        SET
          pharmacy_id = $2,
          scheduled_date = $3,
          scheduled_time = $4,

          required = $5,

          ord = 999999,

          updated_by = $6,
          updated_at = NOW()

        WHERE id = $1
        `,
        [
          itemId,

          payload.value
            .pharmacyId,

          payload.value
            .scheduledDate,

          payload.value
            .scheduledTime,

          payload.value
            .required,

          req.profile.id,
        ],
      )

      if (
        previousDate !==
        payload.value
          .scheduledDate
      ) {
        await normalizeOrdersForDate(
          client,
          planId,
          previousDate,
        )
      }

      await placeItemAtOrder(
        client,
        {
          planId,
          itemId,

          scheduledDate:
            payload.value
              .scheduledDate,

          requestedOrder:
            payload.value.order,
        },
      )

      const editedPlan =
        await markPlanEdited(
          client,
          plan,
          req.profile,
        )

      const updatedItem =
        await getCompletePlanItem(
          client,
          itemId,
        )

      await appendWorkPlanEvent(
        client,
        {
          planId,

          entityType:
            'PLAN_ITEM',

          entityId:
            itemId,

          revisionNumber:
            Number(
              editedPlan
                .revision_number ??
              0,
            ),

          eventType:
            'ITEM_UPDATED',

          actor:
            req.profile,

          previousStatus:
            currentItem.status,

          newStatus:
            updatedItem.status,

          beforeData:
            beforeItem,

          afterData:
            updatedItem,
        },
      )

      await client.query(
        'COMMIT',
      )

      return res.json({
        ok: true,

        planStatus:
          editedPlan.status,

        item:
          mapPlanItem(
            updatedItem,
          ),
      })
    } catch (error) {
      await rollbackSafely(
        client,
      )

      console.error(
        '[mobile.work-plan-items][PATCH]',
        error,
      )

      return res.status(500).json({
        error:
          'No fue posible modificar la visita del plan',

        code:
          'WORK_PLAN_ITEM_UPDATE_FAILED',
      })
    } finally {
      client.release()
    }
  },
)

/**
 * POST
 * /api/mobile/work-plans/:planId/items/:itemId/remove
 *
 * Retira una visita sin eliminar físicamente
 * su registro.
 */
router.post(
  '/:planId/items/:itemId/remove',
  async (req, res) => {
    const planId =
      req.params.planId

    const itemId =
      req.params.itemId

    const idError =
      validatePlanAndItemIds(
        planId,
        itemId,
      )

    if (idError) {
      return res
        .status(400)
        .json(idError)
    }

    const removalReason =
      normalizeOptionalText(
        req.body?.reason,
      )

    if (
      removalReason &&
      removalReason.length >
        1000
    ) {
      return res.status(400).json({
        error:
          'El motivo no puede superar 1000 caracteres',

        code:
          'REMOVAL_REASON_TOO_LONG',
      })
    }

    const client =
      await pool.connect()

    try {
      await client.query(
        'BEGIN',
      )

      const plan =
        await lockOwnedPlan(
          client,
          planId,
          req.profile.id,
        )

      const planError =
        validateEditablePlan(
          plan,
        )

      if (planError) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(planError.status)
          .json(planError.response)
      }

      const currentItem =
        await lockPlanItem(
          client,
          planId,
          itemId,
        )

      const itemError =
        validateEditableItem(
          currentItem,
        )

      if (itemError) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(itemError.status)
          .json(itemError.response)
      }

      const beforeItem =
        await getCompletePlanItem(
          client,
          itemId,
        )

      await client.query(
        `
        UPDATE public.work_plan_item

        SET
          removed_by = $2,
          removed_at = NOW(),
          removal_reason =
            NULLIF($3, ''),

          updated_by = $2,
          updated_at = NOW()

        WHERE id = $1
        `,
        [
          itemId,
          req.profile.id,
          removalReason,
        ],
      )

      await normalizeOrdersForDate(
        client,
        planId,

        normalizeDateValue(
          currentItem
            .scheduled_date,
        ),
      )

      const editedPlan =
        await markPlanEdited(
          client,
          plan,
          req.profile,
        )

      const removedItem =
        await getCompletePlanItem(
          client,
          itemId,
        )

      await appendWorkPlanEvent(
        client,
        {
          planId,

          entityType:
            'PLAN_ITEM',

          entityId:
            itemId,

          revisionNumber:
            Number(
              editedPlan
                .revision_number ??
              0,
            ),

          eventType:
            'ITEM_REMOVED',

          actor:
            req.profile,

          previousStatus:
            currentItem.status,

          newStatus:
            'REMOVED',

          comment:
            removalReason,

          beforeData:
            beforeItem,

          afterData:
            removedItem,
        },
      )

      await client.query(
        'COMMIT',
      )

      return res.json({
        ok: true,

        planStatus:
          editedPlan.status,

        item:
          mapPlanItem(
            removedItem,
          ),
      })
    } catch (error) {
      await rollbackSafely(
        client,
      )

      console.error(
        '[mobile.work-plan-items][remove]',
        error,
      )

      return res.status(500).json({
        error:
          'No fue posible retirar la visita del plan',

        code:
          'WORK_PLAN_ITEM_REMOVE_FAILED',
      })
    } finally {
      client.release()
    }
  },
)

/**
 * POST
 * /api/mobile/work-plans/:planId/items/reorder
 *
 * Reordena todas las visitas activas de una fecha.
 *
 * Body:
 * {
 *   scheduledDate: "2026-07-25",
 *   itemIds: ["uuid-1", "uuid-2"]
 * }
 */
router.post(
  '/:planId/items/reorder',
  async (req, res) => {
    const planId =
      req.params.planId

    if (
      !UUID_PATTERN.test(planId)
    ) {
      return res.status(400).json({
        error:
          'El identificador del plan no es válido',

        code:
          'INVALID_WORK_PLAN_ID',
      })
    }

    const scheduledDate =
      normalizeDateValue(
        req.body?.scheduledDate,
      )

    const itemIds =
      Array.isArray(
        req.body?.itemIds,
      )
        ? req.body.itemIds.map(
            (value) =>
              String(value),
          )
        : []

    if (
      !isValidIsoDate(
        scheduledDate,
      )
    ) {
      return res.status(400).json({
        error:
          'La fecha programada no es válida',

        code:
          'INVALID_SCHEDULED_DATE',
      })
    }

    if (
      itemIds.length === 0
    ) {
      return res.status(400).json({
        error:
          'Debes indicar el nuevo orden de las visitas',

        code:
          'ITEM_ORDER_REQUIRED',
      })
    }

    const invalidItemId =
      itemIds.find(
        (value) =>
          !UUID_PATTERN.test(
            value,
          ),
      )

    if (invalidItemId) {
      return res.status(400).json({
        error:
          'Uno de los identificadores de visita no es válido',

        code:
          'INVALID_PLAN_ITEM_ID',
      })
    }

    if (
      new Set(
        itemIds,
      ).size !==
      itemIds.length
    ) {
      return res.status(400).json({
        error:
          'La lista de visitas contiene identificadores repetidos',

        code:
          'DUPLICATE_PLAN_ITEM_ID',
      })
    }

    const client =
      await pool.connect()

    try {
      await client.query(
        'BEGIN',
      )

      const plan =
        await lockOwnedPlan(
          client,
          planId,
          req.profile.id,
        )

      const planError =
        validateEditablePlan(
          plan,
        )

      if (planError) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(planError.status)
          .json(planError.response)
      }

      if (
        !dateIsInsidePlan(
          scheduledDate,
          plan,
        )
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res.status(409).json({
          error:
            'La fecha se encuentra fuera del periodo del plan',

          code:
            'ITEM_OUTSIDE_PLAN_PERIOD',
        })
      }

      const currentResult =
        await client.query(
          `
          SELECT
            id,
            ord

          FROM public.work_plan_item

          WHERE plan_id = $1
            AND scheduled_date = $2
            AND removed_at IS NULL

          ORDER BY
            ord ASC,
            created_at ASC,
            id ASC

          FOR UPDATE
          `,
          [
            planId,
            scheduledDate,
          ],
        )

      const currentIds =
        currentResult.rows.map(
          (row) =>
            row.id,
        )

      const currentSet =
        new Set(
          currentIds,
        )

      const sameLength =
        currentIds.length ===
        itemIds.length

      const sameItems =
        sameLength &&
        itemIds.every(
          (id) =>
            currentSet.has(id),
        )

      if (!sameItems) {
        await client.query(
          'ROLLBACK',
        )

        return res.status(409).json({
          error:
            'El nuevo orden debe incluir exactamente todas las visitas activas de la fecha',

          code:
            'INCOMPLETE_ITEM_ORDER',
        })
      }

      for (
        let index = 0;
        index < itemIds.length;
        index += 1
      ) {
        await client.query(
          `
          UPDATE public.work_plan_item

          SET
            ord = $2,
            updated_by = $3,
            updated_at = NOW()

          WHERE id = $1
          `,
          [
            itemIds[index],
            index + 1,
            req.profile.id,
          ],
        )
      }

      const editedPlan =
        await markPlanEdited(
          client,
          plan,
          req.profile,
        )

      await appendWorkPlanEvent(
        client,
        {
          planId,

          entityType:
            'PLAN_ITEM',

          entityId:
            null,

          revisionNumber:
            Number(
              editedPlan
                .revision_number ??
              0,
            ),

          eventType:
            'ITEMS_REORDERED',

          actor:
            req.profile,

          beforeData: {
            scheduledDate,
            itemIds:
              currentIds,
          },

          afterData: {
            scheduledDate,
            itemIds,
          },

          metadata: {
            itemCount:
              itemIds.length,
          },
        },
      )

      await client.query(
        'COMMIT',
      )

      return res.json({
        ok: true,

        planStatus:
          editedPlan.status,

        scheduledDate,

        itemIds,
      })
    } catch (error) {
      await rollbackSafely(
        client,
      )

      console.error(
        '[mobile.work-plan-items][reorder]',
        error,
      )

      return res.status(500).json({
        error:
          'No fue posible reordenar las visitas',

        code:
          'WORK_PLAN_ITEMS_REORDER_FAILED',
      })
    } finally {
      client.release()
    }
  },
)

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
      'FARMACIAS'
    ) {
      return res.status(403).json({
        error:
          'Esta función está disponible únicamente para el área de Farmacias',

        code:
          'AREA_NOT_ALLOWED',
      })
    }

    req.profile = {
      ...profile,

      pharmacy_scope_mode:
        normalizePharmacyScopeMode(
          profile
            .pharmacy_scope_mode,
        ),
    }

    return next()
  } catch (error) {
    console.error(
      '[mobile.work-plan-items][profile]',
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

function requireSupervisor(
  req,
  res,
  next,
) {
  if (
    req.profile?.rol !==
    'SUPERVISOR'
  ) {
    return res.status(403).json({
      error:
        'Esta operación está disponible únicamente para supervisores',

      code:
        'SUPERVISOR_ROLE_REQUIRED',
    })
  }

  return next()
}

function getPharmacyAccessError(
  pharmacyAccess,
) {
  if (
    pharmacyAccess.status ===
    'NOT_FOUND'
  ) {
    return {
      status: 404,

      response: {
        error:
          'La farmacia seleccionada no existe',

        code:
          'PHARMACY_NOT_FOUND',
      },
    }
  }

  if (
    pharmacyAccess.status ===
    'FORBIDDEN'
  ) {
    return {
      status: 403,

      response: {
        error:
          'La farmacia seleccionada no está asignada al supervisor',

        code:
          'PHARMACY_NOT_ASSIGNED',
      },
    }
  }

  return null
}

async function lockOwnedPlan(
  client,
  planId,
  supervisorId,
) {
  const result =
    await client.query(
      `
      SELECT *

      FROM public.work_plan

      WHERE id = $1
        AND supervisor_id = $2

      FOR UPDATE
      `,
      [
        planId,
        supervisorId,
      ],
    )

  return result.rows[0] ??
    null
}

function validateEditablePlan(
  plan,
) {
  if (!plan) {
    return {
      status: 404,

      response: {
        error:
          'El plan de trabajo no existe o no pertenece al supervisor',

        code:
          'WORK_PLAN_NOT_FOUND',
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
    ![
      'DRAFT',
      'REJECTED',
    ].includes(
      plan.status,
    )
  ) {
    return {
      status: 409,

      response: {
        error:
          'El plan no puede modificarse en su estado actual',

        code:
          'WORK_PLAN_NOT_EDITABLE',
      },
    }
  }

  return null
}

async function markPlanEdited(
  client,
  currentPlan,
  actor,
) {
  const previousStatus =
    currentPlan.status

  const updateResult =
    await client.query(
      `
      UPDATE public.work_plan

      SET
        status =
          CASE
            WHEN status =
              'REJECTED'
            THEN 'DRAFT'
            ELSE status
          END,

        updated_by = $2

      WHERE id = $1

      RETURNING *
      `,
      [
        currentPlan.id,
        actor.id,
      ],
    )

  const updatedPlan =
    updateResult.rows[0]

  if (
    previousStatus ===
      'REJECTED' &&
    updatedPlan.status ===
      'DRAFT'
  ) {
    await appendWorkPlanEvent(
      client,
      {
        planId:
          updatedPlan.id,

        entityType:
          'PLAN',

        entityId:
          updatedPlan.id,

        revisionNumber:
          Number(
            updatedPlan
              .revision_number ??
            0,
          ),

        eventType:
          'PLAN_REOPENED_FOR_EDIT',

        actor,

        previousStatus:
          'REJECTED',

        newStatus:
          'DRAFT',

        comment:
          'El plan fue reabierto para realizar correcciones.',

        beforeData:
          currentPlan,

        afterData:
          updatedPlan,
      },
    )
  }

  return updatedPlan
}

async function lockPlanItem(
  client,
  planId,
  itemId,
) {
  const result =
    await client.query(
      `
      SELECT *

      FROM public.work_plan_item

      WHERE id = $1
        AND plan_id = $2

      FOR UPDATE
      `,
      [
        itemId,
        planId,
      ],
    )

  return result.rows[0] ??
    null
}

function validateEditableItem(
  item,
) {
  if (!item) {
    return {
      status: 404,

      response: {
        error:
          'La visita no existe dentro del plan',

        code:
          'WORK_PLAN_ITEM_NOT_FOUND',
      },
    }
  }

  if (item.removed_at) {
    return {
      status: 409,

      response: {
        error:
          'La visita ya fue retirada del plan',

        code:
          'WORK_PLAN_ITEM_REMOVED',
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
          'Esta actividad no es una visita programada del plan',

        code:
          'WORK_PLAN_ITEM_NOT_EDITABLE',
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
          'Solo pueden modificarse visitas pendientes',

        code:
          'WORK_PLAN_ITEM_NOT_PENDING',
      },
    }
  }

  return null
}

async function getPharmacy(
  client,
  pharmacyId,
) {
  const result =
    await client.query(
      `
      SELECT
        id,
        clues,
        unidad,
        direccion,
        region_sanitaria,
        proyecto,
        estado,
        estatus::text
          AS estatus,
        latitud,
        longitud

      FROM public.farmacia

      WHERE id = $1

      LIMIT 1
      `,
      [
        pharmacyId,
      ],
    )

  return result.rows[0] ??
    null
}

async function getCompletePlanItem(
  client,
  itemId,
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

      WHERE wpi.id = $1

      LIMIT 1
      `,
      [
        itemId,
      ],
    )

  return result.rows[0] ??
    null
}

async function placeItemAtOrder(
  client,
  {
    planId,
    itemId,
    scheduledDate,
    requestedOrder,
  },
) {
  const result =
    await client.query(
      `
      SELECT
        id

      FROM public.work_plan_item

      WHERE plan_id = $1
        AND scheduled_date = $2
        AND removed_at IS NULL
        AND id <> $3

      ORDER BY
        ord ASC,
        created_at ASC,
        id ASC

      FOR UPDATE
      `,
      [
        planId,
        scheduledDate,
        itemId,
      ],
    )

  const orderedIds =
    result.rows.map(
      (row) =>
        row.id,
    )

  const insertionIndex =
    requestedOrder ===
      null
      ? orderedIds.length
      : Math.min(
          orderedIds.length,

          Math.max(
            0,
            requestedOrder - 1,
          ),
        )

  orderedIds.splice(
    insertionIndex,
    0,
    itemId,
  )

  await updateOrders(
    client,
    orderedIds,
  )
}

async function normalizeOrdersForDate(
  client,
  planId,
  scheduledDate,
) {
  const result =
    await client.query(
      `
      SELECT
        id

      FROM public.work_plan_item

      WHERE plan_id = $1
        AND scheduled_date = $2
        AND removed_at IS NULL

      ORDER BY
        ord ASC,
        created_at ASC,
        id ASC

      FOR UPDATE
      `,
      [
        planId,
        scheduledDate,
      ],
    )

  await updateOrders(
    client,

    result.rows.map(
      (row) =>
        row.id,
    ),
  )
}

async function updateOrders(
  client,
  itemIds,
) {
  for (
    let index = 0;
    index < itemIds.length;
    index += 1
  ) {
    await client.query(
      `
      UPDATE public.work_plan_item

      SET ord = $2

      WHERE id = $1
      `,
      [
        itemIds[index],
        index + 1,
      ],
    )
  }
}

function parseCreateItemPayload(
  body = {},
) {
  const pharmacyId =
    normalizeBigIntId(
      body.pharmacyId,
    )

  const scheduledDate =
    normalizeDateValue(
      body.scheduledDate,
    )

  const scheduledTime =
    normalizeOptionalTime(
      body.scheduledTime,
    )

  const requiredResult =
    parseBooleanValue(
      body.required,
      true,
    )

  const orderResult =
    parseOptionalOrder(
      body.order,
    )

  if (!pharmacyId) {
    return {
      ok: false,

      response: {
        error:
          'La farmacia seleccionada no es válida',

        code:
          'INVALID_PHARMACY_ID',
      },
    }
  }

  if (
    !isValidIsoDate(
      scheduledDate,
    )
  ) {
    return {
      ok: false,

      response: {
        error:
          'La fecha programada no es válida',

        code:
          'INVALID_SCHEDULED_DATE',
      },
    }
  }

  if (
    scheduledTime ===
    undefined
  ) {
    return {
      ok: false,

      response: {
        error:
          'La hora programada no es válida',

        code:
          'INVALID_SCHEDULED_TIME',
      },
    }
  }

  if (!requiredResult.ok) {
    return {
      ok: false,

      response: {
        error:
          'El valor de obligatoriedad no es válido',

        code:
          'INVALID_REQUIRED_VALUE',
      },
    }
  }

  if (!orderResult.ok) {
    return {
      ok: false,

      response: {
        error:
          'El orden indicado no es válido',

        code:
          'INVALID_ITEM_ORDER',
      },
    }
  }

  return {
    ok: true,

    value: {
      pharmacyId,
      scheduledDate,
      scheduledTime,

      required:
        requiredResult.value,

      order:
        orderResult.value,
    },
  }
}

function parseUpdateItemPayload(
  body,
  currentItem,
) {
  const hasChanges =
    [
      'pharmacyId',
      'scheduledDate',
      'scheduledTime',
      'required',
      'order',
    ].some(
      (key) =>
        Object.prototype
          .hasOwnProperty
          .call(
            body ?? {},
            key,
          ),
    )

  if (!hasChanges) {
    return {
      ok: false,

      response: {
        error:
          'No se recibieron cambios para la visita',

        code:
          'NO_ITEM_CHANGES',
      },
    }
  }

  const pharmacyId =
    Object.prototype
      .hasOwnProperty
      .call(
        body,
        'pharmacyId',
      )
      ? normalizeBigIntId(
          body.pharmacyId,
        )
      : String(
          currentItem
            .pharmacy_id,
        )

  const scheduledDate =
    Object.prototype
      .hasOwnProperty
      .call(
        body,
        'scheduledDate',
      )
      ? normalizeDateValue(
          body.scheduledDate,
        )
      : normalizeDateValue(
          currentItem
            .scheduled_date,
        )

  const scheduledTime =
    Object.prototype
      .hasOwnProperty
      .call(
        body,
        'scheduledTime',
      )
      ? normalizeOptionalTime(
          body.scheduledTime,
        )
      : normalizeOptionalTime(
          currentItem
            .scheduled_time,
        )

  const requiredResult =
    Object.prototype
      .hasOwnProperty
      .call(
        body,
        'required',
      )
      ? parseBooleanValue(
          body.required,
          true,
        )
      : {
          ok: true,

          value:
            Boolean(
              currentItem.required,
            ),
        }

  const orderResult =
    Object.prototype
      .hasOwnProperty
      .call(
        body,
        'order',
      )
      ? parseOptionalOrder(
          body.order,
        )
      : {
          ok: true,

          value:
            Number(
              currentItem.ord,
            ),
        }

  if (!pharmacyId) {
    return {
      ok: false,

      response: {
        error:
          'La farmacia seleccionada no es válida',

        code:
          'INVALID_PHARMACY_ID',
      },
    }
  }

  if (
    !isValidIsoDate(
      scheduledDate,
    )
  ) {
    return {
      ok: false,

      response: {
        error:
          'La fecha programada no es válida',

        code:
          'INVALID_SCHEDULED_DATE',
      },
    }
  }

  if (
    scheduledTime ===
    undefined
  ) {
    return {
      ok: false,

      response: {
        error:
          'La hora programada no es válida',

        code:
          'INVALID_SCHEDULED_TIME',
      },
    }
  }

  if (!requiredResult.ok) {
    return {
      ok: false,

      response: {
        error:
          'El valor de obligatoriedad no es válido',

        code:
          'INVALID_REQUIRED_VALUE',
      },
    }
  }

  if (!orderResult.ok) {
    return {
      ok: false,

      response: {
        error:
          'El orden indicado no es válido',

        code:
          'INVALID_ITEM_ORDER',
      },
    }
  }

  return {
    ok: true,

    value: {
      pharmacyId,
      scheduledDate,
      scheduledTime,

      required:
        requiredResult.value,

      order:
        orderResult.value,
    },
  }
}

function validatePlanAndItemIds(
  planId,
  itemId,
) {
  if (
    !UUID_PATTERN.test(planId)
  ) {
    return {
      error:
        'El identificador del plan no es válido',

      code:
        'INVALID_WORK_PLAN_ID',
    }
  }

  if (
    !UUID_PATTERN.test(itemId)
  ) {
    return {
      error:
        'El identificador de la visita no es válido',

      code:
        'INVALID_PLAN_ITEM_ID',
    }
  }

  return null
}

function normalizeBigIntId(
  value,
) {
  const normalized =
    String(
      value ?? '',
    ).trim()

  return BIGINT_PATTERN.test(
    normalized,
  )
    ? normalized
    : null
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
      .slice(0, 10)
  }

  return String(
    value ?? '',
  ).trim()
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

  return (
    !Number.isNaN(
      date.getTime(),
    ) &&
    date
      .toISOString()
      .slice(0, 10) ===
      value
  )
}

function normalizeOptionalTime(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  const normalized =
    String(value).trim()

  const match =
    normalized.match(
      TIME_PATTERN,
    )

  if (!match) {
    return undefined
  }

  const seconds =
    match[3] ?? '00'

  return `${match[1]}:${match[2]}:${seconds}`
}

function parseBooleanValue(
  value,
  fallback,
) {
  if (
    value === undefined
  ) {
    return {
      ok: true,
      value: fallback,
    }
  }

  if (
    value === true ||
    value === false
  ) {
    return {
      ok: true,
      value,
    }
  }

  if (
    value === 1 ||
    value === '1' ||
    value === 'true'
  ) {
    return {
      ok: true,
      value: true,
    }
  }

  if (
    value === 0 ||
    value === '0' ||
    value === 'false'
  ) {
    return {
      ok: true,
      value: false,
    }
  }

  return {
    ok: false,
    value: fallback,
  }
}

function parseOptionalOrder(
  value,
) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return {
      ok: true,
      value: null,
    }
  }

  const parsed =
    Number(value)

  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > 10000
  ) {
    return {
      ok: false,
      value: null,
    }
  }

  return {
    ok: true,
    value: parsed,
  }
}

function dateIsInsidePlan(
  scheduledDate,
  plan,
) {
  const periodStart =
    normalizeDateValue(
      plan.period_start,
    )

  const periodEnd =
    normalizeDateValue(
      plan.period_end,
    )

  return (
    scheduledDate >=
      periodStart &&
    scheduledDate <=
      periodEnd
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

function toNullableNumber(
  value,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null
  }

  const parsed =
    Number(value)

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null
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
      '[mobile.work-plan-items][rollback]',
      rollbackError,
    )
  }
}

export default router
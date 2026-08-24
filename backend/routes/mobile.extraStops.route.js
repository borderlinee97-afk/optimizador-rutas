import { Router } from 'express'

import { pool } from '../db/pool.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ALLOWED_CATEGORIES = new Set([
  'DOCUMENT_DELIVERY',
  'SERVICE_PAYMENT',
  'MATERIAL_PICKUP',
  'ADMINISTRATIVE_PROCEDURE',
  'OPERATIONAL_SUPPORT',
  'OTHER'
])

const ALLOWED_CANCELLATION_REASONS =
  new Set([
    'PRIORITY_CHANGED',
    'REQUEST_CANCELLED',
    'DUPLICATE_STOP',
    'LOCATION_UNAVAILABLE',
    'CREATED_BY_MISTAKE',
    'OTHER'
  ])

router.use(requireAuth)
router.use(loadSupervisorProfile)

/**
 * POST /api/mobile/farmacias/extra-stops
 *
 * Agrega una parada adicional al plan APPROVED
 * del supervisor autenticado.
 */
router.post('/', async (req, res) => {
  const payload =
    parseExtraStopPayload(req.body)

  if (!payload.ok) {
    return res
      .status(payload.status)
      .json(payload.response)
  }

  const client =
    await pool.connect()

  try {
    await client.query('BEGIN')

    /*
     * Se bloquea el plan para evitar que dos
     * solicitudes obtengan el mismo número
     * de orden.
     */
    const planResult =
      await client.query(
        `
        SELECT
          wp.id,
          wp.status,
          wp.period_start,
          wp.period_end

        FROM public.work_plan wp

        WHERE wp.supervisor_id = $1
          AND wp.status = 'APPROVED'
          AND CURRENT_DATE BETWEEN
            wp.period_start
            AND wp.period_end

        ORDER BY
          wp.created_at DESC

        LIMIT 1

        FOR UPDATE
        `,
        [req.profile.id]
      )

    if (planResult.rowCount === 0) {
      await client.query('ROLLBACK')

      return res.status(409).json({
        error:
          'No existe un plan autorizado para la fecha actual',
        code:
          'NO_APPROVED_PLAN_TODAY'
      })
    }

    const plan =
      planResult.rows[0]

    const orderResult =
      await client.query(
        `
        SELECT
          COALESCE(
            MAX(ord),
            0
          ) + 1 AS next_order

        FROM public.work_plan_item

        WHERE plan_id = $1
          AND scheduled_date =
            CURRENT_DATE
        `,
        [plan.id]
      )

    const nextOrder = Number(
      orderResult.rows[0].next_order
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

          cancellation_reason,
          cancellation_notes,
          cancelled_at,
          cancelled_by,

          updated_by,
          updated_at
        )
        VALUES (
          $1,
          NULL,

          CURRENT_DATE,
          NULL,
          $2,
          TRUE,
          'PENDING',

          'EXTRA_STOP',
          'SUPERVISOR_ADHOC',

          $3,
          NULLIF($4, ''),
          NULLIF($5, ''),
          $6,
          $7,

          $8,
          $9,
          $10,

          $11,
          NOW(),

          NULL,
          NULL,
          NULL,
          NULL,

          NULL,
          NULL
        )
        RETURNING
          id,
          plan_id,
          pharmacy_id,

          scheduled_date,
          scheduled_time::text,
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

          check_in_at,
          check_out_at,
          check_in_lat,
          check_in_lng,
          check_out_lat,
          check_out_lng,

          dwell_seconds,
          notes,
          skip_reason,

          cancellation_reason,
          cancellation_notes,
          cancelled_at,
          cancelled_by
        `,
        [
          plan.id,
          nextOrder,

          payload.value.name,
          payload.value.address,
          payload.value.googlePlaceId,
          payload.value.lat,
          payload.value.lng,

          payload.value.category,
          payload.value.reason,
          payload.value.estimatedMinutes,

          req.profile.id
        ]
      )

    await client.query('COMMIT')

    return res.status(201).json({
      ok: true,
      item:
        mapExtraStop(
          insertResult.rows[0]
        )
    })
  } catch (error) {
    await rollbackSafely(client)

    console.error(
      '[mobile.extra-stops][POST]',
      error
    )

    return res.status(500).json({
      error:
        'No fue posible agregar la parada adicional',
      code:
        'EXTRA_STOP_CREATE_FAILED'
    })
  } finally {
    client.release()
  }
})

/**
 * PATCH
 * /api/mobile/farmacias/extra-stops/:itemId
 *
 * Edita una parada adicional pendiente.
 *
 * No modifica:
 * - el identificador;
 * - el plan;
 * - la fecha programada;
 * - el orden;
 * - el usuario que la agregó;
 * - la fecha de incorporación.
 */
router.patch(
  '/:itemId',
  async (req, res) => {
    const itemId =
      req.params.itemId

    if (
      !UUID_PATTERN.test(itemId)
    ) {
      return res.status(400).json({
        error:
          'El identificador de la parada no es válido',
        code:
          'INVALID_EXTRA_STOP_ID'
      })
    }

    const payload =
      parseExtraStopPayload(req.body)

    if (!payload.ok) {
      return res
        .status(payload.status)
        .json(payload.response)
    }

    const client =
      await pool.connect()

    try {
      await client.query('BEGIN')

      /*
       * Se bloquea la actividad para impedir que
       * sea editada al mismo tiempo que se inicia,
       * omite o cancela.
       */
      const itemResult =
        await client.query(
          `
          SELECT
            wpi.id,
            wpi.plan_id,
            wpi.item_type,
            wpi.source,
            wpi.status,
            wpi.scheduled_date,

            wp.status AS plan_status,

            (
              wpi.scheduled_date =
                CURRENT_DATE
            ) AS is_today

          FROM public.work_plan_item wpi

          INNER JOIN public.work_plan wp
            ON wp.id = wpi.plan_id

          WHERE wpi.id = $1
            AND wp.supervisor_id = $2

          FOR UPDATE OF wpi
          `,
          [
            itemId,
            req.profile.id
          ]
        )

      if (
        itemResult.rowCount === 0
      ) {
        await client.query('ROLLBACK')

        return res.status(404).json({
          error:
            'La parada no existe o no pertenece al supervisor autenticado',
          code:
            'EXTRA_STOP_NOT_FOUND'
        })
      }

      const item =
        itemResult.rows[0]

      if (
        item.plan_status !==
        'APPROVED'
      ) {
        await client.query('ROLLBACK')

        return res.status(409).json({
          error:
            'El plan de trabajo no está autorizado',
          code:
            'PLAN_NOT_APPROVED'
        })
      }

      if (!item.is_today) {
        await client.query('ROLLBACK')

        return res.status(409).json({
          error:
            'La parada no está programada para la fecha actual',
          code:
            'ITEM_NOT_SCHEDULED_TODAY'
        })
      }

      if (
        item.item_type !==
          'EXTRA_STOP' ||
        item.source !==
          'SUPERVISOR_ADHOC'
      ) {
        await client.query('ROLLBACK')

        return res.status(409).json({
          error:
            'Esta actividad no es una parada adicional editable',
          code:
            'ITEM_NOT_EDITABLE'
        })
      }

      if (
        item.status !==
        'PENDING'
      ) {
        await client.query('ROLLBACK')

        return res.status(409).json({
          error:
            'Solo pueden editarse paradas adicionales pendientes',
          code:
            'EXTRA_STOP_NOT_PENDING'
        })
      }

      const updateResult =
        await client.query(
          `
          UPDATE public.work_plan_item

          SET
            custom_name = $2,
            custom_address =
              NULLIF($3, ''),
            google_place_id =
              NULLIF($4, ''),

            custom_lat = $5,
            custom_lng = $6,

            activity_category = $7,
            addition_reason = $8,
            estimated_minutes = $9,

            updated_by = $10,
            updated_at = NOW()

          WHERE id = $1

          RETURNING
            id,
            plan_id,
            pharmacy_id,

            scheduled_date,
            scheduled_time::text,
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

            check_in_at,
            check_out_at,
            check_in_lat,
            check_in_lng,
            check_out_lat,
            check_out_lng,

            dwell_seconds,
            notes,
            skip_reason,

            cancellation_reason,
            cancellation_notes,
            cancelled_at,
            cancelled_by
          `,
          [
            itemId,

            payload.value.name,
            payload.value.address,
            payload.value.googlePlaceId,

            payload.value.lat,
            payload.value.lng,

            payload.value.category,
            payload.value.reason,
            payload.value.estimatedMinutes,

            req.profile.id
          ]
        )

      await client.query('COMMIT')

      return res.json({
        ok: true,
        item:
          mapExtraStop(
            updateResult.rows[0]
          )
      })
    } catch (error) {
      await rollbackSafely(client)

      console.error(
        '[mobile.extra-stops][PATCH]',
        error
      )

      return res.status(500).json({
        error:
          'No fue posible editar la parada adicional',
        code:
          'EXTRA_STOP_UPDATE_FAILED'
      })
    } finally {
      client.release()
    }
  }
)

/**
 * POST
 * /api/mobile/farmacias/extra-stops/:itemId/cancel
 *
 * Cancela una parada adicional pendiente.
 *
 * No elimina el registro. Conserva:
 * - motivo;
 * - observaciones;
 * - fecha;
 * - supervisor responsable.
 */
router.post(
  '/:itemId/cancel',
  async (req, res) => {
    const itemId =
      req.params.itemId

    const reason = normalizeText(
      req.body?.reason
    )

    const notes =
      normalizeOptionalText(
        req.body?.notes
      )

    if (
      !UUID_PATTERN.test(itemId)
    ) {
      return res.status(400).json({
        error:
          'El identificador de la parada no es válido',
        code:
          'INVALID_EXTRA_STOP_ID'
      })
    }

    if (!reason) {
      return res.status(400).json({
        error:
          'Debes seleccionar un motivo de cancelación',
        code:
          'CANCELLATION_REASON_REQUIRED'
      })
    }

    if (
      !ALLOWED_CANCELLATION_REASONS.has(
        reason
      )
    ) {
      return res.status(400).json({
        error:
          'El motivo de cancelación no es válido',
        code:
          'INVALID_CANCELLATION_REASON'
      })
    }

    if (
      reason === 'OTHER' &&
      !notes
    ) {
      return res.status(400).json({
        error:
          'Describe el motivo de cancelación',
        code:
          'CANCELLATION_NOTES_REQUIRED'
      })
    }

    if (
      notes &&
      notes.length > 1000
    ) {
      return res.status(400).json({
        error:
          'Las observaciones no pueden superar 1000 caracteres',
        code:
          'CANCELLATION_NOTES_TOO_LONG'
      })
    }

    const client =
      await pool.connect()

    try {
      await client.query('BEGIN')

      const itemResult =
        await client.query(
          `
          SELECT
            wpi.id,
            wpi.plan_id,
            wpi.item_type,
            wpi.source,
            wpi.status,
            wpi.scheduled_date,

            wp.status AS plan_status,

            (
              wpi.scheduled_date =
                CURRENT_DATE
            ) AS is_today

          FROM public.work_plan_item wpi

          INNER JOIN public.work_plan wp
            ON wp.id = wpi.plan_id

          WHERE wpi.id = $1
            AND wp.supervisor_id = $2

          FOR UPDATE OF wpi
          `,
          [
            itemId,
            req.profile.id
          ]
        )

      if (
        itemResult.rowCount === 0
      ) {
        await client.query('ROLLBACK')

        return res.status(404).json({
          error:
            'La parada no existe o no pertenece al supervisor autenticado',
          code:
            'EXTRA_STOP_NOT_FOUND'
        })
      }

      const item =
        itemResult.rows[0]

      if (
        item.plan_status !==
        'APPROVED'
      ) {
        await client.query('ROLLBACK')

        return res.status(409).json({
          error:
            'El plan de trabajo no está autorizado',
          code:
            'PLAN_NOT_APPROVED'
        })
      }

      if (!item.is_today) {
        await client.query('ROLLBACK')

        return res.status(409).json({
          error:
            'La parada no está programada para la fecha actual',
          code:
            'ITEM_NOT_SCHEDULED_TODAY'
        })
      }

      if (
        item.item_type !==
          'EXTRA_STOP' ||
        item.source !==
          'SUPERVISOR_ADHOC'
      ) {
        await client.query('ROLLBACK')

        return res.status(409).json({
          error:
            'Esta actividad no es una parada adicional creada por el Supervisor',
          code:
            'ITEM_NOT_CANCELLABLE'
        })
      }

      if (
        item.status !==
        'PENDING'
      ) {
        await client.query('ROLLBACK')

        return res.status(409).json({
          error:
            'Solo pueden cancelarse paradas adicionales pendientes',
          code:
            'EXTRA_STOP_NOT_PENDING'
        })
      }

      const updateResult =
        await client.query(
          `
          UPDATE public.work_plan_item

          SET
            status = 'CANCELLED',

            cancellation_reason = $2,
            cancellation_notes =
              NULLIF($3, ''),

            cancelled_at = NOW(),
            cancelled_by = $4,

            check_in_at = NULL,
            check_out_at = NULL,

            check_in_lat = NULL,
            check_in_lng = NULL,
            check_out_lat = NULL,
            check_out_lng = NULL,

            dwell_seconds = NULL,
            skip_reason = NULL,
            notes = NULL

          WHERE id = $1

          RETURNING
            id,
            plan_id,
            pharmacy_id,

            scheduled_date,
            scheduled_time::text,
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

            check_in_at,
            check_out_at,
            check_in_lat,
            check_in_lng,
            check_out_lat,
            check_out_lng,

            dwell_seconds,
            notes,
            skip_reason,

            cancellation_reason,
            cancellation_notes,
            cancelled_at,
            cancelled_by
          `,
          [
            itemId,
            reason,
            notes,
            req.profile.id
          ]
        )

      await client.query('COMMIT')

      return res.json({
        ok: true,
        item:
          mapExtraStop(
            updateResult.rows[0]
          )
      })
    } catch (error) {
      await rollbackSafely(client)

      console.error(
        '[mobile.extra-stops][cancel]',
        error
      )

      return res.status(500).json({
        error:
          'No fue posible cancelar la parada adicional',
        code:
          'EXTRA_STOP_CANCELLATION_FAILED'
      })
    } finally {
      client.release()
    }
  }
)

async function loadSupervisorProfile(
  req,
  res,
  next
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
        [req.auth.user.id]
      )

    if (
      result.rowCount === 0
    ) {
      return res.status(403).json({
        error:
          'La cuenta no tiene un perfil operativo vinculado',
        code:
          'PROFILE_NOT_FOUND'
      })
    }

    const profile =
      result.rows[0]

    if (!profile.activo) {
      return res.status(403).json({
        error:
          'El perfil operativo se encuentra inactivo',
        code:
          'PROFILE_INACTIVE'
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
          'ROLE_NOT_ALLOWED'
      })
    }

    req.profile = profile

    return next()
  } catch (error) {
    console.error(
      '[mobile.extra-stops][profile]',
      error
    )

    return res.status(500).json({
      error:
        'No fue posible validar el perfil operativo',
      code:
        'PROFILE_VALIDATION_FAILED'
    })
  }
}

/**
 * Valida el mismo cuerpo para creación y edición.
 *
 * De esta forma ambas operaciones mantienen
 * exactamente las mismas reglas.
 */
function parseExtraStopPayload(
  body = {}
) {
  const name =
    normalizeText(body.name)

  const address =
    normalizeOptionalText(
      body.address
    )

  const googlePlaceId =
    normalizeOptionalText(
      body.googlePlaceId
    )

  const category =
    normalizeText(
      body.category
    )

  const reason =
    normalizeText(
      body.reason
    )

  const coordinates =
    parseCoordinates(body)

  const estimatedMinutes =
    parseEstimatedMinutes(
      body.estimatedMinutes
    )

  if (name.length < 3) {
    return {
      ok: false,
      status: 400,
      response: {
        error:
          'El nombre de la parada debe tener al menos 3 caracteres',
        code:
          'EXTRA_STOP_NAME_REQUIRED'
      }
    }
  }

  if (name.length > 150) {
    return {
      ok: false,
      status: 400,
      response: {
        error:
          'El nombre de la parada no puede superar 150 caracteres',
        code:
          'EXTRA_STOP_NAME_TOO_LONG'
      }
    }
  }

  if (
    address &&
    address.length > 500
  ) {
    return {
      ok: false,
      status: 400,
      response: {
        error:
          'La dirección no puede superar 500 caracteres',
        code:
          'EXTRA_STOP_ADDRESS_TOO_LONG'
      }
    }
  }

  if (
    googlePlaceId &&
    googlePlaceId.length > 255
  ) {
    return {
      ok: false,
      status: 400,
      response: {
        error:
          'El identificador de Google no es válido',
        code:
          'INVALID_GOOGLE_PLACE_ID'
      }
    }
  }

  if (
    !ALLOWED_CATEGORIES.has(
      category
    )
  ) {
    return {
      ok: false,
      status: 400,
      response: {
        error:
          'La categoría seleccionada no es válida',
        code:
          'INVALID_EXTRA_STOP_CATEGORY'
      }
    }
  }

  if (reason.length < 3) {
    return {
      ok: false,
      status: 400,
      response: {
        error:
          'Debes indicar por qué se agrega esta parada',
        code:
          'EXTRA_STOP_REASON_REQUIRED'
      }
    }
  }

  if (reason.length > 1000) {
    return {
      ok: false,
      status: 400,
      response: {
        error:
          'El motivo no puede superar 1000 caracteres',
        code:
          'EXTRA_STOP_REASON_TOO_LONG'
      }
    }
  }

  if (!coordinates.ok) {
    return {
      ok: false,
      status: 400,
      response: {
        error:
          coordinates.error,
        code:
          'INVALID_EXTRA_STOP_COORDINATES'
      }
    }
  }

  if (!estimatedMinutes.ok) {
    return {
      ok: false,
      status: 400,
      response: {
        error:
          estimatedMinutes.error,
        code:
          'INVALID_ESTIMATED_MINUTES'
      }
    }
  }

  return {
    ok: true,
    value: {
      name,
      address,
      googlePlaceId,
      category,
      reason,

      lat:
        coordinates.lat,

      lng:
        coordinates.lng,

      estimatedMinutes:
        estimatedMinutes.value
    }
  }
}

function parseCoordinates(body = {}) {
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
        'La latitud no es válida'
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
        'La longitud no es válida'
    }
  }

  return {
    ok: true,
    lat,
    lng
  }
}

function parseEstimatedMinutes(value) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return {
      ok: true,
      value: null
    }
  }

  const parsed =
    Number(value)

  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > 480
  ) {
    return {
      ok: false,
      error:
        'El tiempo estimado debe estar entre 1 y 480 minutos'
    }
  }

  return {
    ok: true,
    value: parsed
  }
}

function normalizeText(value) {
  return String(
    value ?? ''
  ).trim()
}

function normalizeOptionalText(value) {
  const normalized =
    String(
      value ?? ''
    ).trim()

  return normalized || null
}

function mapExtraStop(row) {
  return {
    id:
      row.id,

    planId:
      row.plan_id,

    pharmacyId:
      null,

    itemType:
      row.item_type ??
      'EXTRA_STOP',

    source:
      row.source ??
      'SUPERVISOR_ADHOC',

    clues:
      null,

    name:
      row.custom_name,

    address:
      row.custom_address,

    region:
      null,

    project:
      null,

    lat:
      row.custom_lat === null ||
      row.custom_lat === undefined
        ? null
        : Number(
            row.custom_lat
          ),

    lng:
      row.custom_lng === null ||
      row.custom_lng === undefined
        ? null
        : Number(
            row.custom_lng
          ),

    scheduledDate:
      row.scheduled_date,

    scheduledTime:
      row.scheduled_time,

    order:
      Number(
        row.ord
      ),

    required:
      Boolean(
        row.required
      ),

    status:
      row.status,

    googlePlaceId:
      row.google_place_id,

    activityCategory:
      row.activity_category,

    additionReason:
      row.addition_reason,

    estimatedMinutes:
      row.estimated_minutes === null ||
      row.estimated_minutes === undefined
        ? null
        : Number(
            row.estimated_minutes
          ),

    addedBy:
      row.added_by,

    addedAt:
      row.added_at,

    updatedBy:
      row.updated_by,

    updatedAt:
      row.updated_at,

    checkInAt:
      row.check_in_at,

    checkOutAt:
      row.check_out_at,

    checkInLat:
      row.check_in_lat === null ||
      row.check_in_lat === undefined
        ? null
        : Number(
            row.check_in_lat
          ),

    checkInLng:
      row.check_in_lng === null ||
      row.check_in_lng === undefined
        ? null
        : Number(
            row.check_in_lng
          ),

    checkOutLat:
      row.check_out_lat === null ||
      row.check_out_lat === undefined
        ? null
        : Number(
            row.check_out_lat
          ),

    checkOutLng:
      row.check_out_lng === null ||
      row.check_out_lng === undefined
        ? null
        : Number(
            row.check_out_lng
          ),

    dwellSeconds:
      row.dwell_seconds === null ||
      row.dwell_seconds === undefined
        ? null
        : Number(
            row.dwell_seconds
          ),

    notes:
      row.notes,

    skipReason:
      row.skip_reason,

    cancellationReason:
      row.cancellation_reason,

    cancellationNotes:
      row.cancellation_notes,

    cancelledAt:
      row.cancelled_at,

    cancelledBy:
      row.cancelled_by
  }
}

async function rollbackSafely(client) {
  try {
    await client.query('ROLLBACK')
  } catch (rollbackError) {
    console.error(
      '[mobile.extra-stops][rollback]',
      rollbackError
    )
  }
}

export default router
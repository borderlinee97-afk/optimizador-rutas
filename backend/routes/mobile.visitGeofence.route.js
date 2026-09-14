import { Router } from 'express'

import { pool } from '../db/pool.js'
import { requireAuth } from '../middleware/requireAuth.js'
import {
  evaluateVisitGeofence,
  getVisitGeofenceConfig,
} from '../services/visitGeofence.service.js'

const router = Router()

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

router.use(requireAuth)

router.post(
  '/items/:itemId/check-in',
  validateVisitLocation('CHECK_IN'),
)

router.post(
  '/items/:itemId/check-out',
  validateVisitLocation('CHECK_OUT'),
)

function validateVisitLocation(action) {
  return async (req, res, next) => {
    const itemId = String(
      req.params.itemId ?? '',
    )

    if (!UUID_PATTERN.test(itemId)) {
      return next()
    }

    const location = parseLocation(
      req.body,
    )

    if (!location.ok) {
      return res.status(400).json({
        error: location.error,
        code: location.code,
      })
    }

    try {
      const result =
        await pool.query(
          `
          SELECT
            p.id AS person_id,

            COALESCE(
              wpi.custom_lat,
              f.latitud::double precision
            ) AS target_lat,

            COALESCE(
              wpi.custom_lng,
              f.longitud::double precision
            ) AS target_lng

          FROM public.work_plan_item wpi

          INNER JOIN public.work_plan wp
            ON wp.id = wpi.plan_id

          INNER JOIN public.personas p
            ON p.id = wp.supervisor_id

          LEFT JOIN public.farmacia f
            ON f.id = wpi.pharmacy_id

          WHERE wpi.id = $1
            AND p.auth_user_id = $2
            AND p.activo = TRUE
            AND p.area::text = 'FARMACIAS'
            AND p.rol::text = 'SUPERVISOR'
            AND wp.archived_at IS NULL
            AND wpi.removed_at IS NULL

          LIMIT 1
          `,
          [
            itemId,
            req.auth.user.id,
          ],
        )

      if (result.rowCount === 0) {
        return next()
      }

      const target =
        result.rows[0]

      const evaluation =
        evaluateVisitGeofence(
          {
            lat:
              location.lat,

            lng:
              location.lng,

            accuracyM:
              location.accuracyM,

            mocked:
              location.mocked,

            targetLat:
              target.target_lat,

            targetLng:
              target.target_lng,
          },

          getVisitGeofenceConfig(),
        )

      await pool.query(
        `
        INSERT INTO public.visit_geofence_attempt (
          person_id,
          plan_item_id,
          action,
          lat,
          lng,
          accuracy_m,
          mocked,
          target_lat,
          target_lng,
          distance_m,
          radius_m,
          max_accuracy_m,
          result,
          allowed
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13, $14
        )
        `,
        [
          target.person_id,
          itemId,
          action,
          location.lat,
          location.lng,
          location.accuracyM,
          location.mocked,
          numberOrNull(
            target.target_lat,
          ),
          numberOrNull(
            target.target_lng,
          ),
          evaluation.distanceM,
          evaluation.radiusM,
          evaluation.maxAccuracyM,
          evaluation.result,
          evaluation.allowed,
        ],
      )

      if (!evaluation.allowed) {
        return res
          .status(
            evaluation.httpStatus ||
              422,
          )
          .json({
            error:
              evaluation.message,

            code:
              evaluation.code,

            geofence: {
              result:
                evaluation.result,

              distanceM:
                roundOrNull(
                  evaluation.distanceM,
                ),

              radiusM:
                evaluation.radiusM,

              accuracyM:
                evaluation.accuracyM,

              maxAccuracyM:
                evaluation.maxAccuracyM,
            },
          })
      }

      return next()
    } catch (error) {
      console.error(
        '[mobile.visit-geofence]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'Could not validate visit location',

          code:
            'GEOFENCE_VALIDATION_FAILED',
        })
    }
  }
}

function parseLocation(
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
      code:
        'INVALID_EXECUTION_COORDINATES',
      error:
        'Invalid latitude',
    }
  }

  if (
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180
  ) {
    return {
      ok: false,
      code:
        'INVALID_EXECUTION_COORDINATES',
      error:
        'Invalid longitude',
    }
  }

  let accuracyM =
    null

  if (
    body.accuracyM != null ||
    body.accuracy != null
  ) {
    accuracyM =
      Number(
        body.accuracyM ??
          body.accuracy,
      )

    if (
      !Number.isFinite(
        accuracyM,
      ) ||
      accuracyM < 0
    ) {
      return {
        ok: false,
        code:
          'INVALID_LOCATION_ACCURACY',
        error:
          'Invalid GPS accuracy',
      }
    }
  }

  return {
    ok: true,
    lat,
    lng,
    accuracyM,
    mocked:
      body.mocked === true,
  }
}

function numberOrNull(
  value,
) {
  if (
    value == null ||
    value === ''
  ) {
    return null
  }

  const parsed =
    Number(value)

  return Number.isFinite(parsed)
    ? parsed
    : null
}

function roundOrNull(
  value,
) {
  return Number.isFinite(value)
    ? Math.round(
        value * 10,
      ) / 10
    : null
}

export default router

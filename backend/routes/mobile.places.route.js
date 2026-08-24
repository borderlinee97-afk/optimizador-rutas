import 'dotenv/config'
import { Router } from 'express'

import { pool } from '../db/pool.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

const GOOGLE_PLACES_API_KEY =
  process.env.GOOGLE_PLACES_API_KEY ??
  process.env.GMAPS_API_KEY ??
  process.env.GOOGLE_MAPS_API_KEY

console.log(
  '[mobile.places] Google Places configurado:',
  Boolean(GOOGLE_PLACES_API_KEY)
)

const GOOGLE_AUTOCOMPLETE_URL =
  'https://places.googleapis.com/v1/places:autocomplete'

const SESSION_TOKEN_PATTERN =
  /^[A-Za-z0-9_-]{1,36}$/

router.use(requireAuth)
router.use(loadSupervisorProfile)

/**
 * POST /api/mobile/places/autocomplete
 *
 * Devuelve sugerencias de Google Places para
 * supervisores autenticados.
 */
router.post(
  '/autocomplete',
  async (req, res) => {
    if (!GOOGLE_PLACES_API_KEY) {
      return res.status(503).json({
        error:
          'La integración con Google Places no está configurada',
        code: 'PLACES_NOT_CONFIGURED'
      })
    }

    const input = normalizeText(
      req.body?.input
    )

    const sessionToken = normalizeText(
      req.body?.sessionToken
    )

    if (input.length < 3) {
      return res.status(400).json({
        error:
          'Escribe al menos 3 caracteres para buscar',
        code: 'PLACES_INPUT_TOO_SHORT'
      })
    }

    if (input.length > 150) {
      return res.status(400).json({
        error:
          'La búsqueda no puede superar 150 caracteres'
      })
    }

    if (
      !SESSION_TOKEN_PATTERN.test(
        sessionToken
      )
    ) {
      return res.status(400).json({
        error:
          'El token de búsqueda no es válido',
        code: 'INVALID_PLACES_SESSION_TOKEN'
      })
    }

    const location =
      parseOptionalCoordinates(
        req.body
      )

    if (!location.ok) {
      return res.status(400).json({
        error: location.error
      })
    }

    const googleBody = {
      input,
      languageCode: 'es-MX',
      regionCode: 'mx',
      includedRegionCodes: [
        'mx'
      ],
      includeQueryPredictions: false,
      sessionToken
    }

    if (
      location.lat !== null &&
      location.lng !== null
    ) {
      googleBody.locationBias = {
        circle: {
          center: {
            latitude: location.lat,
            longitude: location.lng
          },
          radius: 50000
        }
      }

      googleBody.origin = {
        latitude: location.lat,
        longitude: location.lng
      }
    }

    try {
      const googleResponse =
        await fetch(
          GOOGLE_AUTOCOMPLETE_URL,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              'X-Goog-Api-Key':
                GOOGLE_PLACES_API_KEY
            },
            body: JSON.stringify(
              googleBody
            )
          }
        )

      const googlePayload =
        await readGoogleResponse(
          googleResponse
        )

      if (!googleResponse.ok) {
        logGoogleError(
          'autocomplete',
          googleResponse.status,
          googlePayload
        )

        return res.status(502).json({
          error:
            getSafeGoogleErrorMessage(
              googlePayload,
              'No fue posible buscar lugares'
            ),
          code: 'GOOGLE_PLACES_ERROR'
        })
      }

      const suggestions =
        Array.isArray(
          googlePayload.suggestions
        )
          ? googlePayload.suggestions
          : []

      const predictions = suggestions
        .map(
          (suggestion) =>
            suggestion?.placePrediction
        )
        .filter(Boolean)
        .map(mapPrediction)
        .filter(
          (prediction) =>
            prediction.placeId &&
            prediction.text
        )

      return res.json({
        predictions
      })
    } catch (error) {
      console.error(
        '[mobile.places][autocomplete]',
        error
      )

      return res.status(502).json({
        error:
          'No fue posible conectar con Google Places',
        code: 'GOOGLE_PLACES_CONNECTION_ERROR'
      })
    }
  }
)

/**
 * POST /api/mobile/places/details
 *
 * Recupera los datos completos de una sugerencia
 * seleccionada.
 */
router.post(
  '/details',
  async (req, res) => {
    if (!GOOGLE_PLACES_API_KEY) {
      return res.status(503).json({
        error:
          'La integración con Google Places no está configurada',
        code: 'PLACES_NOT_CONFIGURED'
      })
    }

    const placeId = normalizeText(
      req.body?.placeId
    )

    const sessionToken = normalizeText(
      req.body?.sessionToken
    )

    if (
      !placeId ||
      placeId.length > 255
    ) {
      return res.status(400).json({
        error:
          'El lugar seleccionado no es válido',
        code: 'INVALID_PLACE_ID'
      })
    }

    if (
      !SESSION_TOKEN_PATTERN.test(
        sessionToken
      )
    ) {
      return res.status(400).json({
        error:
          'El token de búsqueda no es válido',
        code: 'INVALID_PLACES_SESSION_TOKEN'
      })
    }

    const detailsUrl = new URL(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(
        placeId
      )}`
    )

    detailsUrl.searchParams.set(
      'languageCode',
      'es-MX'
    )

    detailsUrl.searchParams.set(
      'regionCode',
      'mx'
    )

    detailsUrl.searchParams.set(
      'sessionToken',
      sessionToken
    )

    try {
      const googleResponse =
        await fetch(
          detailsUrl,
          {
            method: 'GET',
            headers: {
              'Content-Type':
                'application/json',
              'X-Goog-Api-Key':
                GOOGLE_PLACES_API_KEY,
              'X-Goog-FieldMask':
                [
                  'id',
                  'displayName',
                  'formattedAddress',
                  'location',
                  'types'
                ].join(',')
            }
          }
        )

      const googlePayload =
        await readGoogleResponse(
          googleResponse
        )

      if (!googleResponse.ok) {
        logGoogleError(
          'details',
          googleResponse.status,
          googlePayload
        )

        return res.status(502).json({
          error:
            getSafeGoogleErrorMessage(
              googlePayload,
              'No fue posible obtener los datos del lugar'
            ),
          code: 'GOOGLE_PLACES_ERROR'
        })
      }

      const lat = Number(
        googlePayload?.location
          ?.latitude
      )

      const lng = Number(
        googlePayload?.location
          ?.longitude
      )

      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
      ) {
        console.error(
          '[mobile.places][details] Lugar sin coordenadas:',
          {
            placeId,
            googlePayload
          }
        )

        return res.status(502).json({
          error:
            'Google Places no devolvió coordenadas para este lugar',
          code: 'PLACE_WITHOUT_COORDINATES'
        })
      }

      return res.json({
        place: {
          placeId:
            googlePayload.id ??
            placeId,

          name:
            googlePayload
              ?.displayName
              ?.text ??
            'Lugar seleccionado',

          address:
            googlePayload
              ?.formattedAddress ??
            null,

          lat,
          lng,

          types:
            Array.isArray(
              googlePayload.types
            )
              ? googlePayload.types
              : []
        }
      })
    } catch (error) {
      console.error(
        '[mobile.places][details]',
        error
      )

      return res.status(502).json({
        error:
          'No fue posible conectar con Google Places',
        code: 'GOOGLE_PLACES_CONNECTION_ERROR'
      })
    }
  }
)

async function loadSupervisorProfile(
  req,
  res,
  next
) {
  try {
    const result = await pool.query(
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

    if (result.rowCount === 0) {
      return res.status(403).json({
        error:
          'La cuenta no tiene un perfil operativo vinculado',
        code: 'PROFILE_NOT_FOUND'
      })
    }

    const profile =
      result.rows[0]

    if (!profile.activo) {
      return res.status(403).json({
        error:
          'El perfil operativo se encuentra inactivo',
        code: 'PROFILE_INACTIVE'
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
        code: 'ROLE_NOT_ALLOWED'
      })
    }

    req.profile = profile

    return next()
  } catch (error) {
    console.error(
      '[mobile.places][profile]',
      error
    )

    return res.status(500).json({
      error:
        'No fue posible validar el perfil operativo'
    })
  }
}

function mapPrediction(
  prediction
) {
  const structured =
    prediction
      ?.structuredFormat

  const mainText =
    structured
      ?.mainText
      ?.text ??
    prediction
      ?.text
      ?.text ??
    ''

  const secondaryText =
    structured
      ?.secondaryText
      ?.text ??
    ''

  return {
    placeId:
      prediction.placeId ??
      null,

    text:
      prediction
        ?.text
        ?.text ??
      mainText,

    mainText,

    secondaryText,

    types:
      Array.isArray(
        prediction.types
      )
        ? prediction.types
        : [],

    distanceMeters:
      Number.isFinite(
        Number(
          prediction.distanceMeters
        )
      )
        ? Number(
            prediction.distanceMeters
          )
        : null
  }
}

function parseOptionalCoordinates(
  body = {}
) {
  const hasLat =
    body.lat !== undefined &&
    body.lat !== null &&
    body.lat !== ''

  const hasLng =
    body.lng !== undefined &&
    body.lng !== null &&
    body.lng !== ''

  if (!hasLat && !hasLng) {
    return {
      ok: true,
      lat: null,
      lng: null
    }
  }

  if (!hasLat || !hasLng) {
    return {
      ok: false,
      error:
        'La ubicación de referencia está incompleta'
    }
  }

  const lat = Number(
    body.lat
  )

  const lng = Number(
    body.lng
  )

  if (
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90
  ) {
    return {
      ok: false,
      error:
        'La latitud de referencia no es válida'
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
        'La longitud de referencia no es válida'
    }
  }

  return {
    ok: true,
    lat,
    lng
  }
}

async function readGoogleResponse(
  response
) {
  const rawBody =
    await response.text()

  if (!rawBody) {
    return {}
  }

  try {
    return JSON.parse(
      rawBody
    )
  } catch {
    return {
      rawBody
    }
  }
}

function getSafeGoogleErrorMessage(
  payload,
  fallback
) {
  const message =
    payload
      ?.error
      ?.message

  if (
    typeof message ===
      'string' &&
    message.trim()
  ) {
    return message
  }

  return fallback
}

function logGoogleError(
  operation,
  status,
  payload
) {
  console.error(
    `[mobile.places][${operation}] Google respondió con error:`,
    {
      status,
      googleStatus:
        payload
          ?.error
          ?.status ??
        null,
      message:
        payload
          ?.error
          ?.message ??
        null
    }
  )
}

function normalizeText(
  value
) {
  return String(
    value ?? ''
  ).trim()
}

export default router
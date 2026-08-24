import { Router } from 'express'

const router = Router()

/**
 * POST /api/mobile/geo/ping
 *
 * Endpoint temporal para recibir check-in y check-out
 * mientras terminamos la persistencia real de visitas.
 */
router.post('/ping', async (req, res) => {
  const {
    type,
    lat,
    lng,
    planItemId,
    timestamp
  } = req.body ?? {}

  if (!['IN', 'OUT'].includes(type)) {
    return res.status(400).json({
      error: 'El tipo debe ser IN u OUT'
    })
  }

  const parsedLat = Number(lat)
  const parsedLng = Number(lng)
  const parsedTimestamp = Number(timestamp)

  if (
    !Number.isFinite(parsedLat) ||
    parsedLat < -90 ||
    parsedLat > 90
  ) {
    return res.status(400).json({
      error: 'Latitud inválida'
    })
  }

  if (
    !Number.isFinite(parsedLng) ||
    parsedLng < -180 ||
    parsedLng > 180
  ) {
    return res.status(400).json({
      error: 'Longitud inválida'
    })
  }

  if (
    planItemId === undefined ||
    planItemId === null ||
    String(planItemId).trim() === ''
  ) {
    return res.status(400).json({
      error: 'planItemId es requerido'
    })
  }

  if (!Number.isFinite(parsedTimestamp)) {
    return res.status(400).json({
      error: 'timestamp inválido'
    })
  }

  const geoEvent = {
    type,
    planItemId: String(planItemId),
    lat: parsedLat,
    lng: parsedLng,
    timestamp: parsedTimestamp,
    receivedAt: new Date().toISOString()
  }

  console.log('[mobile.geo] Evento recibido:', geoEvent)

  return res.status(201).json({
    ok: true,
    event: geoEvent
  })
})

export default router
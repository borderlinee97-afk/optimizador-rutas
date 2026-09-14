const EARTH_RADIUS_M = 6371008.8

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function parseBoolean(value, fallback) {
  if (value == null || value === '') {
    return fallback
  }

  const normalized = String(value).trim().toLowerCase()

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }

  return fallback
}

function toRadians(value) {
  return value * (Math.PI / 180)
}

function isValidLatitude(value) {
  return Number.isFinite(value) && value >= -90 && value <= 90
}

function isValidLongitude(value) {
  return Number.isFinite(value) && value >= -180 && value <= 180
}

export function getVisitGeofenceConfig(env = process.env) {
  return {
    radiusM: parsePositiveNumber(
      env.GEOFENCE_RADIUS_M,
      200,
    ),

    maxAccuracyM: parsePositiveNumber(
      env.GEOFENCE_MAX_ACCURACY_M,
      100,
    ),

    requireAccuracy: parseBoolean(
      env.GEOFENCE_REQUIRE_ACCURACY,
      false,
    ),

    rejectMocked: parseBoolean(
      env.GEOFENCE_REJECT_MOCKED,
      true,
    ),
  }
}

export function haversineDistanceMeters(
  first,
  second,
) {
  const lat1 = Number(first?.lat)
  const lng1 = Number(first?.lng)
  const lat2 = Number(second?.lat)
  const lng2 = Number(second?.lng)

  if (
    !isValidLatitude(lat1) ||
    !isValidLongitude(lng1) ||
    !isValidLatitude(lat2) ||
    !isValidLongitude(lng2)
  ) {
    return null
  }

  const deltaLat = toRadians(lat2 - lat1)
  const deltaLng = toRadians(lng2 - lng1)
  const lat1Rad = toRadians(lat1)
  const lat2Rad = toRadians(lat2)

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLng / 2) ** 2

  const c = 2 * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(1 - a),
  )

  return EARTH_RADIUS_M * c
}

export function evaluateVisitGeofence(
  input,
  config = getVisitGeofenceConfig(),
) {
  const lat = Number(input?.lat)
  const lng = Number(input?.lng)
  const targetLat = Number(input?.targetLat)
  const targetLng = Number(input?.targetLng)

  const accuracyRaw = input?.accuracyM
  const accuracyM =
    accuracyRaw == null || accuracyRaw === ''
      ? null
      : Number(accuracyRaw)

  const mocked = input?.mocked === true

  if (
    !isValidLatitude(targetLat) ||
    !isValidLongitude(targetLng)
  ) {
    return {
      allowed: false,
      code: 'DESTINATION_COORDINATES_MISSING',
      result: 'TARGET_MISSING',
      httpStatus: 409,
      message:
        'La actividad no tiene coordenadas de destino válidas. Solicita la corrección de la unidad antes de registrar la visita.',
      distanceM: null,
      accuracyM,
      ...config,
    }
  }

  const distanceM = haversineDistanceMeters(
    { lat, lng },
    { lat: targetLat, lng: targetLng },
  )

  if (distanceM == null) {
    return {
      allowed: false,
      code: 'INVALID_EXECUTION_COORDINATES',
      result: 'INVALID_LOCATION',
      httpStatus: 400,
      message: 'La ubicación enviada no es válida.',
      distanceM: null,
      accuracyM,
      ...config,
    }
  }

  if (config.rejectMocked && mocked) {
    return {
      allowed: false,
      code: 'MOCK_LOCATION_DETECTED',
      result: 'MOCK_LOCATION',
      httpStatus: 422,
      message:
        'El dispositivo reportó una ubicación simulada. Desactiva las ubicaciones de prueba e intenta nuevamente.',
      distanceM,
      accuracyM,
      ...config,
    }
  }

  if (
    accuracyM != null &&
    (!Number.isFinite(accuracyM) || accuracyM < 0)
  ) {
    return {
      allowed: false,
      code: 'INVALID_LOCATION_ACCURACY',
      result: 'INVALID_ACCURACY',
      httpStatus: 400,
      message: 'La precisión GPS enviada no es válida.',
      distanceM,
      accuracyM,
      ...config,
    }
  }

  if (
    config.requireAccuracy &&
    accuracyM == null
  ) {
    return {
      allowed: false,
      code: 'LOCATION_ACCURACY_REQUIRED',
      result: 'ACCURACY_REQUIRED',
      httpStatus: 422,
      message:
        'No fue posible validar la precisión del GPS. Obtén una nueva ubicación e intenta nuevamente.',
      distanceM,
      accuracyM,
      ...config,
    }
  }

  if (
    accuracyM != null &&
    accuracyM > config.maxAccuracyM
  ) {
    return {
      allowed: false,
      code: 'LOCATION_ACCURACY_TOO_LOW',
      result: 'ACCURACY_TOO_LOW',
      httpStatus: 422,
      message:
        `La señal GPS es insuficiente (precisión aproximada ±${Math.round(accuracyM)} m). Espera una mejor señal e intenta nuevamente.`,
      distanceM,
      accuracyM,
      ...config,
    }
  }

  if (distanceM > config.radiusM) {
    return {
      allowed: false,
      code: 'OUTSIDE_GEOFENCE',
      result: 'OUTSIDE_GEOFENCE',
      httpStatus: 422,
      message:
        `Debes estar dentro de ${Math.round(config.radiusM)} m del destino para registrar esta acción. Distancia aproximada: ${Math.round(distanceM)} m.`,
      distanceM,
      accuracyM,
      ...config,
    }
  }

  return {
    allowed: true,
    code: 'GEOFENCE_ALLOWED',
    result: 'ALLOWED',
    httpStatus: 200,
    message: 'Ubicación validada.',
    distanceM,
    accuracyM,
    ...config,
  }
}

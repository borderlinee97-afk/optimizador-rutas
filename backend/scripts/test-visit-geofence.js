import assert from 'node:assert/strict'
import test from 'node:test'

import {
  evaluateVisitGeofence,
  haversineDistanceMeters,
} from '../services/visitGeofence.service.js'

const config = {
  radiusM: 200,
  maxAccuracyM: 100,
  requireAccuracy: true,
  rejectMocked: true,
}

test(
  'allows nearby location with good accuracy',
  () => {
    const result =
      evaluateVisitGeofence(
        {
          lat: 20.61790,
          lng: -103.38500,
          accuracyM: 12,
          mocked: false,
          targetLat: 20.6178668,
          targetLng: -103.3850051,
        },
        config,
      )

    assert.equal(
      result.allowed,
      true,
    )

    assert.equal(
      result.code,
      'GEOFENCE_ALLOWED',
    )

    assert.ok(
      result.distanceM < 200,
    )
  },
)

test(
  'rejects location outside radius',
  () => {
    const result =
      evaluateVisitGeofence(
        {
          lat: 20.6278668,
          lng: -103.3850051,
          accuracyM: 10,
          mocked: false,
          targetLat: 20.6178668,
          targetLng: -103.3850051,
        },
        config,
      )

    assert.equal(
      result.allowed,
      false,
    )

    assert.equal(
      result.code,
      'OUTSIDE_GEOFENCE',
    )

    assert.ok(
      result.distanceM > 200,
    )
  },
)

test(
  'rejects poor GPS accuracy',
  () => {
    const result =
      evaluateVisitGeofence(
        {
          lat: 20.6178668,
          lng: -103.3850051,
          accuracyM: 150,
          mocked: false,
          targetLat: 20.6178668,
          targetLng: -103.3850051,
        },
        config,
      )

    assert.equal(
      result.allowed,
      false,
    )

    assert.equal(
      result.code,
      'LOCATION_ACCURACY_TOO_LOW',
    )
  },
)

test(
  'rejects mocked location',
  () => {
    const result =
      evaluateVisitGeofence(
        {
          lat: 20.6178668,
          lng: -103.3850051,
          accuracyM: 10,
          mocked: true,
          targetLat: 20.6178668,
          targetLng: -103.3850051,
        },
        config,
      )

    assert.equal(
      result.allowed,
      false,
    )

    assert.equal(
      result.code,
      'MOCK_LOCATION_DETECTED',
    )
  },
)

test(
  'same point has near-zero distance',
  () => {
    const distance =
      haversineDistanceMeters(
        {
          lat: 20.6,
          lng: -103.3,
        },
        {
          lat: 20.6,
          lng: -103.3,
        },
      )

    assert.ok(
      distance < 0.001,
    )
  },
)

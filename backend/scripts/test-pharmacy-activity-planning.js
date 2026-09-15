import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parsePlannedActivitiesInput,
} from '../services/pharmacyActivity.service.js'

test(
  'normalizes planned activities',
  () => {
    const result =
      parsePlannedActivitiesInput(
        [
          {
            activityType:
              '  Revisión de inventario  ',

            note:
              '  Validar diferencias  ',
          },
          {
            activityType:
              'Supervisión documental',
          },
        ],
        {
          required:
            true,
        },
      )

    assert.equal(
      result.ok,
      true,
    )

    assert.deepEqual(
      result.value,
      [
        {
          activityType:
            'Revisión de inventario',

          note:
            'Validar diferencias',

          order:
            1,
        },
        {
          activityType:
            'Supervisión documental',

          note:
            null,

          order:
            2,
        },
      ],
    )
  },
)

test(
  'rejects missing activities when required',
  () => {
    const result =
      parsePlannedActivitiesInput(
        undefined,
        {
          required:
            true,
        },
      )

    assert.equal(
      result.ok,
      false,
    )

    assert.equal(
      result.response.code,
      'VISIT_ACTIVITIES_REQUIRED',
    )
  },
)

test(
  'rejects empty activities',
  () => {
    const result =
      parsePlannedActivitiesInput(
        [],
        {
          required:
            true,
        },
      )

    assert.equal(
      result.ok,
      false,
    )
  },
)

test(
  'rejects blank activity type',
  () => {
    const result =
      parsePlannedActivitiesInput(
        [
          {
            activityType:
              '   ',
          },
        ],
        {
          required:
            true,
        },
      )

    assert.equal(
      result.ok,
      false,
    )

    assert.equal(
      result.response.code,
      'VISIT_ACTIVITY_TYPE_REQUIRED',
    )
  },
)

test(
  'allows omitted activities on partial update',
  () => {
    const result =
      parsePlannedActivitiesInput(
        undefined,
      )

    assert.deepEqual(
      result,
      {
        ok:
          true,

        provided:
          false,

        value:
          null,
      },
    )
  },
)

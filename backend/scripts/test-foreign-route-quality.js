// backend/scripts/test-foreign-route-quality.js

import {
  evaluateOneForeignRouteQuality
} from '../routing/services/foreignRouteQuality.service.js'

/**
 * ============================================================
 * SYNTHETIC TESTS
 * ============================================================
 *
 * UGLY
 *
 * CEDIS
 * → sector este
 * → prácticamente CEDIS otra vez
 * → sector oeste
 *
 * Debe REJECT por PREMATURE_ORIGIN_RECROSS.
 *
 * GOOD
 *
 * CEDIS
 * → corredor oeste
 * → continúa corredor oeste
 * → regreso final
 *
 * Debe PASS.
 */

const origin = {
  lat:
    21.8853,

  lng:
    -102.2916
}

/**
 * ============================================================
 * UGLY
 * ============================================================
 */

const uglyPoints = [
  {
    id:
      1,

    __plannerKey:
      'id:1',

    lat:
      21.89,

    lng:
      -102.05
  },

  {
    id:
      2,

    __plannerKey:
      'id:2',

    lat:
      21.885,

    lng:
      -102.292
  },

  {
    id:
      3,

    __plannerKey:
      'id:3',

    lat:
      21.88,

    lng:
      -102.55
  },

  {
    id:
      4,

    __plannerKey:
      'id:4',

    lat:
      21.90,

    lng:
      -102.60
  }
]

const uglyPlannedRoute = {
  vehicleLabel:
    'UGLY_FOREIGN',

  requiredDays:
    2,

  pointKeys: [
    'id:1',
    'id:2',
    'id:3',
    'id:4'
  ],

  days: [
    {
      day:
        1,

      date:
        '2026-08-27',

      pointKeys: [
        'id:1',
        'id:2',
        'id:3'
      ]
    },

    {
      day:
        2,

      date:
        '2026-08-28',

      pointKeys: [
        'id:4'
      ]
    }
  ]
}

const uglyValidatedRoute = {
  schedule: {
    expeditionEndLocal: {
      secondsOfDay:
        10 *
        3600
    }
  },

  roadValidation: {
    distanceMeters:
      100000,

    decodedPolyline: [
      origin,

      {
        lat:
          21.89,

        lng:
          -102.05
      },

      {
        lat:
          21.885,

        lng:
          -102.292
      },

      {
        lat:
          21.88,

        lng:
          -102.55
      },

      {
        lat:
          21.90,

        lng:
          -102.60
      },

      origin
    ]
  }
}

/**
 * ============================================================
 * GOOD
 * ============================================================
 */

const goodPoints = [
  {
    id:
      11,

    __plannerKey:
      'id:11',

    lat:
      21.90,

    lng:
      -102.34
  },

  {
    id:
      12,

    __plannerKey:
      'id:12',

    lat:
      21.92,

    lng:
      -102.39
  },

  {
    id:
      13,

    __plannerKey:
      'id:13',

    lat:
      21.95,

    lng:
      -102.43
  },

  {
    id:
      14,

    __plannerKey:
      'id:14',

    lat:
      21.97,

    lng:
      -102.46
  },

  {
    id:
      15,

    __plannerKey:
      'id:15',

    lat:
      21.99,

    lng:
      -102.49
  },

  {
    id:
      16,

    __plannerKey:
      'id:16',

    lat:
      22.01,

    lng:
      -102.52
  }
]

const goodPlannedRoute = {
  vehicleLabel:
    'GOOD_FOREIGN',

  requiredDays:
    2,

  pointKeys:
    goodPoints.map(
      point =>
        point.__plannerKey
    ),

  days: [
    {
      day:
        1,

      date:
        '2026-08-27',

      pointKeys: [
        'id:11',
        'id:12',
        'id:13'
      ]
    },

    {
      day:
        2,

      date:
        '2026-08-28',

      pointKeys: [
        'id:14',
        'id:15',
        'id:16'
      ]
    }
  ]
}

const goodValidatedRoute = {
  schedule: {
    expeditionEndLocal: {
      secondsOfDay:
        14 *
        3600
    }
  },

  roadValidation: {
    distanceMeters:
      70000,

    decodedPolyline: [
      origin,

      {
        lat:
          21.90,

        lng:
          -102.34
      },

      {
        lat:
          21.92,

        lng:
          -102.39
      },

      {
        lat:
          21.95,

        lng:
          -102.43
      },

      {
        lat:
          21.97,

        lng:
          -102.46
      },

      {
        lat:
          21.99,

        lng:
          -102.49
      },

      {
        lat:
          22.01,

        lng:
          -102.52
      },

      origin
    ]
  }
}

/**
 * ============================================================
 * EXECUTE
 * ============================================================
 */

function printResult(
  title,
  result
) {
  console.log(
    '\n=================================================='
  )

  console.log(
    ` ${title}`
  )

  console.log(
    '=================================================='
  )

  console.dir(
    {
      status:
        result.status,

      acceptable:
        result.acceptable,

      metrics:
        result.metrics,

      days:
        result.days,

      overnightTransitions:
        result.overnightTransitions,

      flags:
        result.flags
    },
    {
      depth:
        null
    }
  )
}

const ugly =
  evaluateOneForeignRouteQuality({
    origin,

    points:
      uglyPoints,

    plannedRoute:
      uglyPlannedRoute,

    validatedRoute:
      uglyValidatedRoute
  })

const good =
  evaluateOneForeignRouteQuality({
    origin,

    points:
      goodPoints,

    plannedRoute:
      goodPlannedRoute,

    validatedRoute:
      goodValidatedRoute
  })

printResult(
  'UGLY FOREIGN',
  ugly
)

printResult(
  'GOOD FOREIGN',
  good
)

/**
 * ============================================================
 * ASSERTIONS
 * ============================================================
 */

const uglyHasCriticalRecross =
  ugly.flags.some(
    flag =>
      flag.code ===
        'PREMATURE_ORIGIN_RECROSS' &&
      flag.severity ===
        'CRITICAL'
  )

const uglyOk =
  ugly.status ===
    'REJECT' &&
  ugly.acceptable ===
    false &&
  uglyHasCriticalRecross

const goodOk =
  good.status ===
    'PASS' &&
  good.acceptable ===
    true

console.log(
  '\n=================================================='
)

console.log(
  ' VEREDICTO'
)

console.log(
  '=================================================='
)

console.log(
  `UGLY rechazado correctamente: ${
    uglyOk
      ? 'SÍ ✓'
      : 'NO'
  }`
)

console.log(
  `GOOD aceptado correctamente:  ${
    goodOk
      ? 'SÍ ✓'
      : 'NO'
  }`
)

if (
  uglyOk &&
  goodOk
) {
  console.log(
    '\nFOREIGN ROUTE QUALITY VALIDATOR OK ✓'
  )
} else {
  console.error(
    '\nFOREIGN ROUTE QUALITY VALIDATOR REQUIERE REVISIÓN.'
  )

  process.exitCode =
    1
}
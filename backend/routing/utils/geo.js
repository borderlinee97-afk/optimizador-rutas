// backend/routing/utils/geo.js

/**
 * Utilidades geográficas puras del Motor Operativo Integral.
 *
 * Este módulo NO:
 * - consulta base de datos
 * - consulta Google
 * - conoce Express
 * - conoce proyectos
 * - modifica estado
 *
 * Sólo contiene operaciones geográficas reutilizables.
 */

/**
 * Calcula la distancia geodésica aproximada entre dos puntos
 * utilizando la fórmula de Haversine.
 *
 * @param {{ lat: number, lng: number }} a
 * @param {{ lat: number, lng: number }} b
 * @returns {number} Distancia en metros.
 */
export function haversine(
  a,
  b
) {
  const toRad =
    degrees =>
      (
        degrees *
        Math.PI
      ) /
      180

  const earthRadiusMeters =
    6_371_000

  const dLat =
    toRad(
      Number(
        b.lat
      ) -
      Number(
        a.lat
      )
    )

  const dLng =
    toRad(
      Number(
        b.lng
      ) -
      Number(
        a.lng
      )
    )

  const lat1 =
    toRad(
      Number(
        a.lat
      )
    )

  const lat2 =
    toRad(
      Number(
        b.lat
      )
    )

  const sinLat =
    Math.sin(
      dLat /
      2
    )

  const sinLng =
    Math.sin(
      dLng /
      2
    )

  const value =
    (
      sinLat **
      2
    ) +
    (
      Math.cos(
        lat1
      ) *
      Math.cos(
        lat2
      ) *
      (
        sinLng **
        2
      )
    )

  return (
    2 *
    earthRadiusMeters *
    Math.asin(
      Math.sqrt(
        value
      )
    )
  )
}

/**
 * Verifica que un objeto tenga coordenadas numéricas válidas.
 *
 * Además de comprobar que sean números finitos, valida los
 * límites geográficos reales de latitud y longitud.
 *
 * @param {{ lat?: number, lng?: number } | null | undefined} point
 * @returns {boolean}
 */
export function isValidLatLng(
  point
) {
  if (
    !point
  ) {
    return false
  }

  const lat =
    Number(
      point.lat
    )

  const lng =
    Number(
      point.lng
    )

  return (
    Number.isFinite(
      lat
    ) &&
    Number.isFinite(
      lng
    ) &&
    lat >=
      -90 &&
    lat <=
      90 &&
    lng >=
      -180 &&
    lng <=
      180
  )
}

/**
 * Ordena puntos utilizando vecino más cercano.
 *
 * IMPORTANTE:
 * esta función es una heurística geométrica.
 * No sustituye tiempos/distancias reales de carretera de Google.
 *
 * Se conserva como herramienta para:
 * - preagrupación
 * - fallback
 * - clustering
 * - construcción de candidatos
 *
 * @param {Array<object>} points
 * @param {{ lat: number, lng: number }} origin
 * @returns {Array<object>}
 */
export function nearestNeighborOrder(
  points,
  origin
) {
  const pending = [
    ...(
      Array.isArray(
        points
      )
        ? points
        : []
    )
  ]

  const ordered =
    []

  let current =
    origin

  while (
    pending.length
  ) {
    let bestIdx =
      0

    let bestDist =
      Infinity

    for (
      let index = 0;
      index <
      pending.length;
      index++
    ) {
      const distance =
        haversine(
          current,
          pending[
            index
          ]
        )

      if (
        distance <
        bestDist
      ) {
        bestDist =
          distance

        bestIdx =
          index
      }
    }

    const next =
      pending.splice(
        bestIdx,
        1
      )[0]

    if (
      !next
    ) {
      break
    }

    ordered.push(
      next
    )

    current =
      next
  }

  return ordered
}

/**
 * Orden operativo utilizado por el algoritmo propio.
 *
 * Prioriza inicialmente un punto lejano y posteriormente
 * resuelve el resto mediante vecino más cercano.
 *
 * Se mantiene el comportamiento ya existente en el motor.
 *
 * @param {Array<object>} points
 * @param {{ lat: number, lng: number }} origin
 * @returns {Array<object>}
 */
export function operativeSweepOrder(
  points,
  origin
) {
  if (
    !Array.isArray(
      points
    ) ||
    points.length <=
      1
  ) {
    return [
      ...(
        Array.isArray(
          points
        )
          ? points
          : []
      )
    ]
  }

  const withScore =
    points.map(
      point => {
        const distance =
          haversine(
            origin,
            point
          )

        const angle =
          Math.atan2(
            Number(
              point.lat
            ) -
            Number(
              origin.lat
            ),

            Number(
              point.lng
            ) -
            Number(
              origin.lng
            )
          )

        return {
          point,
          distance,
          angle
        }
      }
    )

  withScore.sort(
    (
      a,
      b
    ) => {
      if (
        Math.abs(
          b.distance -
          a.distance
        ) >
        5000
      ) {
        return (
          b.distance -
          a.distance
        )
      }

      return (
        a.angle -
        b.angle
      )
    }
  )

  const farthest =
    withScore[0]
      ?.point

  const remaining =
    withScore
      .slice(
        1
      )
      .map(
        item =>
          item.point
      )

  return [
    farthest,

    ...nearestNeighborOrder(
      remaining,
      farthest ||
      origin
    )
  ].filter(
    Boolean
  )
}

/**
 * Obtiene la región sanitaria asociada a un punto de ruta.
 *
 * @param {object} point
 * @returns {string}
 */
export function getPointRegion(
  point
) {
  return (
    point
      ?.meta
      ?.region_sanitaria ||
    'SIN REGIÓN'
  )
}

/**
 * Calcula el centroide simple de un conjunto de puntos.
 *
 * @param {Array<object>} points
 * @returns {{ lat: number, lng: number }}
 */
export function getCentroid(
  points = []
) {
  const safePoints =
    Array.isArray(
      points
    )
      ? points.filter(
          isValidLatLng
        )
      : []

  if (
    !safePoints.length
  ) {
    return {
      lat:
        0,

      lng:
        0
    }
  }

  const total =
    safePoints.length

  return {
    lat:
      safePoints.reduce(
        (
          accumulator,
          point
        ) =>
          accumulator +
          Number(
            point.lat
          ),
        0
      ) /
      total,

    lng:
      safePoints.reduce(
        (
          accumulator,
          point
        ) =>
          accumulator +
          Number(
            point.lng
          ),
        0
      ) /
      total
  }
}

/**
 * Estimación geométrica del trabajo de un cluster.
 *
 * Se utiliza para comparar agrupaciones antes de solicitar
 * rutas reales a Google.
 *
 * NO representa el kilometraje final de carretera.
 *
 * @param {Array<object>} points
 * @param {{ lat: number, lng: number }} origin
 * @returns {number} Puntuación aproximada en metros.
 */
export function estimateClusterWorkload(
  points = [],
  origin
) {
  if (
    !Array.isArray(
      points
    ) ||
    !points.length ||
    !isValidLatLng(
      origin
    )
  ) {
    return 0
  }

  const validPoints =
    points.filter(
      isValidLatLng
    )

  if (
    !validPoints.length
  ) {
    return 0
  }

  const centroid =
    getCentroid(
      validPoints
    )

  const roundTrip =
    haversine(
      origin,
      centroid
    ) *
    2

  const ordered =
    nearestNeighborOrder(
      validPoints,
      centroid
    )

  let internal =
    0

  for (
    let index = 1;
    index <
    ordered.length;
    index++
  ) {
    internal +=
      haversine(
        ordered[
          index -
          1
        ],
        ordered[
          index
        ]
      )
  }

  return (
    roundTrip +
    internal
  )
}

/**
 * Divide geográficamente un cluster en dos subconjuntos.
 *
 * Se utiliza cuando necesitamos generar más grupos
 * operativos que regiones existentes.
 *
 * @param {{
 *   region: string,
 *   sourceRegion?: string,
 *   points: Array<object>
 * }} cluster
 *
 * @returns {Array<object>}
 */
export function splitClusterGeographically(
  cluster
) {
  const points =
    Array.isArray(
      cluster?.points
    )
      ? cluster.points
          .filter(
            isValidLatLng
          )
      : []

  if (
    points.length <=
      1
  ) {
    return [
      {
        ...cluster,
        points
      }
    ]
  }

  const centroid =
    getCentroid(
      points
    )

  const sorted = [
    ...points
  ].sort(
    (
      a,
      b
    ) => {
      const angleA =
        Math.atan2(
          Number(
            a.lat
          ) -
          centroid.lat,

          Number(
            a.lng
          ) -
          centroid.lng
        )

      const angleB =
        Math.atan2(
          Number(
            b.lat
          ) -
          centroid.lat,

          Number(
            b.lng
          ) -
          centroid.lng
        )

      return (
        angleA -
        angleB
      )
    }
  )

  const midpoint =
    Math.ceil(
      sorted.length /
      2
    )

  return [
    {
      region:
        `${cluster.region} A`,

      sourceRegion:
        cluster.sourceRegion ||
        cluster.region,

      points:
        sorted.slice(
          0,
          midpoint
        )
    },

    {
      region:
        `${cluster.region} B`,

      sourceRegion:
        cluster.sourceRegion ||
        cluster.region,

      points:
        sorted.slice(
          midpoint
        )
    }
  ]
}
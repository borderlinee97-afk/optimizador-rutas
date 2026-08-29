// backend/routing/services/assignment.service.js

import {
  estimateClusterWorkload,
  getCentroid,
  getPointRegion,
  haversine,
  isValidLatLng,
  splitClusterGeographically
} from '../utils/geo.js'

import {
  roundDecimal
} from '../utils/money.js'

/**
 * Servicio de asignación territorial
 * del Motor Operativo Integral.
 *
 * OBJETIVO:
 *
 * Distribuir unidades entre operadores intentando:
 *
 * - conservar regiones sanitarias
 * - evitar mezclas territoriales innecesarias
 * - formar clusters geográficos coherentes
 * - balancear aproximadamente la carga
 * - no perder ni duplicar unidades
 *
 * IMPORTANTE:
 *
 * Este servicio genera una PREASIGNACIÓN.
 *
 * La asignación final puede posteriormente
 * ser refinada por Google Route Optimization.
 *
 * ESTE SERVICIO NO:
 *
 * - consulta Google
 * - consulta PostgreSQL
 * - calcula rutas reales
 * - calcula costos
 * - conoce Express
 */

export const ASSIGNMENT_STRATEGIES =
  Object.freeze({
    TERRITORIAL:
      'TERRITORIAL',

    GOOGLE_OPTIMIZED:
      'GOOGLE_OPTIMIZED',

    MANUAL:
      'MANUAL'
  })

/**
 * Normaliza cantidad de operadores.
 *
 * Nunca genera más operadores que puntos.
 *
 * @param {unknown} value
 * @param {number} pointCount
 * @returns {number}
 */
export function normalizeOperatorCount(
  value,
  pointCount
) {
  const points =
    Math.max(
      0,
      Math.floor(
        Number(
          pointCount
        ) ||
        0
      )
    )

  if (
    points ===
    0
  ) {
    return 0
  }

  const requested =
    Math.max(
      1,
      Math.floor(
        Number(
          value
        ) ||
        1
      )
    )

  return Math.min(
    requested,
    points
  )
}

/**
 * Identificador estable para validación.
 *
 * Prioridad:
 *
 * id
 * ↓
 * coordenadas + nombre
 *
 * @param {object} point
 * @returns {string}
 */
export function getAssignmentPointKey(
  point
) {
  if (
    point?.id !=
    null
  ) {
    return (
      `id:${String(point.id)}`
    )
  }

  return [
    'geo',
    Number(
      point?.lat
    ),
    Number(
      point?.lng
    ),
    String(
      point?.nombre ||
      point?.name ||
      point
        ?.meta
        ?.nombre ||
      ''
    )
  ].join(':')
}

/**
 * Filtra puntos geográficamente utilizables.
 *
 * @param {object[]} points
 * @returns {object[]}
 */
export function normalizeAssignmentPoints(
  points = []
) {
  return (
    Array.isArray(
      points
    )
      ? points
      : []
  )
    .filter(
      isValidLatLng
    )
}

/**
 * Agrupa unidades por región sanitaria.
 *
 * @param {object[]} points
 * @returns {Map<string, object[]>}
 */
export function groupPointsByRegion(
  points = []
) {
  const groups =
    new Map()

  for (
    const point
    of normalizeAssignmentPoints(
      points
    )
  ) {
    const region =
      String(
        getPointRegion(
          point
        ) ||
        'SIN REGIÓN'
      ).trim() ||
      'SIN REGIÓN'

    if (
      !groups.has(
        region
      )
    ) {
      groups.set(
        region,
        []
      )
    }

    groups
      .get(
        region
      )
      .push(
        point
      )
  }

  return groups
}

/**
 * Construye clusters iniciales respetando regiones.
 *
 * @param {object[]} points
 * @param {object} origin
 * @returns {object[]}
 */
export function buildRegionalClusters(
  points,
  origin
) {
  const groups =
    groupPointsByRegion(
      points
    )

  return Array
    .from(
      groups.entries()
    )
    .map(
      (
        [
          region,
          regionPoints
        ]
      ) => ({
        region,

        sourceRegion:
          region,

        sourceRegions: [
          region
        ],

        points:
          regionPoints,

        centroid:
          getCentroid(
            regionPoints
          ),

        workload:
          estimateClusterWorkload(
            regionPoints,
            origin
          )
      })
    )
    .sort(
      (
        a,
        b
      ) =>
        b.workload -
        a.workload
    )
}

/**
 * Refresca métricas de un cluster.
 *
 * @param {object} cluster
 * @param {object} origin
 * @returns {object}
 */
function refreshCluster(
  cluster,
  origin
) {
  const points =
    normalizeAssignmentPoints(
      cluster?.points
    )

  const sourceRegions =
    Array.from(
      new Set(
        (
          Array.isArray(
            cluster?.sourceRegions
          )
            ? cluster.sourceRegions
            : [
                cluster
                  ?.sourceRegion ||
                cluster
                  ?.region ||
                'SIN REGIÓN'
              ]
        )
          .filter(
            Boolean
          )
      )
    )

  return {
    ...cluster,

    sourceRegions,

    points,

    centroid:
      getCentroid(
        points
      ),

    workload:
      estimateClusterWorkload(
        points,
        origin
      )
  }
}

/**
 * Distancia entre centroides de clusters.
 *
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
export function clusterDistanceMeters(
  a,
  b
) {
  const centroidA =
    a?.centroid ||
    getCentroid(
      a?.points ||
      []
    )

  const centroidB =
    b?.centroid ||
    getCentroid(
      b?.points ||
      []
    )

  if (
    !isValidLatLng(
      centroidA
    ) ||
    !isValidLatLng(
      centroidB
    )
  ) {
    return Infinity
  }

  return haversine(
    centroidA,
    centroidB
  )
}

/**
 * Une dos clusters.
 *
 * Se utiliza cuando hay menos operadores
 * que regiones sanitarias.
 *
 * @param {object} a
 * @param {object} b
 * @param {object} origin
 * @returns {object}
 */
export function mergeClusters(
  a,
  b,
  origin
) {
  const sourceRegions =
    Array.from(
      new Set([
        ...(
          a?.sourceRegions ||
          [
            a?.region
          ]
        ),

        ...(
          b?.sourceRegions ||
          [
            b?.region
          ]
        )
      ].filter(Boolean))
    )

  const regionLabel =
    sourceRegions.join(
      ' + '
    )

  return refreshCluster(
    {
      region:
        regionLabel,

      sourceRegion:
        sourceRegions[0] ||
        'SIN REGIÓN',

      sourceRegions,

      points: [
        ...(
          a?.points ||
          []
        ),

        ...(
          b?.points ||
          []
        )
      ]
    },
    origin
  )
}

/**
 * Reduce clusters hasta alcanzar
 * la cantidad de operadores.
 *
 * Selecciona primero el cluster de menor
 * carga y lo fusiona con el cluster
 * territorialmente más cercano.
 *
 * @param {object[]} inputClusters
 * @param {number} target
 * @param {object} origin
 * @returns {object[]}
 */
export function mergeClustersToTarget(
  inputClusters,
  target,
  origin
) {
  let clusters =
    (
      Array.isArray(
        inputClusters
      )
        ? inputClusters
        : []
    )
      .map(
        cluster =>
          refreshCluster(
            cluster,
            origin
          )
      )

  while (
    clusters.length >
    target
  ) {
    clusters.sort(
      (
        a,
        b
      ) =>
        a.workload -
        b.workload
    )

    const smallest =
      clusters[0]

    const remaining =
      clusters.slice(
        1
      )

    if (
      !remaining.length
    ) {
      break
    }

    let nearestIndex =
      0

    let nearestDistance =
      Infinity

    for (
      let index = 0;
      index <
      remaining.length;
      index++
    ) {
      const distance =
        clusterDistanceMeters(
          smallest,
          remaining[
            index
          ]
        )

      if (
        distance <
        nearestDistance
      ) {
        nearestDistance =
          distance

        nearestIndex =
          index
      }
    }

    const nearest =
      remaining.splice(
        nearestIndex,
        1
      )[0]

    const merged =
      mergeClusters(
        smallest,
        nearest,
        origin
      )

    clusters = [
      ...remaining,
      merged
    ]
  }

  return clusters
}

/**
 * Divide clusters hasta alcanzar
 * la cantidad requerida.
 *
 * Se divide primero el cluster
 * con mayor carga estimada.
 *
 * @param {object[]} inputClusters
 * @param {number} target
 * @param {object} origin
 * @returns {object[]}
 */
export function splitClustersToTarget(
  inputClusters,
  target,
  origin
) {
  let clusters =
    (
      Array.isArray(
        inputClusters
      )
        ? inputClusters
        : []
    )
      .map(
        cluster =>
          refreshCluster(
            cluster,
            origin
          )
      )

  while (
    clusters.length <
    target
  ) {
    const splittable =
      clusters
        .map(
          (
            cluster,
            index
          ) => ({
            cluster,
            index
          })
        )
        .filter(
          item =>
            item
              .cluster
              .points
              .length >
            1
        )
        .sort(
          (
            a,
            b
          ) =>
            b
              .cluster
              .workload -
            a
              .cluster
              .workload
        )

    if (
      !splittable.length
    ) {
      break
    }

    const {
      cluster,
      index
    } =
      splittable[0]

    const split =
      splitClusterGeographically(
        cluster
      )

    if (
      !Array.isArray(
        split
      ) ||
      split.length <
        2
    ) {
      break
    }

    const sourceRegions =
      cluster
        .sourceRegions ||
      [
        cluster.region
      ]

    const refreshedSplit =
      split.map(
        part =>
          refreshCluster(
            {
              ...part,

              sourceRegions: [
                ...sourceRegions
              ]
            },
            origin
          )
      )

    clusters.splice(
      index,
      1,
      ...refreshedSplit
    )
  }

  return clusters
}

/**
 * Construye preasignación territorial.
 *
 * @param {{
 *   points?: object[],
 *   origin: object,
 *   operatorCount?: number
 * }} params
 *
 * @returns {object}
 */
export function buildOperatorAssignments({
  points = [],
  origin,
  operatorCount = 1
} = {}) {
  const validPoints =
    normalizeAssignmentPoints(
      points
    )

  const invalidPoints =
    (
      Array.isArray(
        points
      )
        ? points
        : []
    )
      .filter(
        point =>
          !isValidLatLng(
            point
          )
      )

  if (
    !isValidLatLng(
      origin
    )
  ) {
    return {
      strategy:
        ASSIGNMENT_STRATEGIES
          .TERRITORIAL,

      assignments: [],

      invalidPoints,

      valid:
        false,

      reason:
        'INVALID_ORIGIN'
    }
  }

  if (
    !validPoints.length
  ) {
    return {
      strategy:
        ASSIGNMENT_STRATEGIES
          .TERRITORIAL,

      assignments: [],

      invalidPoints,

      valid:
        true,

      operatorCountRequested:
        Number(
          operatorCount
        ) ||
        1,

      operatorCountUsed:
        0
    }
  }

  const target =
    normalizeOperatorCount(
      operatorCount,
      validPoints.length
    )

  let clusters =
    buildRegionalClusters(
      validPoints,
      origin
    )

  /*
   * Hay más regiones que operadores.
   */
  if (
    clusters.length >
    target
  ) {
    clusters =
      mergeClustersToTarget(
        clusters,
        target,
        origin
      )
  }

  /*
   * Hay más operadores que regiones.
   */
  if (
    clusters.length <
    target
  ) {
    clusters =
      splitClustersToTarget(
        clusters,
        target,
        origin
      )
  }

  /*
   * Ordenamos por carga de mayor a menor
   * antes de numerar operadores.
   */
  clusters =
    clusters
      .map(
        cluster =>
          refreshCluster(
            cluster,
            origin
          )
      )
      .sort(
        (
          a,
          b
        ) =>
          b.workload -
          a.workload
      )

  const assignments =
    clusters.map(
      (
        cluster,
        index
      ) => ({
        operator:
          index +
          1,

        label:
          `Operador ${index + 1}`,

        strategy:
          ASSIGNMENT_STRATEGIES
            .TERRITORIAL,

        region:
          cluster.region,

        sourceRegions: [
          ...cluster.sourceRegions
        ],

        pointCount:
          cluster
            .points
            .length,

        points:
          cluster.points,

        centroid:
          cluster.centroid,

        estimatedWorkloadMeters:
          roundDecimal(
            cluster.workload,
            0
          ),

        estimatedWorkloadKm:
          roundDecimal(
            cluster.workload /
            1000,
            2
          )
      })
    )

  const validation =
    validateOperatorAssignments({
      sourcePoints:
        validPoints,

      assignments
    })

  return {
    strategy:
      ASSIGNMENT_STRATEGIES
        .TERRITORIAL,

    operatorCountRequested:
      Number(
        operatorCount
      ) ||
      1,

    operatorCountUsed:
      assignments.length,

    sourceRegionCount:
      groupPointsByRegion(
        validPoints
      ).size,

    pointCount:
      validPoints.length,

    invalidPointCount:
      invalidPoints.length,

    invalidPoints,

    assignments,

    validation,

    valid:
      validation.valid
  }
}

/**
 * Valida que ninguna unidad se pierda
 * o aparezca duplicada.
 *
 * @param {{
 *   sourcePoints?: object[],
 *   assignments?: object[]
 * }} params
 *
 * @returns {object}
 */
export function validateOperatorAssignments({
  sourcePoints = [],
  assignments = []
} = {}) {
  const sourceKeys =
    normalizeAssignmentPoints(
      sourcePoints
    )
      .map(
        getAssignmentPointKey
      )

  const assignedKeys =
    (
      Array.isArray(
        assignments
      )
        ? assignments
        : []
    )
      .flatMap(
        assignment =>
          (
            assignment?.points ||
            []
          )
            .map(
              getAssignmentPointKey
            )
      )

  const sourceCounts =
    new Map()

  const assignedCounts =
    new Map()

  for (
    const key
    of sourceKeys
  ) {
    sourceCounts.set(
      key,
      (
        sourceCounts.get(
          key
        ) ||
        0
      ) +
      1
    )
  }

  for (
    const key
    of assignedKeys
  ) {
    assignedCounts.set(
      key,
      (
        assignedCounts.get(
          key
        ) ||
        0
      ) +
      1
    )
  }

  const missing =
    []

  const duplicated =
    []

  for (
    const [
      key,
      expectedCount
    ]
    of sourceCounts
  ) {
    const actualCount =
      assignedCounts.get(
        key
      ) ||
      0

    if (
      actualCount <
      expectedCount
    ) {
      missing.push({
        key,

        expected:
          expectedCount,

        actual:
          actualCount
      })
    }

    if (
      actualCount >
      expectedCount
    ) {
      duplicated.push({
        key,

        expected:
          expectedCount,

        actual:
          actualCount
      })
    }
  }

  for (
    const [
      key,
      actualCount
    ]
    of assignedCounts
  ) {
    if (
      !sourceCounts.has(
        key
      )
    ) {
      duplicated.push({
        key,

        expected:
          0,

        actual:
          actualCount
      })
    }
  }

  return {
    valid:
      missing.length ===
        0 &&
      duplicated.length ===
        0 &&
      sourceKeys.length ===
        assignedKeys.length,

    sourcePointCount:
      sourceKeys.length,

    assignedPointCount:
      assignedKeys.length,

    missing,

    duplicated
  }
}

/**
 * Resume asignaciones.
 *
 * @param {object[]} assignments
 * @returns {object}
 */
export function summarizeOperatorAssignments(
  assignments = []
) {
  const safe =
    Array.isArray(
      assignments
    )
      ? assignments
      : []

  const pointCounts =
    safe.map(
      assignment =>
        Number(
          assignment
            ?.pointCount ??
          assignment
            ?.points
            ?.length ??
          0
        ) ||
        0
    )

  const totalPoints =
    pointCounts.reduce(
      (
        total,
        value
      ) =>
        total +
        value,
      0
    )

  const maxPoints =
    pointCounts.length
      ? Math.max(
          ...pointCounts
        )
      : 0

  const minPoints =
    pointCounts.length
      ? Math.min(
          ...pointCounts
        )
      : 0

  const averagePoints =
    pointCounts.length
      ? roundDecimal(
          totalPoints /
          pointCounts.length,
          2
        )
      : 0

  const workloads =
    safe
      .map(
        assignment =>
          Number(
            assignment
              ?.estimatedWorkloadMeters
          )
      )
      .filter(
        Number.isFinite
      )

  const totalWorkloadMeters =
    workloads.reduce(
      (
        total,
        value
      ) =>
        total +
        value,
      0
    )

  return {
    operators:
      safe.length,

    totalPoints,

    averagePointsPerOperator:
      averagePoints,

    minPointsPerOperator:
      minPoints,

    maxPointsPerOperator:
      maxPoints,

    pointImbalance:
      maxPoints -
      minPoints,

    estimatedWorkloadKm:
      roundDecimal(
        totalWorkloadMeters /
        1000,
        2
      )
  }
}
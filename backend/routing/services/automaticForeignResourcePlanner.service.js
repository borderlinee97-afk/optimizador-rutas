// backend/routing/services/automaticForeignResourcePlanner.service.js

/**
 * ============================================================
 * AUTOMATIC FOREIGN RESOURCE PLANNER
 * ============================================================
 *
 * Planificador automático para:
 *
 * FOREIGN_ROUTE
 *
 * PRINCIPIOS:
 *
 * - el usuario NO proporciona operadores disponibles
 * - el usuario NO proporciona vehículos disponibles
 * - el usuario NO decide cuántas expediciones crear
 *
 * El motor determina:
 *
 * - requiredRoutes
 * - requiredOperators
 * - requiredVehicles
 * - requiredDays
 *
 * Una ruta FOREIGN_ROUTE representa una EXPEDICIÓN
 * continua que puede abarcar varios días.
 *
 * Ejemplo:
 *
 * Expedición 1
 *
 * Día 1:
 * ORIGEN
 * → unidades
 * → cierre operativo / descanso
 *
 * Día 2:
 * descanso
 * → unidades
 * → cierre operativo / descanso
 *
 * Día 3:
 * descanso
 * → unidades
 * → ORIGEN
 *
 * ============================================================
 *
 * IMPORTANTE:
 *
 * Este módulo NO:
 *
 * - consulta Google
 * - consulta PostgreSQL
 * - busca hoteles
 * - asigna personas registradas
 * - asigna vehículos registrados
 *
 * Recibe un solveScenario() desacoplado.
 */

export const FOREIGN_PLANNER_STATUS =
  Object.freeze({
    FEASIBLE:
      'FEASIBLE',

    INFEASIBLE:
      'INFEASIBLE',

    INVALID:
      'INVALID'
  })

export const FOREIGN_SOLVE_MODE =
  Object.freeze({
    SEARCH:
      'SEARCH',

    FINAL_QUALITY:
      'FINAL_QUALITY'
  })

export const FOREIGN_ROUTE_MODE =
  'FOREIGN_ROUTE'

export const DEFAULT_FOREIGN_POLICY =
  Object.freeze({
    /*
     * Máximo operativo histórico.
     *
     * Posteriormente podrá venir
     * de configuración de proyecto.
     */
    maxForeignDays:
      3,

    shiftHours:
      8,

    serviceMinutesPerUnit:
      45,

    startClock:
      '08:00',

    lastArrivalClock:
      '16:00',

    /*
     * Esto NO significa regreso al CEDIS.
     *
     * Es únicamente tiempo de cierre operativo
     * después de la última entrega:
     *
     * - desplazarse a zona de descanso
     * - estacionar
     * - cierre/logística
     *
     * Se mantiene separado de ROUND_TRIP.
     */
    dayCloseTravelGraceMinutes:
      90,

    /*
     * Protección del planner.
     */
    maxSolverCalls:
      8
  })

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function asArray(
  value
) {
  return Array.isArray(
    value
  )
    ? value
    : []
}

function asFiniteNumber(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  const number =
    Number(value)

  return Number.isFinite(number)
    ? number
    : null
}

function positiveInteger(
  value,
  fallback
) {
  const number =
    Math.floor(
      Number(value)
    )

  if (
    !Number.isFinite(number) ||
    number < 1
  ) {
    return fallback
  }

  return number
}

function positiveNumber(
  value,
  fallback
) {
  const number =
    Number(value)

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return fallback
  }

  return number
}

function clamp(
  value,
  minimum,
  maximum
) {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      value
    )
  )
}

/**
 * ============================================================
 * CLOCK
 * ============================================================
 */

function parseClockSeconds(
  value
) {
  const match =
    String(
      value || ''
    )
      .trim()
      .match(
        /^(\d{1,2}):(\d{2})$/
      )

  if (!match) {
    return null
  }

  const hour =
    Number(match[1])

  const minute =
    Number(match[2])

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null
  }

  return (
    hour *
    3600 +
    minute *
    60
  )
}

function secondsBetweenClocks(
  startClock,
  endClock
) {
  const start =
    parseClockSeconds(
      startClock
    )

  const end =
    parseClockSeconds(
      endClock
    )

  if (
    start === null ||
    end === null
  ) {
    return null
  }

  let difference =
    end -
    start

  if (
    difference < 0
  ) {
    difference +=
      24 *
      3600
  }

  return difference
}

/**
 * ============================================================
 * POINT KEYS
 * ============================================================
 */

function getPointKey(
  point,
  index
) {
  if (
    point?.__plannerKey
  ) {
    return String(
      point.__plannerKey
    )
  }

  if (
    point?.id !== null &&
    point?.id !== undefined
  ) {
    return (
      `id:${String(point.id)}`
    )
  }

  return (
    `index:${index}`
  )
}

function getExpectedPointKeys(
  points = []
) {
  return asArray(
    points
  ).map(
    (
      point,
      index
    ) =>
      getPointKey(
        point,
        index
      )
  )
}

/**
 * ============================================================
 * POLICY
 * ============================================================
 */

export function normalizeForeignPlanningPolicy(
  input = {}
) {
  const maxForeignDays =
    clamp(
      positiveInteger(
        input.maxForeignDays,
        DEFAULT_FOREIGN_POLICY
          .maxForeignDays
      ),
      1,
      30
    )

  const shiftHours =
    positiveNumber(
      input.shiftHours,
      DEFAULT_FOREIGN_POLICY
        .shiftHours
    )

  const serviceMinutesPerUnit =
    positiveNumber(
      input.serviceMinutesPerUnit,
      DEFAULT_FOREIGN_POLICY
        .serviceMinutesPerUnit
    )

  const startClock =
    String(
      input.startClock ||
      DEFAULT_FOREIGN_POLICY
        .startClock
    ).trim()

  const lastArrivalClock =
    String(
      input.lastArrivalClock ||
      DEFAULT_FOREIGN_POLICY
        .lastArrivalClock
    ).trim()

  const dayCloseTravelGraceMinutes =
    Math.max(
      0,
      Number(
        input
          .dayCloseTravelGraceMinutes ??
        DEFAULT_FOREIGN_POLICY
          .dayCloseTravelGraceMinutes
      ) ||
      0
    )

  const serviceWindowSeconds =
    secondsBetweenClocks(
      startClock,
      lastArrivalClock
    )

  if (
    serviceWindowSeconds ===
      null ||
    serviceWindowSeconds <=
      0
  ) {
    throw new Error(
      'La política FOREIGN_ROUTE contiene un horario diario inválido.'
    )
  }

  const shiftSeconds =
    Math.round(
      shiftHours *
      3600
    )

  const serviceSecondsPerUnit =
    Math.round(
      serviceMinutesPerUnit *
      60
    )

  const dayCloseTravelGraceSeconds =
    Math.round(
      dayCloseTravelGraceMinutes *
      60
    )

  /*
   * LOWER BOUND.
   *
   * No considera traslados.
   *
   * Sólo dice:
   *
   * "ni siquiera en condiciones ideales de
   *  cero kilómetros podrían caber más de X".
   *
   * Por eso jamás se utiliza como solución.
   */
  const maximumServiceVisitsPerDay =
    Math.max(
      1,
      Math.floor(
        serviceWindowSeconds /
        serviceSecondsPerUnit
      )
    )

  const maximumServiceVisitsPerExpedition =
    maximumServiceVisitsPerDay *
    maxForeignDays

  return {
    maxForeignDays,

    shiftHours,

    shiftSeconds,

    serviceMinutesPerUnit,

    serviceSecondsPerUnit,

    startClock,

    lastArrivalClock,

    serviceWindowSeconds,

    dayCloseTravelGraceMinutes,

    dayCloseTravelGraceSeconds,

    maximumServiceVisitsPerDay,

    maximumServiceVisitsPerExpedition
  }
}

/**
 * ============================================================
 * LOWER BOUND
 * ============================================================
 */

export function calculateForeignResourceLowerBound({
  points = [],
  policy = {}
} = {}) {
  const normalized =
    normalizeForeignPlanningPolicy(
      policy
    )

  const total =
    asArray(
      points
    ).length

  if (!total) {
    return 0
  }

  return Math.max(
    1,
    Math.ceil(
      total /
      normalized
        .maximumServiceVisitsPerExpedition
    )
  )
}

/**
 * ============================================================
 * EXTRAER PUNTOS ASIGNADOS
 * ============================================================
 *
 * Soporta varias formas para facilitar
 * la integración posterior con Google.
 */

export function extractForeignRoutePointKeys(
  route
) {
  if (
    Array.isArray(
      route?.pointKeys
    )
  ) {
    return route
      .pointKeys
      .map(String)
  }

  const keys =
    []

  for (
    const day
    of asArray(
      route?.days
    )
  ) {
    if (
      Array.isArray(
        day?.pointKeys
      )
    ) {
      keys.push(
        ...day
          .pointKeys
          .map(String)
      )

      continue
    }

    for (
      const point
      of asArray(
        day?.points
      )
    ) {
      if (
        point?.__plannerKey
      ) {
        keys.push(
          String(
            point.__plannerKey
          )
        )

        continue
      }

      if (
        point?.id !== null &&
        point?.id !== undefined
      ) {
        keys.push(
          `id:${String(point.id)}`
        )
      }
    }
  }

  return keys
}

/**
 * ============================================================
 * DÍAS DE EXPEDICIÓN
 * ============================================================
 */

export function getForeignRouteDaysUsed(
  route
) {
  const explicit =
    asFiniteNumber(
      route?.requiredDays ??
      route?.daysUsed
    )

  if (
    explicit !== null
  ) {
    return Math.max(
      1,
      Math.ceil(explicit)
    )
  }

  const days =
    asArray(
      route?.days
    )

  if (
    days.length
  ) {
    return days.length
  }

  /*
   * Una ruta existente siempre consume
   * al menos un día.
   */
  return 1
}

/**
 * ============================================================
 * COBERTURA
 * ============================================================
 */

export function auditForeignCoverage({
  points = [],
  routes = []
} = {}) {
  const expected =
    getExpectedPointKeys(
      points
    )

  const expectedSet =
    new Set(
      expected
    )

  const assigned =
    asArray(
      routes
    ).flatMap(
      extractForeignRoutePointKeys
    )

  const counts =
    new Map()

  for (
    const key
    of assigned
  ) {
    counts.set(
      key,
      (
        counts.get(key) ||
        0
      ) +
      1
    )
  }

  const missing =
    expected.filter(
      key =>
        !counts.has(key)
    )

  const duplicated =
    Array.from(
      counts.entries()
    )
      .filter(
        (
          [
            _,
            count
          ]
        ) =>
          count > 1
      )
      .map(
        (
          [
            key,
            count
          ]
        ) => ({
          key,
          count
        })
      )

  const unexpected =
    Array.from(
      counts.keys()
    )
      .filter(
        key =>
          !expectedSet.has(key)
      )

  const valid =
    expected.length ===
      assigned.length &&
    missing.length ===
      0 &&
    duplicated.length ===
      0 &&
    unexpected.length ===
      0

  return {
    expected:
      expected.length,

    assigned:
      assigned.length,

    missing,

    duplicated,

    unexpected,

    valid,

    coveragePercent:
      expected.length
        ? (
            (
              expected.length -
              missing.length
            ) /
            expected.length *
            100
          )
        : 100
  }
}

/**
 * ============================================================
 * VALIDACIÓN DE UN SOLVE
 * ============================================================
 */

export function validateForeignScenarioResult({
  result,
  points = [],
  candidateResourceCount,
  policy = {}
} = {}) {
  const normalizedPolicy =
    normalizeForeignPlanningPolicy(
      policy
    )

  const routes =
    asArray(
      result?.routes
    )

  const coverage =
    auditForeignCoverage({
      points,
      routes
    })

  const usedResourceCount =
    Math.max(
      0,
      Math.floor(
        asFiniteNumber(
          result?.usedResourceCount
        ) ??
        routes.length
      )
    )

  const routeDays =
    routes.map(
      (
        route,
        index
      ) => ({
        routeIndex:
          index,

        daysUsed:
          getForeignRouteDaysUsed(
            route
          )
      })
    )

  const maxDaysUsed =
    routeDays.length
      ? Math.max(
          ...routeDays.map(
            item =>
              item.daysUsed
          )
        )
      : 0

  const routesOverDayLimit =
    routeDays.filter(
      item =>
        item.daysUsed >
        normalizedPolicy
          .maxForeignDays
    )

  const providerFeasible =
    result?.feasible !==
    false

  const resourcesValid =
    usedResourceCount >
      0 &&
    usedResourceCount <=
      Number(
        candidateResourceCount
      )

  const feasible =
    providerFeasible &&
    routes.length >
      0 &&
    resourcesValid &&
    coverage.valid &&
    routesOverDayLimit.length ===
      0 &&
    maxDaysUsed <=
      normalizedPolicy
        .maxForeignDays

  return {
    feasible,

    providerFeasible,

    candidateResourceCount:
      Number(
        candidateResourceCount
      ),

    usedResourceCount,

    routes,

    coverage,

    routeDays,

    maxDaysUsed,

    maxForeignDays:
      normalizedPolicy
        .maxForeignDays,

    routesOverDayLimit,

    violations: {
      coverage:
        !coverage.valid,

      resourceCount:
        !resourcesValid,

      maxForeignDays:
        routesOverDayLimit.length >
        0
    },

    raw:
      result
  }
}

/**
 * ============================================================
 * RESUMEN
 * ============================================================
 */

export function summarizeAutomaticForeignPlan(
  plan
) {
  if (
    !plan ||
    typeof plan !==
      'object'
  ) {
    return {
      available:
        false
    }
  }

  return {
    available:
      true,

    status:
      plan.status,

    feasible:
      plan.feasible,

    routeMode:
      plan.routeMode,

    requiredRoutes:
      plan.requiredRoutes,

    requiredOperators:
      plan.requiredOperators,

    requiredVehicles:
      plan.requiredVehicles,

    requiredDays:
      plan.requiredDays,

    coveragePercent:
      plan.coveragePercent,

    allDestinationsAssigned:
      plan.allDestinationsAssigned,

    maxForeignDays:
      plan.maxForeignDays,

    solverCalls:
      plan.solverCalls,

    lowerBound:
      plan.lowerBound
  }
}

/**
 * ============================================================
 * AUTOMATIC FOREIGN PLANNER
 * ============================================================
 */

export async function planAutomaticForeignResources({
  origin,

  points = [],

  foreignPolicy = {},

  solveScenario,

  maxCandidateResources = null,

  maxSolverCalls = null,

  finalQualityPass = true
} = {}) {
  if (
    !origin ||
    !Number.isFinite(
      Number(origin.lat)
    ) ||
    !Number.isFinite(
      Number(origin.lng)
    )
  ) {
    throw new Error(
      'planAutomaticForeignResources requiere un origen válido.'
    )
  }

  if (
    !Array.isArray(points) ||
    !points.length
  ) {
    throw new Error(
      'planAutomaticForeignResources requiere destinos.'
    )
  }

  if (
    typeof solveScenario !==
      'function'
  ) {
    throw new Error(
      'planAutomaticForeignResources requiere solveScenario().'
    )
  }

  const policy =
    normalizeForeignPlanningPolicy(
      foreignPolicy
    )

  const totalPoints =
    points.length

  const lowerBound =
    calculateForeignResourceLowerBound({
      points,

      policy
    })

  const maximumCandidates =
    clamp(
      positiveInteger(
        maxCandidateResources,
        totalPoints
      ),
      lowerBound,
      totalPoints
    )

  const solverCallLimit =
    clamp(
      positiveInteger(
        maxSolverCalls,
        DEFAULT_FOREIGN_POLICY
          .maxSolverCalls
      ),
      1,
      50
    )

  let solverCalls =
    0

  const searchTrace =
    []

  /**
   * ==========================================================
   * EJECUTAR ESCENARIO
   * ==========================================================
   */

  const executeScenario =
    async (
      candidateResourceCount,
      solveMode
    ) => {
      if (
        solverCalls >=
        solverCallLimit
      ) {
        throw new Error(
          `Se alcanzó maxSolverCalls=${solverCallLimit}.`
        )
      }

      solverCalls++

      const raw =
        await solveScenario({
          routeMode:
            FOREIGN_ROUTE_MODE,

          origin,

          points,

          candidateResourceCount,

          maxActiveResources:
            candidateResourceCount,

          maxForeignDays:
            policy.maxForeignDays,

          foreignPolicy:
            policy,

          solveMode,

          mandatoryCoverage:
            true
        })

      const validation =
        validateForeignScenarioResult({
          result:
            raw,

          points,

          candidateResourceCount,

          policy
        })

      searchTrace.push({
        call:
          solverCalls,

        candidateResourceCount,

        solveMode,

        feasible:
          validation.feasible,

        providerFeasible:
          validation.providerFeasible,

        usedResourceCount:
          validation.usedResourceCount,

        coveragePercent:
          Number(
            validation
              .coverage
              .coveragePercent
              .toFixed(2)
          ),

        maxDaysUsed:
          validation.maxDaysUsed,

        maxForeignDays:
          policy.maxForeignDays,

        dayLimitViolations:
          validation
            .routesOverDayLimit
            .length
      })

      return validation
    }

  /**
   * ==========================================================
   * 1. LOWER BOUND
   * ==========================================================
   */

  let best =
    await executeScenario(
      lowerBound,
      FOREIGN_SOLVE_MODE
        .SEARCH
    )

  let bestCandidate =
    lowerBound

  let lastInfeasible =
    null

  /**
   * ==========================================================
   * 2. EXPANSIVE SEARCH
   * ==========================================================
   */

  if (
    !best.feasible
  ) {
    lastInfeasible =
      lowerBound

    let candidate =
      Math.min(
        maximumCandidates,
        Math.max(
          lowerBound + 1,
          lowerBound * 2
        )
      )

    best =
      null

    while (
      candidate <=
        maximumCandidates &&
      solverCalls <
        solverCallLimit
    ) {
      const attempt =
        await executeScenario(
          candidate,
          FOREIGN_SOLVE_MODE
            .SEARCH
        )

      if (
        attempt.feasible
      ) {
        best =
          attempt

        bestCandidate =
          candidate

        break
      }

      lastInfeasible =
        candidate

      if (
        candidate ===
        maximumCandidates
      ) {
        break
      }

      candidate =
        Math.min(
          maximumCandidates,
          candidate * 2
        )
    }
  }

  /**
   * ==========================================================
   * SIN SOLUCIÓN
   * ==========================================================
   */

  if (
    !best ||
    !best.feasible
  ) {
    return {
      status:
        FOREIGN_PLANNER_STATUS
          .INFEASIBLE,

      feasible:
        false,

      routeMode:
        FOREIGN_ROUTE_MODE,

      requiredRoutes:
        null,

      requiredOperators:
        null,

      requiredVehicles:
        null,

      requiredDays:
        null,

      maxForeignDays:
        policy.maxForeignDays,

      coveragePercent:
        best
          ?.coverage
          ?.coveragePercent ??
        0,

      allDestinationsAssigned:
        false,

      routes: [],

      solverCalls,

      lowerBound,

      upperBound:
        null,

      searchTrace,

      policy
    }
  }

  /**
   * ==========================================================
   * 3. BINARY TIGHTENING
   * ==========================================================
   */

  if (
    lastInfeasible !==
      null &&
    bestCandidate -
      lastInfeasible >
      1
  ) {
    let low =
      lastInfeasible +
      1

    let high =
      bestCandidate -
      1

    while (
      low <=
        high &&
      solverCalls <
        solverCallLimit
    ) {
      const middle =
        Math.floor(
          (
            low +
            high
          ) /
          2
        )

      const attempt =
        await executeScenario(
          middle,
          FOREIGN_SOLVE_MODE
            .SEARCH
        )

      if (
        attempt.feasible
      ) {
        best =
          attempt

        bestCandidate =
          middle

        high =
          middle -
          1
      } else {
        lastInfeasible =
          middle

        low =
          middle +
          1
      }
    }
  }

  /**
   * ==========================================================
   * 4. GOOGLE PODRÍA USAR MENOS RECURSOS
   * ==========================================================
   *
   * Si pedimos 4 vehículos virtuales pero Google
   * utiliza solamente 3, verificamos directamente 3.
   */

  const solverUsed =
    best
      .usedResourceCount

  if (
    solverUsed >=
      lowerBound &&
    solverUsed <
      bestCandidate &&
    solverCalls <
      solverCallLimit
  ) {
    const tighterAttempt =
      await executeScenario(
        solverUsed,
        FOREIGN_SOLVE_MODE
          .SEARCH
      )

    if (
      tighterAttempt.feasible
    ) {
      best =
        tighterAttempt

      bestCandidate =
        solverUsed
    }
  }

  /**
   * ==========================================================
   * 5. FINAL QUALITY
   * ==========================================================
   */

  if (
    finalQualityPass &&
    solverCalls <
      solverCallLimit
  ) {
    const finalAttempt =
      await executeScenario(
        bestCandidate,
        FOREIGN_SOLVE_MODE
          .FINAL_QUALITY
      )

    if (
      finalAttempt.feasible
    ) {
      best =
        finalAttempt
    }
  }

  /**
   * ==========================================================
   * RESULTADO
   * ==========================================================
   */

  const requiredResources =
    best.usedResourceCount >
      0
      ? best.usedResourceCount
      : bestCandidate

  return {
    status:
      FOREIGN_PLANNER_STATUS
        .FEASIBLE,

    feasible:
      true,

    routeMode:
      FOREIGN_ROUTE_MODE,

    /*
     * Una ROUTE aquí significa expedición.
     */
    requiredRoutes:
      requiredResources,

    requiredOperators:
      requiredResources,

    requiredVehicles:
      requiredResources,

    /*
     * Calendario operativo.
     *
     * Las expediciones trabajan simultáneamente,
     * así que importa la más larga.
     */
    requiredDays:
      best.maxDaysUsed,

    maxForeignDays:
      policy.maxForeignDays,

    coveragePercent:
      Number(
        best
          .coverage
          .coveragePercent
          .toFixed(2)
      ),

    allDestinationsAssigned:
      best
        .coverage
        .valid,

    routes:
      best.routes,

    routeDays:
      best.routeDays,

    solverCalls,

    lowerBound,

    upperBound:
      bestCandidate,

    searchTrace,

    policy,

    validation: {
      coverage:
        best.coverage,

      routesOverDayLimit:
        best.routesOverDayLimit,

      violations:
        best.violations
    }
  }
}

export default Object.freeze({
  normalizeForeignPlanningPolicy,
  calculateForeignResourceLowerBound,
  extractForeignRoutePointKeys,
  getForeignRouteDaysUsed,
  auditForeignCoverage,
  validateForeignScenarioResult,
  summarizeAutomaticForeignPlan,
  planAutomaticForeignResources
})
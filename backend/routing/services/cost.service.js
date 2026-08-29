// backend/routing/services/cost.service.js

import {
  calculateCompletenessPercent,
  calculateUnitCost,
  multiplyCost,
  roundDecimal,
  roundMoney,
  sumCostComponents,
  toOptionalNonNegativeNumber,
  toOptionalNumber
} from '../utils/money.js'

/**
 * Servicio económico del Motor Operativo Integral.
 *
 * OBJETIVO:
 *
 * Construir un costo operativo defendible,
 * diferenciando claramente entre:
 *
 * 0
 *   = costo conocido y realmente igual a cero
 *
 * null
 *   = costo desconocido / no configurado
 *
 * RESPONSABILIDADES:
 *
 * - combustible
 * - peajes
 * - viáticos
 * - hospedaje
 * - mantenimiento
 * - depreciación
 * - operador
 * - vehículo
 * - refrigeración
 * - otros costos configurables
 * - costo por km
 * - costo por parada
 * - costo por jornada
 * - costo por operador
 * - integridad económica
 *
 * NO:
 *
 * - calcula rutas
 * - consulta Google
 * - consulta PostgreSQL
 * - busca hoteles
 * - busca gasolineras
 * - decide vehículos
 * - conoce Express
 */

export const COST_CURRENCY =
  'MXN'

export const COST_COMPONENT_STATUS =
  Object.freeze({
    KNOWN:
      'KNOWN',

    UNKNOWN:
      'UNKNOWN',

    NOT_APPLICABLE:
      'NOT_APPLICABLE'
  })

export const COST_COMPONENT_SOURCE =
  Object.freeze({
    PROJECT_CONFIG:
      'PROJECT_CONFIG',

    VEHICLE_PROFILE:
      'VEHICLE_PROFILE',

    GOOGLE_ROUTES:
      'GOOGLE_ROUTES',

    GOOGLE_PLACES:
      'GOOGLE_PLACES',

    OFFICIAL_CATALOG:
      'OFFICIAL_CATALOG',

    MANUAL:
      'MANUAL',

    CALCULATED:
      'CALCULATED',

    NOT_CONFIGURED:
      'NOT_CONFIGURED'
  })

/**
 * Crea un componente económico normalizado.
 *
 * @param {{
 *   key: string,
 *   label: string,
 *   value?: number|null,
 *   applicable?: boolean,
 *   source?: string|null,
 *   estimated?: boolean,
 *   note?: string|null,
 *   metadata?: object
 * }} params
 *
 * @returns {object}
 */
export function createCostComponent({
  key,
  label,
  value = null,
  applicable = true,
  source = null,
  estimated = true,
  note = null,
  metadata = {}
} = {}) {
  if (
    !applicable
  ) {
    return {
      key:
        key ||
        '',

      label:
        label ||
        key ||
        '',

      value:
        0,

      status:
        COST_COMPONENT_STATUS
          .NOT_APPLICABLE,

      applicable:
        false,

      known:
        true,

      source:
        source ||
        null,

      estimated:
        Boolean(
          estimated
        ),

      note,

      metadata
    }
  }

  const normalizedValue =
    toOptionalNonNegativeNumber(
      value
    )

  const known =
    normalizedValue !=
    null

  return {
    key:
      key ||
      '',

    label:
      label ||
      key ||
      '',

    value:
      known
        ? roundMoney(
            normalizedValue
          )
        : null,

    status:
      known
        ? COST_COMPONENT_STATUS
            .KNOWN
        : COST_COMPONENT_STATUS
            .UNKNOWN,

    applicable:
      true,

    known,

    source:
      source ||
      (
        known
          ? COST_COMPONENT_SOURCE
              .CALCULATED
          : COST_COMPONENT_SOURCE
              .NOT_CONFIGURED
      ),

    estimated:
      Boolean(
        estimated
      ),

    note,

    metadata
  }
}

/**
 * Calcula un costo por día.
 *
 * Regla:
 *
 * days = 0
 * => costo conocido = 0
 *
 * days > 0 y rate = null
 * => costo desconocido = null
 *
 * @param {unknown} days
 * @param {unknown} dailyRate
 * @returns {number|null}
 */
export function calculateDailyCost(
  days,
  dailyRate
) {
  const normalizedDays =
    toOptionalNonNegativeNumber(
      days
    )

  if (
    normalizedDays ==
      null
  ) {
    return null
  }

  if (
    normalizedDays ===
      0
  ) {
    return 0
  }

  const rate =
    toOptionalNonNegativeNumber(
      dailyRate
    )

  if (
    rate ==
      null
  ) {
    return null
  }

  return multiplyCost(
    normalizedDays,
    rate,
    2
  )
}

/**
 * Calcula un costo por noche.
 *
 * @param {unknown} nights
 * @param {unknown} nightlyRate
 * @returns {number|null}
 */
export function calculateLodgingCost(
  nights,
  nightlyRate
) {
  return calculateDailyCost(
    nights,
    nightlyRate
  )
}

/**
 * Calcula un costo variable por kilómetro.
 *
 * @param {unknown} distanceMeters
 * @param {unknown} costPerKm
 * @returns {number|null}
 */
export function calculateDistanceCost(
  distanceMeters,
  costPerKm
) {
  const meters =
    toOptionalNonNegativeNumber(
      distanceMeters
    )

  if (
    meters ==
      null
  ) {
    return null
  }

  if (
    meters ===
      0
  ) {
    return 0
  }

  const rate =
    toOptionalNonNegativeNumber(
      costPerKm
    )

  if (
    rate ==
      null
  ) {
    return null
  }

  return multiplyCost(
    meters /
      1000,
    rate,
    2
  )
}

/**
 * Calcula costo por hora operativa.
 *
 * @param {unknown} durationSeconds
 * @param {unknown} costPerHour
 * @returns {number|null}
 */
export function calculateHourlyCost(
  durationSeconds,
  costPerHour
) {
  const seconds =
    toOptionalNonNegativeNumber(
      durationSeconds
    )

  if (
    seconds ==
      null
  ) {
    return null
  }

  if (
    seconds ===
      0
  ) {
    return 0
  }

  const rate =
    toOptionalNonNegativeNumber(
      costPerHour
    )

  if (
    rate ==
      null
  ) {
    return null
  }

  return multiplyCost(
    seconds /
      3600,
    rate,
    2
  )
}

/**
 * Normaliza información de peajes proveniente
 * del motor actual o de futuros proveedores.
 *
 * Casos:
 *
 * hasTolls = false
 * => costo conocido de 0 si la evaluación
 *    de peajes realmente fue realizada.
 *
 * hasTolls = true + amount
 * => costo conocido
 *
 * hasTolls = true + sin amount
 * => costo desconocido
 *
 * @param {object|null} tolls
 * @returns {object}
 */
export function normalizeTollCost(
  tolls
) {
  if (
    !tolls ||
    typeof tolls !==
      'object'
  ) {
    return {
      hasTolls:
        null,

      known:
        false,

      amount:
        null,

      currencyCode:
        null,

      source:
        null,

      estimated:
        true
    }
  }

  const hasTolls =
    typeof tolls.hasTolls ===
      'boolean'
      ? tolls.hasTolls
      : null

  const amount =
    toOptionalNonNegativeNumber(
      tolls.amount
    )

  /*
   * Si explícitamente sabemos que
   * no hay peajes, el costo sí es 0.
   */
  if (
    hasTolls ===
      false
  ) {
    return {
      hasTolls:
        false,

      known:
        true,

      amount:
        0,

      currencyCode:
        tolls.currencyCode ||
        COST_CURRENCY,

      source:
        tolls.source ||
        COST_COMPONENT_SOURCE
          .GOOGLE_ROUTES,

      estimated:
        tolls.estimated !==
        false
    }
  }

  if (
    amount !=
      null
  ) {
    return {
      hasTolls:
        true,

      known:
        true,

      amount:
        roundMoney(
          amount
        ),

      currencyCode:
        tolls.currencyCode ||
        COST_CURRENCY,

      source:
        tolls.source ||
        COST_COMPONENT_SOURCE
          .GOOGLE_ROUTES,

      estimated:
        tolls.estimated !==
        false
    }
  }

  return {
    hasTolls:
      hasTolls,

    known:
      false,

    amount:
      null,

    currencyCode:
      tolls.currencyCode ||
      null,

    source:
      tolls.source ||
      COST_COMPONENT_SOURCE
        .GOOGLE_ROUTES,

    estimated:
      tolls.estimated !==
      false
  }
}

/**
 * Extrae el costo de combustible desde
 * fuel.service.js.
 *
 * @param {object|null} fuelPlan
 * @returns {number|null}
 */
export function getFuelCostFromPlan(
  fuelPlan
) {
  return toOptionalNonNegativeNumber(
    fuelPlan
      ?.cost
      ?.totalEstimated
  )
}

/**
 * Obtiene noches de hospedaje.
 *
 * Puede venir explícitamente o calcularse
 * con base en jornadas.
 *
 * Regla general:
 *
 * 1 día  -> 0 noches
 * 2 días -> 1 noche
 * 3 días -> 2 noches
 *
 * @param {unknown} routeDays
 * @param {unknown} explicitNights
 * @returns {number|null}
 */
export function resolveLodgingNights(
  routeDays,
  explicitNights = null
) {
  const explicit =
    toOptionalNonNegativeNumber(
      explicitNights
    )

  if (
    explicit !=
      null
  ) {
    return Math.floor(
      explicit
    )
  }

  const days =
    toOptionalNonNegativeNumber(
      routeDays
    )

  if (
    days ==
      null
  ) {
    return null
  }

  return Math.max(
    0,
    Math.floor(
      days
    ) -
    1
  )
}

/**
 * Construye el análisis económico completo
 * de una ruta u operador.
 *
 * Los costos no configurados permanecen null.
 *
 * @param {{
 *   distanceMeters?: number,
 *   durationSeconds?: number,
 *   stopCount?: number,
 *   routeDays?: number,
 *   operatorCount?: number,
 *
 *   fuelPlan?: object|null,
 *   tolls?: object|null,
 *
 *   dailyAllowance?: number|null,
 *
 *   lodgingNights?: number|null,
 *   lodgingCostPerNight?: number|null,
 *
 *   maintenanceCostPerKm?: number|null,
 *   depreciationCostPerKm?: number|null,
 *
 *   operatorCostPerDay?: number|null,
 *   operatorCostPerHour?: number|null,
 *
 *   vehicleFixedCostPerDay?: number|null,
 *   insuranceCostPerDay?: number|null,
 *
 *   refrigerationCost?: number|null,
 *   refrigerationCostPerHour?: number|null,
 *
 *   otherCost?: number|null,
 *
 *   currency?: string
 * }} params
 *
 * @returns {object}
 */
export function buildOperationalCostAnalysis({
  distanceMeters = null,
  durationSeconds = null,
  stopCount = null,
  routeDays = null,
  operatorCount = 1,

  fuelPlan = null,
  tolls = null,

  dailyAllowance = null,

  lodgingNights = null,
  lodgingCostPerNight = null,

  maintenanceCostPerKm = null,
  depreciationCostPerKm = null,

  operatorCostPerDay = null,
  operatorCostPerHour = null,

  vehicleFixedCostPerDay = null,
  insuranceCostPerDay = null,

  refrigerationCost = null,
  refrigerationCostPerHour = null,

  otherCost = null,

  currency =
    COST_CURRENCY
} = {}) {
  const normalizedDistanceMeters =
    toOptionalNonNegativeNumber(
      distanceMeters
    )

  const normalizedDurationSeconds =
    toOptionalNonNegativeNumber(
      durationSeconds
    )

  const normalizedStopCount =
    toOptionalNonNegativeNumber(
      stopCount
    )

  const normalizedRouteDays =
    toOptionalNonNegativeNumber(
      routeDays
    )

  const normalizedOperatorCount =
    Math.max(
      1,
      Math.floor(
        Number(
          operatorCount
        ) ||
        1
      )
    )

  const resolvedNights =
    resolveLodgingNights(
      normalizedRouteDays,
      lodgingNights
    )

  /*
   * COMBUSTIBLE
   */
  const fuelCost =
    getFuelCostFromPlan(
      fuelPlan
    )

  const fuelComponent =
    createCostComponent({
      key:
        'fuel',

      label:
        'Combustible',

      value:
        fuelCost,

      source:
        fuelPlan
          ?.cost
          ?.source ||
        COST_COMPONENT_SOURCE
          .CALCULATED,

      estimated:
        true,

      metadata: {
        liters:
          fuelPlan
            ?.consumption
            ?.totalLiters ??
          null,

        pricePerLiter:
          fuelPlan
            ?.cost
            ?.pricePerLiter ??
          null
      }
    })

  /*
   * PEAJES
   */
  const normalizedTolls =
    normalizeTollCost(
      tolls
    )

  const tollComponent =
    createCostComponent({
      key:
        'tolls',

      label:
        'Casetas / peajes',

      value:
        normalizedTolls
          .amount,

      source:
        normalizedTolls
          .source,

      estimated:
        normalizedTolls
          .estimated,

      note:
        normalizedTolls
          .known
          ? null
          : (
              normalizedTolls
                .hasTolls ===
                true
                ? 'Se detectaron peajes pero no se conoce el importe.'
                : 'No fue posible determinar el costo de peajes.'
            ),

      metadata: {
        hasTolls:
          normalizedTolls
            .hasTolls,

        currencyCode:
          normalizedTolls
            .currencyCode
      }
    })

  /*
   * VIÁTICOS
   */
  const allowanceCost =
    calculateDailyCost(
      normalizedRouteDays,
      dailyAllowance
    )

  const allowanceApplicable =
    normalizedRouteDays ==
      null
      ? true
      : normalizedRouteDays >
        0

  const allowanceComponent =
    createCostComponent({
      key:
        'allowances',

      label:
        'Viáticos',

      value:
        allowanceCost,

      applicable:
        allowanceApplicable,

      source:
        COST_COMPONENT_SOURCE
          .PROJECT_CONFIG,

      estimated:
        true,

      metadata: {
        routeDays:
          normalizedRouteDays,

        dailyAllowance:
          toOptionalNonNegativeNumber(
            dailyAllowance
          )
      }
    })

  /*
   * HOSPEDAJE
   */
  const lodgingApplicable =
    resolvedNights ==
      null
      ? true
      : resolvedNights >
        0

  const lodgingCost =
    calculateLodgingCost(
      resolvedNights,
      lodgingCostPerNight
    )

  const lodgingComponent =
    createCostComponent({
      key:
        'lodging',

      label:
        'Hospedaje',

      value:
        lodgingCost,

      applicable:
        lodgingApplicable,

      source:
        COST_COMPONENT_SOURCE
          .PROJECT_CONFIG,

      estimated:
        true,

      metadata: {
        nights:
          resolvedNights,

        costPerNight:
          toOptionalNonNegativeNumber(
            lodgingCostPerNight
          )
      }
    })

  /*
   * MANTENIMIENTO
   */
  const maintenanceCost =
    calculateDistanceCost(
      normalizedDistanceMeters,
      maintenanceCostPerKm
    )

  const maintenanceComponent =
    createCostComponent({
      key:
        'maintenance',

      label:
        'Mantenimiento vehicular',

      value:
        maintenanceCost,

      source:
        COST_COMPONENT_SOURCE
          .VEHICLE_PROFILE,

      estimated:
        true,

      metadata: {
        costPerKm:
          toOptionalNonNegativeNumber(
            maintenanceCostPerKm
          )
      }
    })

  /*
   * DEPRECIACIÓN
   */
  const depreciationCost =
    calculateDistanceCost(
      normalizedDistanceMeters,
      depreciationCostPerKm
    )

  const depreciationComponent =
    createCostComponent({
      key:
        'depreciation',

      label:
        'Depreciación vehicular',

      value:
        depreciationCost,

      source:
        COST_COMPONENT_SOURCE
          .VEHICLE_PROFILE,

      estimated:
        true,

      metadata: {
        costPerKm:
          toOptionalNonNegativeNumber(
            depreciationCostPerKm
          )
      }
    })

  /*
   * OPERADOR
   *
   * Preferimos costo por día si está configurado.
   * En su defecto, podemos utilizar costo/hora.
   */
  const operatorDailyRate =
    toOptionalNonNegativeNumber(
      operatorCostPerDay
    )

  const operatorHourlyRate =
    toOptionalNonNegativeNumber(
      operatorCostPerHour
    )

  let operatorCost =
    null

  let operatorCostMode =
    null

  if (
    operatorDailyRate !=
      null
  ) {
    const totalOperatorDays =
      normalizedRouteDays !=
        null
        ? normalizedRouteDays *
          normalizedOperatorCount
        : null

    operatorCost =
      calculateDailyCost(
        totalOperatorDays,
        operatorDailyRate
      )

    operatorCostMode =
      'DAILY'
  } else if (
    operatorHourlyRate !=
      null
  ) {
    operatorCost =
      calculateHourlyCost(
        normalizedDurationSeconds,
        operatorHourlyRate
      )

    operatorCostMode =
      'HOURLY'
  }

  const operatorComponent =
    createCostComponent({
      key:
        'operator',

      label:
        'Costo de operador',

      value:
        operatorCost,

      source:
        COST_COMPONENT_SOURCE
          .PROJECT_CONFIG,

      estimated:
        true,

      metadata: {
        operatorCount:
          normalizedOperatorCount,

        mode:
          operatorCostMode,

        costPerDay:
          operatorDailyRate,

        costPerHour:
          operatorHourlyRate
      }
    })

  /*
   * COSTO FIJO DEL VEHÍCULO
   */
  const vehicleFixedCost =
    calculateDailyCost(
      normalizedRouteDays,
      vehicleFixedCostPerDay
    )

  const vehicleFixedComponent =
    createCostComponent({
      key:
        'vehicleFixed',

      label:
        'Costo fijo vehicular',

      value:
        vehicleFixedCost,

      source:
        COST_COMPONENT_SOURCE
          .VEHICLE_PROFILE,

      estimated:
        true,

      metadata: {
        costPerDay:
          toOptionalNonNegativeNumber(
            vehicleFixedCostPerDay
          )
      }
    })

  /*
   * SEGURO PRORRATEADO
   */
  const insuranceCost =
    calculateDailyCost(
      normalizedRouteDays,
      insuranceCostPerDay
    )

  const insuranceComponent =
    createCostComponent({
      key:
        'insurance',

      label:
        'Seguro vehicular prorrateado',

      value:
        insuranceCost,

      source:
        COST_COMPONENT_SOURCE
          .VEHICLE_PROFILE,

      estimated:
        true,

      metadata: {
        costPerDay:
          toOptionalNonNegativeNumber(
            insuranceCostPerDay
          )
      }
    })

  /*
   * REFRIGERACIÓN / RED FRÍA
   *
   * Puede venir:
   *
   * 1. como costo total ya calculado
   * 2. como tarifa por hora
   */
  const explicitRefrigerationCost =
    toOptionalNonNegativeNumber(
      refrigerationCost
    )

  const refrigerationHourlyRate =
    toOptionalNonNegativeNumber(
      refrigerationCostPerHour
    )

  let resolvedRefrigerationCost =
    explicitRefrigerationCost

  let refrigerationCostMode =
    explicitRefrigerationCost !=
      null
      ? 'EXPLICIT'
      : null

  if (
    resolvedRefrigerationCost ==
      null &&
    refrigerationHourlyRate !=
      null
  ) {
    resolvedRefrigerationCost =
      calculateHourlyCost(
        normalizedDurationSeconds,
        refrigerationHourlyRate
      )

    refrigerationCostMode =
      'HOURLY'
  }

  /*
   * Si no tenemos información que indique
   * que la ruta es de red fría, el componente
   * sigue considerado potencialmente aplicable.
   *
   * cargoProfile decidirá posteriormente
   * si debe marcarse como NOT_APPLICABLE.
   */
  const refrigerationComponent =
    createCostComponent({
      key:
        'refrigeration',

      label:
        'Operación de red fría',

      value:
        resolvedRefrigerationCost,

      source:
        COST_COMPONENT_SOURCE
          .VEHICLE_PROFILE,

      estimated:
        true,

      metadata: {
        mode:
          refrigerationCostMode,

        costPerHour:
          refrigerationHourlyRate
      }
    })

  /*
   * OTROS COSTOS
   */
  const otherComponent =
    createCostComponent({
      key:
        'other',

      label:
        'Otros costos operativos',

      value:
        toOptionalNonNegativeNumber(
          otherCost
        ),

      source:
        COST_COMPONENT_SOURCE
          .MANUAL,

      estimated:
        true
    })

  const components = [
    fuelComponent,
    tollComponent,
    allowanceComponent,
    lodgingComponent,
    maintenanceComponent,
    depreciationComponent,
    operatorComponent,
    vehicleFixedComponent,
    insuranceComponent,
    refrigerationComponent,
    otherComponent
  ]

  /*
   * Para integridad sólo cuentan conceptos
   * aplicables.
   *
   * NOT_APPLICABLE no penaliza el porcentaje.
   */
  const applicableComponents =
    components.filter(
      component =>
        component.applicable
    )

  const knownComponents =
    applicableComponents.filter(
      component =>
        component.known
    )

  const unknownComponents =
    applicableComponents.filter(
      component =>
        !component.known
    )

  const knownValues =
    {}

  for (
    const component
    of applicableComponents
  ) {
    knownValues[
      component.key
    ] =
      component.known
        ? component.value
        : null
  }

  const totals =
    sumCostComponents(
      knownValues
    )

  const totalKnown =
    roundMoney(
      totals.totalKnown
    ) ??
    0

  const completenessPercent =
    calculateCompletenessPercent(
      knownComponents.length,
      applicableComponents.length
    )

  const distanceKm =
    normalizedDistanceMeters !=
      null
      ? normalizedDistanceMeters /
        1000
      : null

  const costPerKm =
    calculateUnitCost(
      totalKnown,
      distanceKm
    )

  const costPerStop =
    calculateUnitCost(
      totalKnown,
      normalizedStopCount
    )

  const costPerDay =
    calculateUnitCost(
      totalKnown,
      normalizedRouteDays
    )

  const costPerOperator =
    calculateUnitCost(
      totalKnown,
      normalizedOperatorCount
    )

  return {
    currency,

    totals: {
      /*
       * Este total sólo contiene conceptos
       * realmente conocidos.
       */
      known:
        totalKnown,

      /*
       * Sólo podemos denominarlo completo cuando
       * no falta ningún concepto aplicable.
       */
      complete:
        unknownComponents.length ===
        0
          ? totalKnown
          : null,

      isComplete:
        unknownComponents.length ===
        0
    },

    components,

    knownComponents:
      knownComponents.map(
        component =>
          component.key
      ),

    unknownComponents:
      unknownComponents.map(
        component =>
          component.key
      ),

    completeness: {
      known:
        knownComponents.length,

      unknown:
        unknownComponents.length,

      applicable:
        applicableComponents.length,

      percent:
        completenessPercent,

      complete:
        unknownComponents.length ===
        0
    },

    metrics: {
      distanceMeters:
        normalizedDistanceMeters,

      distanceKm:
        distanceKm !=
          null
          ? roundDecimal(
              distanceKm,
              3
            )
          : null,

      durationSeconds:
        normalizedDurationSeconds,

      stopCount:
        normalizedStopCount,

      routeDays:
        normalizedRouteDays,

      lodgingNights:
        resolvedNights,

      operatorCount:
        normalizedOperatorCount
    },

    unitCosts: {
      perKm:
        costPerKm,

      perStop:
        costPerStop,

      perDay:
        costPerDay,

      perOperator:
        costPerOperator
    }
  }
}

/**
 * Construye alertas económicas.
 *
 * @param {object|null} analysis
 * @returns {object[]}
 */
export function buildCostAlerts(
  analysis
) {
  const alerts =
    []

  if (
    !analysis
  ) {
    return alerts
  }

  const unknown =
    Array.isArray(
      analysis
        ?.unknownComponents
    )
      ? analysis
          .unknownComponents
      : []

  if (
    unknown.length
  ) {
    alerts.push({
      severity:
        'WARNING',

      code:
        'ECONOMIC_ANALYSIS_INCOMPLETE',

      message:
        `El análisis económico tiene ${unknown.length} concepto(s) sin configurar.`,

      components:
        unknown
    })
  }

  if (
    Number(
      analysis
        ?.completeness
        ?.percent
    ) <
      70
  ) {
    alerts.push({
      severity:
        'WARNING',

      code:
        'LOW_ECONOMIC_COMPLETENESS',

      message:
        `La integridad económica del análisis es de ${analysis?.completeness?.percent || 0}%.`
    })
  }

  const tollComponent =
    analysis
      ?.components
      ?.find(
        component =>
          component.key ===
          'tolls'
      )

  if (
    tollComponent
      ?.known ===
      false
  ) {
    alerts.push({
      severity:
        'INFO',

      code:
        'TOLL_COST_UNKNOWN',

      message:
        'El costo de casetas no está completamente determinado.'
    })
  }

  const maintenanceComponent =
    analysis
      ?.components
      ?.find(
        component =>
          component.key ===
          'maintenance'
      )

  if (
    maintenanceComponent
      ?.known ===
      false
  ) {
    alerts.push({
      severity:
        'INFO',

      code:
        'MAINTENANCE_COST_NOT_CONFIGURED',

      message:
        'El costo por mantenimiento todavía no está configurado para el vehículo.'
    })
  }

  const depreciationComponent =
    analysis
      ?.components
      ?.find(
        component =>
          component.key ===
          'depreciation'
      )

  if (
    depreciationComponent
      ?.known ===
      false
  ) {
    alerts.push({
      severity:
        'INFO',

      code:
        'DEPRECIATION_COST_NOT_CONFIGURED',

      message:
        'La depreciación vehicular todavía no está configurada.'
    })
  }

  return alerts
}

/**
 * Genera un resumen compacto para panel ejecutivo.
 *
 * @param {object|null} analysis
 * @returns {object}
 */
export function summarizeCostAnalysis(
  analysis
) {
  if (
    !analysis
  ) {
    return {
      available:
        false
    }
  }

  const findValue =
    key =>
      analysis
        ?.components
        ?.find(
          component =>
            component.key ===
            key
        )
        ?.value ??
      null

  return {
    available:
      true,

    currency:
      analysis.currency ||
      COST_CURRENCY,

    knownTotal:
      analysis
        ?.totals
        ?.known ??
      null,

    completeTotal:
      analysis
        ?.totals
        ?.complete ??
      null,

    isComplete:
      analysis
        ?.totals
        ?.isComplete ===
      true,

    completenessPercent:
      analysis
        ?.completeness
        ?.percent ??
      0,

    fuel:
      findValue(
        'fuel'
      ),

    tolls:
      findValue(
        'tolls'
      ),

    allowances:
      findValue(
        'allowances'
      ),

    lodging:
      findValue(
        'lodging'
      ),

    maintenance:
      findValue(
        'maintenance'
      ),

    depreciation:
      findValue(
        'depreciation'
      ),

    operator:
      findValue(
        'operator'
      ),

    vehicleFixed:
      findValue(
        'vehicleFixed'
      ),

    insurance:
      findValue(
        'insurance'
      ),

    refrigeration:
      findValue(
        'refrigeration'
      ),

    other:
      findValue(
        'other'
      ),

    costPerKm:
      analysis
        ?.unitCosts
        ?.perKm ??
      null,

    costPerStop:
      analysis
        ?.unitCosts
        ?.perStop ??
      null,

    costPerDay:
      analysis
        ?.unitCosts
        ?.perDay ??
      null,

    costPerOperator:
      analysis
        ?.unitCosts
        ?.perOperator ??
      null,

    unknownComponents: [
      ...(
        analysis
          ?.unknownComponents ||
        []
      )
    ]
  }
}
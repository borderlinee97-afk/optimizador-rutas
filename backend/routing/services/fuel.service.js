// backend/routing/services/fuel.service.js

import {
  roundDecimal,
  multiplyCost,
  toOptionalNonNegativeNumber
} from '../utils/money.js'

/**
 * Servicio de combustible del
 * Motor Operativo Integral.
 *
 * REGLA OPERATIVA PRINCIPAL:
 *
 * - La unidad inicia la operación con tanque lleno.
 * - Si la autonomía no alcanza, se requiere
 *   abastecimiento durante la ruta.
 * - Al regresar/cerrar operación, la unidad
 *   debe volver a entregarse con tanque lleno.
 *
 * ESTE SERVICIO:
 *
 * - calcula autonomía
 * - calcula consumo
 * - determina necesidad de abastecimiento
 * - estima número mínimo de cargas en ruta
 * - calcula combustible requerido al regreso
 * - calcula costos si existe precio
 *
 * ESTE SERVICIO NO:
 *
 * - busca gasolineras
 * - selecciona una estación
 * - consulta Google Places
 * - consulta PostgreSQL
 * - decide rutas
 * - conoce Express
 */

export const FUEL_START_POLICIES =
  Object.freeze({
    FULL_TANK:
      'FULL_TANK'
  })

export const FUEL_END_POLICIES =
  Object.freeze({
    FULL_NEAR_CEDIS:
      'FULL_NEAR_CEDIS',

    AS_IS:
      'AS_IS'
  })

export const FUEL_TYPES =
  Object.freeze({
    GASOLINE:
      'GASOLINE',

    DIESEL:
      'DIESEL',

    PREMIUM:
      'PREMIUM',

    UNKNOWN:
      'UNKNOWN'
  })

export const CARGO_TYPES =
  Object.freeze({
    DRY:
      'DRY',

    COLD_CHAIN:
      'COLD_CHAIN',

    UNKNOWN:
      'UNKNOWN'
  })

export const AUXILIARY_FUEL_MODES =
  Object.freeze({
    NONE:
      'NONE',

    VEHICLE_FUEL:
      'VEHICLE_FUEL',

    SEPARATE:
      'SEPARATE',

    UNKNOWN:
      'UNKNOWN'
  })

export const FUEL_DEFAULTS =
  Object.freeze({
    /*
     * Reserva técnica inicial.
     *
     * No representa todavía una política oficial
     * de la operación.
     *
     * Se mantiene configurable y posteriormente
     * podrá venir de vehicle_profile/proyecto.
     */
    reservePercent:
      15,

    startPolicy:
      FUEL_START_POLICIES
        .FULL_TANK,

    endPolicy:
      FUEL_END_POLICIES
        .FULL_NEAR_CEDIS
  })

/**
 * Normaliza combustible empresarial.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeFuelType(
  value
) {
  const normalized =
    String(
      value ||
      ''
    )
      .trim()
      .toUpperCase()

  if (
    normalized ===
      'MAGNA' ||
    normalized ===
      'GASOLINA' ||
    normalized ===
      'REGULAR' ||
    normalized ===
      'GASOLINE'
  ) {
    return FUEL_TYPES
      .GASOLINE
  }

  if (
    normalized ===
      'DIESEL' ||
    normalized ===
      'DIÉSEL'
  ) {
    return FUEL_TYPES
      .DIESEL
  }

  if (
    normalized ===
      'PREMIUM'
  ) {
    return FUEL_TYPES
      .PREMIUM
  }

  return FUEL_TYPES
    .UNKNOWN
}

/**
 * Normaliza perfil de carga.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeCargoType(
  value
) {
  const normalized =
    String(
      value ||
      ''
    )
      .trim()
      .toUpperCase()

  if (
    normalized ===
      'DRY' ||
    normalized ===
      'SECA' ||
    normalized ===
      'RED_SECA'
  ) {
    return CARGO_TYPES
      .DRY
  }

  if (
    normalized ===
      'COLD_CHAIN' ||
    normalized ===
      'RED_FRIA' ||
    normalized ===
      'RED_FRÍA' ||
    normalized ===
      'REFRIGERATED'
  ) {
    return CARGO_TYPES
      .COLD_CHAIN
  }

  return CARGO_TYPES
    .UNKNOWN
}

/**
 * Normaliza porcentaje de reserva.
 *
 * @param {unknown} value
 * @returns {number}
 */
export function normalizeReservePercent(
  value
) {
  const number =
    Number(
      value
    )

  if (
    !Number.isFinite(
      number
    )
  ) {
    return FUEL_DEFAULTS
      .reservePercent
  }

  return Math.min(
    50,
    Math.max(
      0,
      number
    )
  )
}

/**
 * Normaliza el perfil mínimo necesario
 * para calcular combustible.
 *
 * @param {object} profile
 * @returns {object}
 */
export function normalizeFuelProfile(
  profile = {}
) {
  const tankCapacityLiters =
    toOptionalNonNegativeNumber(
      profile
        .tankCapacityLiters ??
      profile
        .tank_capacity_liters ??
      profile
        .litrosTanque
    )

  const kmPerLiter =
    toOptionalNonNegativeNumber(
      profile
        .kmPerLiter ??
      profile
        .km_per_liter ??
      profile
        .rendimiento
    )

  const reservePercent =
    normalizeReservePercent(
      profile
        .reservePercent ??
      profile
        .reserve_percent
    )

  const auxiliaryFuelLitersPerHour =
    toOptionalNonNegativeNumber(
      profile
        .auxiliaryFuelLitersPerHour ??
      profile
        .auxiliary_fuel_liters_per_hour
    )

  const auxiliaryModeRaw =
    String(
      profile
        .auxiliaryFuelMode ??
      profile
        .auxiliary_fuel_mode ??
      AUXILIARY_FUEL_MODES
        .UNKNOWN
    )
      .trim()
      .toUpperCase()

  const auxiliaryFuelMode =
    Object.values(
      AUXILIARY_FUEL_MODES
    ).includes(
      auxiliaryModeRaw
    )
      ? auxiliaryModeRaw
      : AUXILIARY_FUEL_MODES
          .UNKNOWN

  return {
    fuelType:
      normalizeFuelType(
        profile
          .fuelType ??
        profile
          .fuel_type ??
        profile
          .combustible
      ),

    cargoType:
      normalizeCargoType(
        profile
          .cargoType ??
        profile
          .cargo_type
      ),

    tankCapacityLiters,

    kmPerLiter:
      (
        kmPerLiter !=
          null &&
        kmPerLiter >
          0
      )
        ? kmPerLiter
        : null,

    reservePercent,

    auxiliaryFuelMode,

    auxiliaryFuelLitersPerHour,

    startPolicy:
      FUEL_START_POLICIES
        .FULL_TANK,

    endPolicy:
      FUEL_END_POLICIES
        .FULL_NEAR_CEDIS
  }
}

/**
 * Calcula consumo principal por kilometraje.
 *
 * @param {{
 *   distanceMeters?: number,
 *   kmPerLiter?: number
 * }} params
 *
 * @returns {number|null}
 */
export function calculateDrivingFuelLiters({
  distanceMeters,
  kmPerLiter
} = {}) {
  const meters =
    toOptionalNonNegativeNumber(
      distanceMeters
    )

  const performance =
    toOptionalNonNegativeNumber(
      kmPerLiter
    )

  if (
    meters ==
      null ||
    performance ==
      null ||
    performance <=
      0
  ) {
    return null
  }

  const distanceKm =
    meters /
    1000

  return roundDecimal(
    distanceKm /
    performance,
    4
  )
}

/**
 * Calcula consumo auxiliar.
 *
 * Esto será útil especialmente para
 * unidades refrigeradas.
 *
 * IMPORTANTE:
 *
 * No asumimos ningún consumo de Thermo King
 * ni de sistemas refrigerados.
 *
 * Sólo se calcula cuando tengamos un valor
 * configurado/verificado.
 *
 * @param {{
 *   durationSeconds?: number,
 *   litersPerHour?: number
 * }} params
 *
 * @returns {number|null}
 */
export function calculateAuxiliaryFuelLiters({
  durationSeconds,
  litersPerHour
} = {}) {
  const seconds =
    toOptionalNonNegativeNumber(
      durationSeconds
    )

  const rate =
    toOptionalNonNegativeNumber(
      litersPerHour
    )

  if (
    seconds ==
      null ||
    rate ==
      null
  ) {
    return null
  }

  return roundDecimal(
    (
      seconds /
      3600
    ) *
    rate,
    4
  )
}

/**
 * Calcula autonomía teórica y operativa.
 *
 * @param {{
 *   tankCapacityLiters?: number,
 *   kmPerLiter?: number,
 *   reservePercent?: number
 * }} params
 *
 * @returns {object}
 */
export function calculateFuelRange({
  tankCapacityLiters,
  kmPerLiter,
  reservePercent =
    FUEL_DEFAULTS
      .reservePercent
} = {}) {
  const tank =
    toOptionalNonNegativeNumber(
      tankCapacityLiters
    )

  const performance =
    toOptionalNonNegativeNumber(
      kmPerLiter
    )

  const reserve =
    normalizeReservePercent(
      reservePercent
    )

  if (
    tank ==
      null ||
    tank <=
      0 ||
    performance ==
      null ||
    performance <=
      0
  ) {
    return {
      theoreticalRangeKm:
        null,

      operationalRangeKm:
        null,

      reserveLiters:
        null,

      usableFuelLiters:
        null,

      reservePercent:
        reserve
    }
  }

  const reserveLiters =
    tank *
    (
      reserve /
      100
    )

  const usableFuelLiters =
    tank -
    reserveLiters

  return {
    theoreticalRangeKm:
      roundDecimal(
        tank *
        performance,
        1
      ),

    operationalRangeKm:
      roundDecimal(
        usableFuelLiters *
        performance,
        1
      ),

    reserveLiters:
      roundDecimal(
        reserveLiters,
        2
      ),

    usableFuelLiters:
      roundDecimal(
        usableFuelLiters,
        2
      ),

    reservePercent:
      reserve
  }
}

/**
 * Calcula el número mínimo de abastecimientos
 * necesarios durante la ruta.
 *
 * El vehículo inicia lleno.
 *
 * @param {{
 *   totalConsumptionLiters?: number,
 *   usableFuelLiters?: number
 * }} params
 *
 * @returns {number|null}
 */
export function calculateMinimumOnRouteRefuels({
  totalConsumptionLiters,
  usableFuelLiters
} = {}) {
  const consumption =
    toOptionalNonNegativeNumber(
      totalConsumptionLiters
    )

  const usable =
    toOptionalNonNegativeNumber(
      usableFuelLiters
    )

  if (
    consumption ==
      null ||
    usable ==
      null ||
    usable <=
      0
  ) {
    return null
  }

  if (
    consumption <=
      usable
  ) {
    return 0
  }

  return Math.max(
    0,
    Math.ceil(
      consumption /
      usable
    ) -
    1
  )
}

/**
 * Construye plan completo de combustible.
 *
 * @param {{
 *   distanceMeters?: number,
 *   durationSeconds?: number,
 *   vehicleProfile?: object,
 *   pricePerLiter?: number|null
 * }} params
 *
 * @returns {object}
 */
export function buildFuelPlan({
  distanceMeters,
  durationSeconds = null,
  vehicleProfile = {},
  pricePerLiter = null
} = {}) {
  const profile =
    normalizeFuelProfile(
      vehicleProfile
    )

  const distance =
    toOptionalNonNegativeNumber(
      distanceMeters
    )

  const distanceKm =
    distance !=
      null
      ? roundDecimal(
          distance /
          1000,
          3
        )
      : null

  const drivingFuelLiters =
    calculateDrivingFuelLiters({
      distanceMeters:
        distance,

      kmPerLiter:
        profile
          .kmPerLiter
    })

  let auxiliaryFuelLiters =
    null

  /*
   * Sólo sumamos combustible auxiliar
   * al tanque principal cuando sabemos
   * explícitamente que el sistema auxiliar
   * consume del mismo combustible.
   */
  if (
    profile
      .auxiliaryFuelMode ===
      AUXILIARY_FUEL_MODES
        .VEHICLE_FUEL
  ) {
    auxiliaryFuelLiters =
      calculateAuxiliaryFuelLiters({
        durationSeconds,

        litersPerHour:
          profile
            .auxiliaryFuelLitersPerHour
      })
  } else if (
    profile
      .auxiliaryFuelMode ===
      AUXILIARY_FUEL_MODES
        .NONE
  ) {
    auxiliaryFuelLiters =
      0
  }

  let totalConsumptionLiters =
    drivingFuelLiters

  if (
    drivingFuelLiters !=
      null &&
    auxiliaryFuelLiters !=
      null
  ) {
    totalConsumptionLiters =
      roundDecimal(
        drivingFuelLiters +
        auxiliaryFuelLiters,
        4
      )
  }

  /*
   * Si existe consumo auxiliar desconocido
   * en una red fría, no fingimos que es cero.
   *
   * El consumo principal sigue disponible,
   * pero marcamos la estimación incompleta.
   */
  const auxiliaryConsumptionUnknown =
    (
      profile
        .cargoType ===
        CARGO_TYPES
          .COLD_CHAIN &&
      profile
        .auxiliaryFuelMode !==
        AUXILIARY_FUEL_MODES
          .NONE &&
      auxiliaryFuelLiters ==
        null
    )

  const range =
    calculateFuelRange({
      tankCapacityLiters:
        profile
          .tankCapacityLiters,

      kmPerLiter:
        profile
          .kmPerLiter,

      reservePercent:
        profile
          .reservePercent
    })

  const minimumOnRouteRefuels =
    calculateMinimumOnRouteRefuels({
      totalConsumptionLiters,

      usableFuelLiters:
        range
          .usableFuelLiters
    })

  const requiresOnRouteRefuel =
    minimumOnRouteRefuels !=
      null
      ? minimumOnRouteRefuels >
        0
      : null

  let minimumOnRouteFuelLiters =
    null

  if (
    totalConsumptionLiters !=
      null &&
    range
      .usableFuelLiters !=
      null
  ) {
    minimumOnRouteFuelLiters =
      roundDecimal(
        Math.max(
          0,
          totalConsumptionLiters -
          range
            .usableFuelLiters
        ),
        4
      )
  }

  /*
   * Como el vehículo debe terminar nuevamente
   * con tanque lleno:
   *
   * combustible comprado durante todo el ciclo
   * ≈ combustible consumido.
   *
   * Si hubo carga en carretera, el resto se
   * repone cerca del CEDIS.
   */
  let finalCedisRefillLiters =
    null

  if (
    totalConsumptionLiters !=
      null
  ) {
    const onRouteFuel =
      minimumOnRouteFuelLiters ??
      0

    finalCedisRefillLiters =
      roundDecimal(
        Math.max(
          0,
          totalConsumptionLiters -
          onRouteFuel
        ),
        4
      )
  }

  const normalizedPrice =
    toOptionalNonNegativeNumber(
      pricePerLiter
    )

  const estimatedFuelCost =
    multiplyCost(
      totalConsumptionLiters,
      normalizedPrice,
      2
    )

  const estimatedOnRouteFuelCost =
    multiplyCost(
      minimumOnRouteFuelLiters,
      normalizedPrice,
      2
    )

  const estimatedFinalCedisRefillCost =
    multiplyCost(
      finalCedisRefillLiters,
      normalizedPrice,
      2
    )

  const planComplete =
    (
      distance !=
        null &&
      profile
        .tankCapacityLiters !=
        null &&
      profile
        .kmPerLiter !=
        null &&
      totalConsumptionLiters !=
        null &&
      !auxiliaryConsumptionUnknown
    )

  return {
    policy: {
      start:
        profile
          .startPolicy,

      end:
        profile
          .endPolicy,

      description:
        'La unidad inicia con tanque lleno y debe restituirse a tanque lleno al cierre.'
    },

    vehicle: {
      fuelType:
        profile
          .fuelType,

      cargoType:
        profile
          .cargoType,

      tankCapacityLiters:
        profile
          .tankCapacityLiters,

      kmPerLiter:
        profile
          .kmPerLiter,

      reservePercent:
        profile
          .reservePercent
    },

    route: {
      distanceMeters:
        distance,

      distanceKm,

      durationSeconds:
        toOptionalNonNegativeNumber(
          durationSeconds
        )
    },

    range,

    consumption: {
      drivingLiters:
        drivingFuelLiters,

      auxiliaryLiters:
        auxiliaryFuelLiters,

      auxiliaryConsumptionUnknown,

      totalLiters:
        totalConsumptionLiters
    },

    refueling: {
      requiresOnRouteRefuel,

      minimumOnRouteRefuels,

      minimumOnRouteFuelLiters,

      /*
       * Esta carga se realizará mediante
       * gasolinera(s) cercana(s) al CEDIS.
       */
      requiresFinalCedisRefill:
        (
          finalCedisRefillLiters !=
            null &&
          finalCedisRefillLiters >
            0
        ),

      finalCedisRefillLiters,

      totalFuelToPurchaseLiters:
        totalConsumptionLiters
    },

    cost: {
      pricePerLiter:
        normalizedPrice,

      totalEstimated:
        estimatedFuelCost,

      onRouteEstimated:
        estimatedOnRouteFuelCost,

      finalCedisRefillEstimated:
        estimatedFinalCedisRefillCost,

      currency:
        'MXN',

      estimated:
        true
    },

    completeness: {
      complete:
        planComplete,

      auxiliaryConsumptionUnknown
    }
  }
}

/**
 * Construye alertas de combustible
 * para panel operativo/ejecutivo.
 *
 * @param {object} fuelPlan
 * @returns {object[]}
 */
export function buildFuelAlerts(
  fuelPlan
) {
  const alerts =
    []

  if (
    !fuelPlan
  ) {
    return alerts
  }

  if (
    fuelPlan
      ?.vehicle
      ?.tankCapacityLiters ==
      null
  ) {
    alerts.push({
      severity:
        'WARNING',

      code:
        'FUEL_TANK_CAPACITY_UNKNOWN',

      message:
        'No se conoce la capacidad del tanque; no es posible validar autonomía.'
    })
  }

  if (
    fuelPlan
      ?.vehicle
      ?.kmPerLiter ==
      null
  ) {
    alerts.push({
      severity:
        'HIGH',

      code:
        'FUEL_EFFICIENCY_UNKNOWN',

      message:
        'No se conoce el rendimiento del vehículo; el consumo no puede calcularse.'
    })
  }

  if (
    fuelPlan
      ?.refueling
      ?.requiresOnRouteRefuel ===
      true
  ) {
    alerts.push({
      severity:
        'INFO',

      code:
        'ON_ROUTE_REFUEL_REQUIRED',

      message:
        `La ruta requiere al menos ${fuelPlan.refueling.minimumOnRouteRefuels} abastecimiento(s) durante el recorrido.`
    })
  }

  if (
    fuelPlan
      ?.refueling
      ?.requiresFinalCedisRefill ===
      true
  ) {
    alerts.push({
      severity:
        'INFO',

      code:
        'CEDIS_FINAL_REFUEL_REQUIRED',

      message:
        'La unidad requiere reabastecimiento al cierre para ser entregada nuevamente con tanque lleno.'
    })
  }

  if (
    fuelPlan
      ?.consumption
      ?.auxiliaryConsumptionUnknown
  ) {
    alerts.push({
      severity:
        'WARNING',

      code:
        'COLD_CHAIN_AUXILIARY_FUEL_UNKNOWN',

      message:
        'La unidad es de red fría pero todavía no está configurado el consumo energético/combustible del sistema de refrigeración.'
    })
  }

  return alerts
}

/**
 * Resumen compacto para panel.
 *
 * @param {object} fuelPlan
 * @returns {object}
 */
export function summarizeFuelPlan(
  fuelPlan
) {
  if (
    !fuelPlan
  ) {
    return {
      available:
        false
    }
  }

  return {
    available:
      fuelPlan
        ?.consumption
        ?.totalLiters !=
      null,

    fuelType:
      fuelPlan
        ?.vehicle
        ?.fuelType ||
      FUEL_TYPES
        .UNKNOWN,

    tankCapacityLiters:
      fuelPlan
        ?.vehicle
        ?.tankCapacityLiters ??
      null,

    kmPerLiter:
      fuelPlan
        ?.vehicle
        ?.kmPerLiter ??
      null,

    theoreticalRangeKm:
      fuelPlan
        ?.range
        ?.theoreticalRangeKm ??
      null,

    operationalRangeKm:
      fuelPlan
        ?.range
        ?.operationalRangeKm ??
      null,

    totalConsumptionLiters:
      fuelPlan
        ?.consumption
        ?.totalLiters ??
      null,

    onRouteRefuels:
      fuelPlan
        ?.refueling
        ?.minimumOnRouteRefuels ??
      null,

    finalCedisRefillLiters:
      fuelPlan
        ?.refueling
        ?.finalCedisRefillLiters ??
      null,

    estimatedCost:
      fuelPlan
        ?.cost
        ?.totalEstimated ??
      null,

    complete:
      fuelPlan
        ?.completeness
        ?.complete ===
      true
  }
}
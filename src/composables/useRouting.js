// src/composables/useRouting.js
import { ref, computed } from 'vue'
import { computeRoute } from '../services/api.js'
import { copyToClipboard as copyLinkToClipboard } from '../utils/links.js'

export function useRouting({
  map,
  trackOverlay,
  detachOverlay,
  clearAllOverlays,
  filterPharmacyMarkersByIds,
  clearPharmacyMarkerFilter
}) {
  // =========================================================
  // ESTADO BASE / UI
  // =========================================================

  const criteriaOpen = ref(false)

  const criteria = ref({
    scope: 'single',

    estado: '',
    region: '',
    proyecto: 'JALISCO',

    strategy: 'FASTEST',
    routeEngine: 'GOOGLE_ROUTES_PLUS',
    routeMode: 'ROUND_TRIP',

    maxForeignDays: 3,
    foreignOperatorsPerRoute: 1,
    lodgingSearchRadiusKm: 20,

    operatorCount: 1,

    kmPerLiter: 12,
    fuelPricePerLiter: 24,
    dailyAllowance: 0,

    originCoords: {
      lat: '',
      lng: ''
    },

    selectedCedisId: null,

    options: {
      avoidTolls: false,
      showAlternatives: true,
      returnToOrigin: true,
      maxStopsPerSubroute: 25,
      avoidDificilAcceso: true
    }
  })

  const originMode = ref('cedis')

  const originPharmacyId =
    ref(null)

  // =========================================================
  // UNIDADES INYECTADAS DESDE MAP PAGE
  // =========================================================

  const farmacias =
    ref([])

  function normalizeScopeValue(
    value
  ) {
    return String(
      value ??
      ''
    )
      .trim()
      .normalize(
        'NFD'
      )
      .replace(
        /[\u0300-\u036f]/g,
        ''
      )
      .toUpperCase()
  }

  function unitMatchesCurrentScope(
    unit
  ) {
    if (!unit) {
      return false
    }

    const currentState =
      normalizeScopeValue(
        criteria.value.estado
      )

    const currentProject =
      normalizeScopeValue(
        criteria.value.proyecto
      )

    if (
      currentState &&
      normalizeScopeValue(
        unit.estado
      ) !== currentState
    ) {
      return false
    }

    if (
      currentProject &&
      normalizeScopeValue(
        unit.proyecto
      ) !== currentProject
    ) {
      return false
    }

    return true
  }

  /*
   * Ésta es la fuente correcta para:
   *
   * - regiones
   * - unidades
   * - ruta personalizada
   * - origen por farmacia
   *
   * Nunca debe mezclar proyectos.
   */
  const scopedFarmacias =
    computed(
      () =>
        farmacias.value.filter(
          unitMatchesCurrentScope
        )
    )

  const regiones =
    computed(
      () =>
        Array.from(
          new Set(
            scopedFarmacias.value
              .map(
                farmacia =>
                  farmacia
                    .region_sanitaria
              )
              .filter(
                Boolean
              )
          )
        ).sort(
          (
            a,
            b
          ) =>
            String(
              a
            ).localeCompare(
              String(
                b
              ),
              'es'
            )
        )
    )

  const farmaciasRegion =
    computed(
      () =>
        scopedFarmacias.value
          .filter(
            farmacia =>
              farmacia
                .region_sanitaria ===
              criteria.value
                .region
          )
    )

  // =========================================================
  // ABRIR CALCULADOR
  // =========================================================

  function openCriteria() {
    criteria.value.scope =
      'single'

    /*
     * Si ya existe una región válida,
     * la conservamos.
     *
     * Si el proyecto cambió, usamos la
     * primera región de ese proyecto.
     */
    if (
      !criteria.value.region ||
      !regiones.value.includes(
        criteria.value.region
      )
    ) {
      criteria.value.region =
        regiones.value[0] ||
        ''
    }

    /*
     * CriteriaModal cambiará automáticamente
     * a búsqueda por lugar/coordenadas cuando
     * el proyecto no tenga CEDIS.
     */
    originMode.value =
      'cedis'

    originPharmacyId.value =
      farmaciasRegion.value[0]
        ?.id != null
        ? Number(
            farmaciasRegion.value[0]
              .id
          )
        : null

    manualPoints.value =
      farmaciasRegion.value.map(
        farmacia => ({
          id:
            Number(
              farmacia.id
            ),

          name:
            farmacia.clues ||
            farmacia.unidad ||
            String(
              farmacia.id
            ),

          clues:
            farmacia.clues ||
            '',

          unidad:
            farmacia.unidad ||
            '',

          region:
            farmacia
              .region_sanitaria ||
            '',

          proyecto:
            farmacia.proyecto ||
            criteria.value
              .proyecto ||
            '',

          estado:
            farmacia.estado ||
            criteria.value
              .estado ||
            '',

          enabled:
            true,

          hard:
            Boolean(
              farmacia
                .dificil_acceso
            )
        })
      )

    criteriaOpen.value =
      true
  }

  // =========================================================
  // MANUAL PRE-CÁLCULO
  // =========================================================

  const manualPoints =
    ref([])

  const lockManualFromTemplate =
    ref(false)

  let dragSrcIndex =
    -1

  function onDragStart(
    index
  ) {
    dragSrcIndex =
      index
  }

  function onDragEnter(
    index
  ) {
    if (
      dragSrcIndex ===
        -1 ||
      dragSrcIndex ===
        index
    ) {
      return
    }

    const items =
      [
        ...manualPoints.value
      ]

    const item =
      items.splice(
        dragSrcIndex,
        1
      )[0]

    items.splice(
      index,
      0,
      item
    )

    manualPoints.value =
      items

    dragSrcIndex =
      index
  }

  function onDrop() {
    dragSrcIndex =
      -1
  }

  // =========================================================
  // RUTA PERSONALIZADA
  // =========================================================

  const customPoints =
    ref([])

  const customStrategy =
    ref(
      'FASTEST'
    )

  /*
   * first:
   * primera unidad del carrito
   *
   * pharmacy:
   * unidad específica
   *
   * coords:
   * coordenadas externas
   */
  const customOriginMode =
    ref(
      'first'
    )

  const customOriginPharmacyId =
    ref(null)

  const customOriginCoords =
    ref({
      lat: '',
      lng: ''
    })

  function normalizeCustomPoint(
    raw
  ) {
    if (!raw) {
      return null
    }

    return {
      id:
        Number(
          raw.id
        ),

      clues:
        raw.clues ||
        '',

      unidad:
        raw.unidad ||
        '',

      region:
        raw.region ||
        raw.region_sanitaria ||
        '',

      proyecto:
        raw.proyecto ||
        criteria.value
          .proyecto ||
        '',

      estado:
        raw.estado ||
        criteria.value
          .estado ||
        '',

      name:
        raw.name ||
        raw.clues ||
        raw.unidad ||
        String(
          raw.id
        ),

      enabled:
        raw.enabled !==
        false,

      hard:
        Boolean(
          raw.hard
        )
    }
  }

  function ensureValidCustomOriginSelection() {
    const ids =
      new Set(
        customPoints.value
          .map(
            point =>
              Number(
                point.id
              )
          )
      )

    if (
      !ids.size
    ) {
      customOriginPharmacyId.value =
        null

      return
    }

    if (
      customOriginMode.value ===
        'pharmacy' &&
      !ids.has(
        Number(
          customOriginPharmacyId.value
        )
      )
    ) {
      customOriginPharmacyId.value =
        Number(
          customPoints.value[0]
            .id
        )
    }
  }

  /*
   * Sólo agrega unidades pertenecientes
   * al Estado/Proyecto activo.
   */
  function addCustomStops(
    ids = []
  ) {
    const existing =
      new Set(
        customPoints.value
          .map(
            point =>
              Number(
                point.id
              )
          )
      )

    const next =
      [
        ...customPoints.value
      ]

    for (
      const id
      of ids
    ) {
      const farmacia =
        farmacias.value.find(
          item =>
            Number(
              item.id
            ) ===
            Number(
              id
            )
        )

      if (
        !farmacia ||
        !unitMatchesCurrentScope(
          farmacia
        )
      ) {
        continue
      }

      if (
        existing.has(
          Number(
            farmacia.id
          )
        )
      ) {
        continue
      }

      next.push({
        id:
          Number(
            farmacia.id
          ),

        clues:
          farmacia.clues ||
          '',

        unidad:
          farmacia.unidad ||
          '',

        region:
          farmacia
            .region_sanitaria ||
          '',

        proyecto:
          farmacia.proyecto ||
          criteria.value
            .proyecto ||
          '',

        estado:
          farmacia.estado ||
          criteria.value
            .estado ||
          '',

        name:
          farmacia.clues ||
          farmacia.unidad ||
          String(
            farmacia.id
          ),

        enabled:
          true,

        hard:
          Boolean(
            farmacia
              .dificil_acceso
          )
      })

      existing.add(
        Number(
          farmacia.id
        )
      )
    }

    customPoints.value =
      next

    if (
      !customOriginPharmacyId.value &&
      customPoints.value.length
    ) {
      customOriginPharmacyId.value =
        Number(
          customPoints.value[0]
            .id
        )
    }

    ensureValidCustomOriginSelection()
  }

  function setCustomPoints(
    list = []
  ) {
    customPoints.value =
      (
        Array.isArray(
          list
        )
          ? list
          : []
      )
        .map(
          normalizeCustomPoint
        )
        .filter(
          Boolean
        )

    ensureValidCustomOriginSelection()
  }

  function clearCustomPoints() {
    customPoints.value =
      []

    customStrategy.value =
      'FASTEST'

    customOriginMode.value =
      'first'

    customOriginPharmacyId.value =
      null

    customOriginCoords.value = {
      lat: '',
      lng: ''
    }
  }

  const customOriginCandidates =
    computed(
      () =>
        customPoints.value
          .map(
            point => ({
              id:
                Number(
                  point.id
                ),

              label:
                `${
                  point.clues ||
                  point.name
                }${
                  point.unidad
                    ? ` — ${point.unidad}`
                    : ''
                }`
            })
          )
    )

  function resolveCustomOrigin() {
    if (
      !customPoints.value.length
    ) {
      return null
    }

    if (
      customOriginMode.value ===
      'coords'
    ) {
      const lat =
        Number(
          customOriginCoords.value
            .lat
        )

      const lng =
        Number(
          customOriginCoords.value
            .lng
        )

      if (
        Number.isFinite(
          lat
        ) &&
        Number.isFinite(
          lng
        )
      ) {
        return {
          lat,
          lng
        }
      }

      return null
    }

    if (
      customOriginMode.value ===
      'pharmacy'
    ) {
      const chosenId =
        Number(
          customOriginPharmacyId.value
        )

      const farmacia =
        farmacias.value.find(
          item =>
            Number(
              item.id
            ) ===
              chosenId &&
            unitMatchesCurrentScope(
              item
            )
        )

      if (
        farmacia?.latitud !=
          null &&
        farmacia?.longitud !=
          null
      ) {
        return {
          lat:
            Number(
              farmacia.latitud
            ),

          lng:
            Number(
              farmacia.longitud
            )
        }
      }

      return null
    }

    /*
     * Modo first.
     */
    const first =
      farmacias.value.find(
        farmacia =>
          Number(
            farmacia.id
          ) ===
            Number(
              customPoints.value[0]
                ?.id
            ) &&
          unitMatchesCurrentScope(
            farmacia
          )
      )

    if (
      first?.latitud !=
        null &&
      first?.longitud !=
        null
    ) {
      return {
        lat:
          Number(
            first.latitud
          ),

        lng:
          Number(
            first.longitud
          )
      }
    }

    return null
  }

  function rotateIdsFromCustomOrigin(
    ids
  ) {
    if (
      !ids.length
    ) {
      return ids
    }

    if (
      customOriginMode.value !==
      'pharmacy'
    ) {
      return ids
    }

    const firstId =
      Number(
        customOriginPharmacyId.value
      )

    const index =
      ids.findIndex(
        id =>
          Number(
            id
          ) ===
          firstId
      )

    if (
      index <=
      0
    ) {
      return ids
    }

    return [
      ...ids.slice(
        index
      ),

      ...ids.slice(
        0,
        index
      )
    ]
  }

  // =========================================================
  // POST-CÁLCULO
  // =========================================================

  const postOrder =
    ref([])

  let postDragIdx =
    -1

  function initPostOrderFromVisit(
    visit
  ) {
    postOrder.value =
      []

    if (
      !Array.isArray(
        visit
      )
    ) {
      return
    }

    for (
      const point
      of visit
    ) {
      if (
        !point?.id
      ) {
        continue
      }

      const farmacia =
        farmacias.value.find(
          item =>
            Number(
              item.id
            ) ===
            Number(
              point.id
            )
        )

      postOrder.value.push({
        id:
          Number(
            point.id
          ),

        name:
          point.name ||
          farmacia?.clues ||
          farmacia?.unidad ||
          String(
            point.id
          ),

        clues:
          farmacia?.clues ||
          null,

        unidad:
          farmacia?.unidad ||
          null,

        region:
          farmacia
            ?.region_sanitaria ||
          null,

        enabled:
          true,

        hard:
          Boolean(
            farmacia
              ?.dificil_acceso
          )
      })
    }
  }

  function postDragStart(
    index
  ) {
    postDragIdx =
      index
  }

  function postDragEnter(
    index
  ) {
    if (
      postDragIdx ===
        -1 ||
      postDragIdx ===
        index
    ) {
      return
    }

    const items =
      [
        ...postOrder.value
      ]

    const item =
      items.splice(
        postDragIdx,
        1
      )[0]

    items.splice(
      index,
      0,
      item
    )

    postOrder.value =
      items

    postDragIdx =
      index
  }

  function postDrop() {
    postDragIdx =
      -1
  }

  // =========================================================
  // RESULTADOS
  // =========================================================

  const routeTotal =
    ref(null)

  const routeLegs =
    ref([])

  const readableOrder =
    ref([])

  const operatorRoutes =
    ref([])

  const routeFuel =
    ref(null)

  const selectedOperator =
    ref(null)

  const selectedOperatorDay =
    ref(null)

  const routeTolls =
    ref({
      hasTolls:
        false,

      known:
        false,

      currencyCode:
        null,

      amount:
        null,

      text:
        'Sin peajes estimados'
    })

  const massiveResults =
    ref([])

  const currentPolylines =
    ref([])

  const sequenceMarkers =
    ref([])

  const subroutesUi =
    ref([])

  const allSubroutesUi =
    ref([])

  const subrouteColors =
    ref([])

  const unifyColors =
    ref(false)

  const allMapsLinks =
    ref([])

  const hasAnyRoute =
    computed(
      () =>
        Boolean(
          currentPolylines
            .value.length ||
          sequenceMarkers
            .value.length ||
          massiveResults
            .value.length
        )
    )

  function clearRoutes() {
    try {
      if (
        typeof clearAllOverlays ===
        'function'
      ) {
        clearAllOverlays()
      }
    } catch {}

    try {
      for (
        const massiveResult
        of massiveResults.value
      ) {
        ;(
          massiveResult.polylines ||
          []
        ).forEach(
          overlay => {
            try {
              if (
                overlay
              ) {
                overlay.setMap(
                  null
                )
              }
            } catch {}
          }
        )

        ;(
          massiveResult
            .sequenceMarkers ||
          []
        ).forEach(
          overlay => {
            try {
              if (
                overlay
              ) {
                overlay.map =
                  null
              }
            } catch {}
          }
        )
      }
    } catch {}

    try {
      currentPolylines.value
        .forEach(
          overlay => {
            try {
              if (
                overlay
              ) {
                overlay.setMap(
                  null
                )
              }
            } catch {}
          }
        )

      sequenceMarkers.value
        .forEach(
          overlay => {
            try {
              if (
                overlay
              ) {
                overlay.map =
                  null
              }
            } catch {}
          }
        )
    } catch {}

    currentPolylines.value =
      []

    sequenceMarkers.value =
      []

    massiveResults.value =
      []

    routeTotal.value =
      null

    routeLegs.value =
      []

    readableOrder.value =
      []

    operatorRoutes.value =
      []

    routeFuel.value =
      null

    selectedOperator.value =
      null

    selectedOperatorDay.value =
      null

    routeTolls.value = {
      hasTolls:
        false,

      known:
        false,

      currencyCode:
        null,

      amount:
        null,

      text:
        'Sin peajes estimados'
    }

    subroutesUi.value =
      []

    allSubroutesUi.value =
      []

    subrouteColors.value =
      []

    postOrder.value =
      []

    mapsLinks.value =
      []

    allMapsLinks.value =
      []

    if (
      typeof clearPharmacyMarkerFilter ===
      'function'
    ) {
      clearPharmacyMarkerFilter()
    }
  }

  const computeRunId =
    ref(0)

  const controllers =
    ref([])

  function abortAllFetches() {
    controllers.value
      .forEach(
        controller => {
          try {
            controller.abort()
          } catch {}
        }
      )

    controllers.value =
      []
  }

  function onCloseRoute() {
    computeRunId.value +=
      1

    abortAllFetches()

    clearRoutes()
  }

  const lastRegionUsed =
    ref(null)

  const lastOriginUsed =
    ref(null)

  const lastRawData =
    ref(null)

  // =========================================================
  // PAYLOAD
  // =========================================================

  function buildPayload(
    region
  ) {
    let origin

    if (
      originMode.value ===
        'center' &&
      map.value
    ) {
      const center =
        map.value.getCenter()

      origin = {
        lat:
          center.lat(),

        lng:
          center.lng()
      }
    } else if (
      originMode.value ===
      'coords'
    ) {
      const lat =
        Number(
          criteria.value
            .originCoords
            ?.lat
        )

      const lng =
        Number(
          criteria.value
            .originCoords
            ?.lng
        )

      if (
        Number.isFinite(
          lat
        ) &&
        Number.isFinite(
          lng
        )
      ) {
        origin = {
          lat,
          lng
        }
      }
    } else if (
      originMode.value ===
      'pharmacy'
    ) {
      /*
       * IMPORTANTE:
       * sólo unidades del proyecto/estado activo.
       */
      const available =
        scopedFarmacias.value
          .filter(
            farmacia =>
              farmacia
                .region_sanitaria ===
              region
          )

      const chosen =
        available.find(
          farmacia =>
            Number(
              farmacia.id
            ) ===
            Number(
              originPharmacyId.value
            )
        ) ||
        available[0]

      if (
        chosen
      ) {
        origin = {
          lat:
            Number(
              chosen.latitud
            ),

          lng:
            Number(
              chosen.longitud
            )
        }
      }
    }

    const payload = {
      estado:
        criteria.value.estado ||
        null,

      proyecto:
        criteria.value.proyecto ||
        'JALISCO',

      region_sanitaria:
        region,

      strategy:
        criteria.value.strategy,

      routeEngine:
        criteria.value.routeEngine ||
        'GOOGLE_ROUTES_PLUS',

      routeMode:
        criteria.value.routeMode ||
        'ROUND_TRIP',

      maxForeignDays:
        Number(
          criteria.value
            .maxForeignDays ||
          3
        ),

      foreignOperatorsPerRoute:
        Number(
          criteria.value
            .foreignOperatorsPerRoute ||
          1
        ),

      lodgingSearchRadiusKm:
        Number(
          criteria.value
            .lodgingSearchRadiusKm ||
          20
        ),

      originMode:
        originMode.value,

      selectedCedisId:
        criteria.value
          .selectedCedisId ||
        null,

      operatorCount:
        Number(
          criteria.value
            .operatorCount ||
          1
        ),

      kmPerLiter:
        Number(
          criteria.value
            .kmPerLiter ||
          10
        ),

      fuelPricePerLiter:
        Number(
          criteria.value
            .fuelPricePerLiter ||
          0
        ),

      dailyAllowance:
        Number(
          criteria.value
            .dailyAllowance ||
          0
        ),

      options: {
        ...criteria.value
          .options,

        avoidDificilAcceso:
          criteria.value
            .options
            .avoidDificilAcceso !==
          false
      }
    }

    if (
      origin
    ) {
      payload.origin =
        origin
    }

    if (
      criteria.value
        .scope ===
        'single' &&
      criteria.value
        .strategy ===
        'MANUAL'
    ) {
      payload.manualOrderIds =
        manualPoints.value
          .filter(
            point =>
              point.enabled
          )
          .map(
            point =>
              Number(
                point.id
              )
          )
    }

    lastRegionUsed.value =
      region

    lastOriginUsed.value =
      origin ||
      null

    return payload
  }

  // =========================================================
  // HTTP
  // =========================================================

  async function postCompute(
    payload,
    runId
  ) {
    try {
      const controller =
        new AbortController()

      controllers.value.push(
        controller
      )

      const data =
        await computeRoute(
          payload,
          {
            signal:
              controller.signal
          }
        )

      controllers.value =
        controllers.value.filter(
          item =>
            item !== controller
        )

      if (
        runId !==
        computeRunId.value
      ) {
        return null
      }

      /*
      * ========================================================
      * NO CONSIDERAR "0 RUTAS" COMO RESULTADO EXITOSO
      * ========================================================
      *
      * El backend puede responder HTTP 200 pero devolver
      * subroutes: [].
      *
      * En ese caso NO:
      * - guardamos totales en cero
      * - dibujamos
      * - ocultamos marcadores
      * - habilitamos resultados/PDF
      */

      const subroutes =
        Array.isArray(
          data?.subroutes
        )
          ? data.subroutes
          : []

      if (
        subroutes.length ===
        0
      ) {
        if (
          typeof clearPharmacyMarkerFilter ===
          'function'
        ) {
          clearPharmacyMarkerFilter()
        }

        alert(
          data?.info ||
          data?.message ||
          'No se pudo calcular una ruta con la configuración seleccionada.'
        )

        return null
      }

      return data
    } catch (
      error
    ) {
      if (
        error?.name ===
        'AbortError'
      ) {
        return null
      }

      console.error(
        error
      )

      /*
      * Si el cálculo falla, los marcadores normales
      * deben permanecer visibles.
      */
      if (
        typeof clearPharmacyMarkerFilter ===
        'function'
      ) {
        clearPharmacyMarkerFilter()
      }

      alert(
        error?.message ||
        'Fallo de red calculando la ruta'
      )

      return null
    }
  }

  // =========================================================
  // DIBUJO DE RUTAS
  // =========================================================

  async function drawSubroutesAndNumbers(
    data
  ) {
    if (
      !window.google ||
      !google.maps
    ) {
      throw new Error(
        'Google Maps JS API no está cargada aún.'
      )
    }

    /*
    * Al dibujar una ruta ocultamos los marcadores
    * normales de las unidades para dejar visible
    * únicamente la ruta, su origen y su secuencia.
    *
    * clearRoutes() restaura los marcadores al cerrar
    * la ruta mediante clearPharmacyMarkerFilter().
    */
    if (
      typeof filterPharmacyMarkersByIds ===
      'function'
    ) {
      filterPharmacyMarkersByIds(
        []
      )
    }

    await google.maps
      .importLibrary(
        'geometry'
      )

    const paletteSR = [
      '#1565C0',
      '#2E7D32',
      '#6A1B9A',
      '#EF6C00',
      '#00897B',
      '#D81B60',
      '#5D4037'
    ]

    const routeRegion =
      data?.input
        ?.region_sanitaria ||
      null

    const regionColorMap = {
      '01 - COLOTLÁN':
        '#1E88E5',

      '02 - LAGOS DE MORENO':
        '#43A047',

      '03 - TEPATITLÁN':
        '#8E24AA',

      '04 - LA BARCA':
        '#F4511E',

      '05 - TAMAZULA':
        '#3949AB',

      '06 - CIUDAD GUZMÁN':
        '#00897B',

      '07 - AUTLÁN':
        '#6D4C41',

      '08 - PUERTO VALLARTA':
        '#FDD835',

      '09 - AMECA':
        '#5E35B1',

      '10 - CENTRO - ZAPOPAN':
        '#00ACC1',

      '11 - CENTRO - TONALÁ':
        '#EF5350',

      '12 - CENTRO - TLAQUEPAQUE':
        '#7CB342',

      '13 - CENTRO - GUADALAJARA':
        '#FF7043',

      '01 - TIERRA CALIENTE':
        '#1E88E5',

      '02 - NORTE':
        '#43A047',

      '03 - CENTRO':
        '#8E24AA',

      '04 - MONTAÑA':
        '#F4511E',

      '05 - COSTA GRANDE':
        '#3949AB',

      '06 - COSTA CHICA':
        '#00897B',

      '07 - ACAPULCO':
        '#6D4C41'
    }

    const regionColor =
      regionColorMap[
        routeRegion
      ]

    const useSingleRegionColor =
      Boolean(
        routeRegion &&
        data?.input
          ?.strategy !==
          'MANUAL'
      )

    const colors =
      (
        data?.subroutes ||
        []
      ).map(
        (
          _,
          index
        ) =>
          useSingleRegionColor
            ? (
                regionColor ||
                '#1565C0'
              )
            : paletteSR[
                index %
                paletteSR.length
              ]
      )

    const bounds =
      new google.maps
        .LatLngBounds()

    const polylines =
      []

    ;(
      data?.subroutes ||
      []
    ).forEach(
      (
        subroute,
        index
      ) => {
        if (
          !subroute
            ?.polyline
        ) {
          return
        }

        const path =
          google.maps
            .geometry
            .encoding
            .decodePath(
              subroute.polyline
            )

        const polyline =
          new google.maps
            .Polyline({
              path,

              strokeColor:
                colors[index],

              strokeOpacity:
                0.95,

              strokeWeight:
                5,

              map:
                map.value
            })

        polyline.__operator =
          subroute.operator ||
          null

        polyline.__day =
          subroute.day ||
          null

        polylines.push(
          polyline
        )

        trackOverlay(
          polyline
        )

        path.forEach(
          latLng =>
            bounds.extend(
              latLng
            )
        )
      }
    )

    if (
      !bounds.isEmpty()
    ) {
      map.value.fitBounds(
        bounds
      )
    }

    const sequence =
      []

    // =======================================================
    // ORIGEN
    // =======================================================

    if (
      data.start &&
      typeof data.start.lat ===
        'number' &&
      typeof data.start.lng ===
        'number'
    ) {
      const {
        AdvancedMarkerElement
      } =
        await google.maps
          .importLibrary(
            'marker'
          )

      const originEl =
        document
          .createElement(
            'div'
          )

      /*
       * Antes era negro.
       * Ahora azul para evitar cuadros negros
       * visualmente confusos.
       */
      originEl.style.cssText = `
        width: 42px;
        height: 42px;
        border-radius: 12px;
        background: #0f64ad;
        color: #ffffff;
        border: 3px solid #ffffff;
        box-shadow: 0 4px 10px rgba(0,0,0,.25);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 22px;
      `

      originEl.textContent =
        data.start?.isCedis
          ? '🏬'
          : '📍'

      const originMarker =
        new AdvancedMarkerElement({
          map:
            map.value,

          position: {
            lat:
              data.start.lat,

            lng:
              data.start.lng
          },

          title:
            data.start
              ?.cedis
              ?.nombre ||
            'Origen',

          content:
            originEl
        })

      originMarker.__operator =
        null

      originMarker.__day =
        null

      originMarker
        .__isOriginMarker =
        true

      sequence.push(
        originMarker
      )

      trackOverlay(
        originMarker
      )

      // =====================================================
      // HOSPEDAJE / DESCANSO
      // =====================================================

      if (
        Array.isArray(
          data.operatorRoutes
        )
      ) {
        const {
          AdvancedMarkerElement
        } =
          await google.maps
            .importLibrary(
              'marker'
            )

        for (
          const operator
          of data.operatorRoutes
        ) {
          for (
            const day
            of operator.days ||
            []
          ) {
            const restMarkers = [
              day.startRest
                ? {
                    ...day.startRest,

                    markerType:
                      'start',

                    title:
                      `Inicio Operador ${operator.operator} · Día ${day.day}`
                  }
                : null,

              day.lodging
                ? {
                    ...day.lodging,

                    markerType:
                      'lodging',

                    title:
                      `Descanso Operador ${operator.operator} · Día ${day.day}`
                  }
                : null
            ].filter(
              Boolean
            )

            for (
              const lodging
              of restMarkers
            ) {
              if (
                !lodging?.lat ||
                !lodging?.lng
              ) {
                continue
              }

              const hotelEl =
                document
                  .createElement(
                    'div'
                  )

              hotelEl.style.cssText = `
                width: 38px;
                height: 38px;
                border-radius: 12px;
                background: ${
                  lodging.markerType ===
                  'start'
                    ? '#1d4ed8'
                    : '#7c2d12'
                };
                color: #ffffff;
                border: 3px solid #ffffff;
                box-shadow: 0 4px 10px rgba(0,0,0,.25);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 21px;
              `

              hotelEl.textContent =
                lodging.markerType ===
                  'start'
                  ? '▶️'
                  : '🏨'

              const hotelMarker =
                new AdvancedMarkerElement({
                  map:
                    map.value,

                  position: {
                    lat:
                      Number(
                        lodging.lat
                      ),

                    lng:
                      Number(
                        lodging.lng
                      )
                  },

                  title:
                    lodging.title ||
                    lodging.name ||
                    'Hospedaje / descanso',

                  content:
                    hotelEl
                })

              hotelMarker.__operator =
                operator.operator ||
                null

              hotelMarker.__day =
                day.day ||
                null

              hotelMarker
                .__isRestMarker =
                true

              sequence.push(
                hotelMarker
              )

              trackOverlay(
                hotelMarker
              )
            }
          }
        }
      }
    }

    // =======================================================
    // NUMERACIÓN POR OPERADOR
    // =======================================================

    if (
      Array.isArray(
        data.operatorRoutes
      ) &&
      data.operatorRoutes.length
    ) {
      const {
        AdvancedMarkerElement,
        PinElement
      } =
        await google.maps
          .importLibrary(
            'marker'
          )

      for (
        const operator
        of data.operatorRoutes
      ) {
        for (
          const day
          of operator.days ||
          []
        ) {
          const dayPoints =
            Array.isArray(
              day.points
            )
              ? day.points
              : []

          for (
            const point
            of dayPoints
          ) {
            if (
              !point?.id
            ) {
              continue
            }

            if (
              typeof point.lat !==
                'number' ||
              typeof point.lng !==
                'number'
            ) {
              continue
            }

            /*
             * Antes era #111827.
             * Ahora azul.
             */
            const pin =
              new PinElement({
                background:
                  '#0f64ad',

                borderColor:
                  '#ffffff',

                glyphColor:
                  '#ffffff',

                glyphText:
                  String(
                    point.order ||
                    1
                  )
              })

            const marker =
              new AdvancedMarkerElement({
                map:
                  map.value,

                position: {
                  lat:
                    point.lat,

                  lng:
                    point.lng
                },

                title:
                  `${
                    point.order ||
                    ''
                  }. ${
                    point.name ||
                    ''
                  }`.trim(),

                content:
                  pin
              })

            marker.__operator =
              operator.operator ||
              null

            marker.__day =
              day.day ||
              null

            sequence.push(
              marker
            )

            trackOverlay(
              marker
            )
          }
        }
      }
    } else if (
      Array.isArray(
        data.visitOrder
      ) &&
      data.visitOrder.length
    ) {
      const {
        AdvancedMarkerElement,
        PinElement
      } =
        await google.maps
          .importLibrary(
            'marker'
          )

      let sequenceNumber =
        1

      for (
        const point
        of data.visitOrder
      ) {
        if (
          point.name ===
            'ORIGEN' ||
          String(
            point.name ||
            ''
          ).includes(
            'ORIGEN'
          )
        ) {
          continue
        }

        if (
          !point.id
        ) {
          continue
        }

        if (
          typeof point.lat !==
            'number' ||
          typeof point.lng !==
            'number'
        ) {
          continue
        }

        const pin =
          new PinElement({
            background:
              '#0f64ad',

            borderColor:
              '#ffffff',

            glyphColor:
              '#ffffff',

            glyphText:
              String(
                sequenceNumber++
              )
          })

        const marker =
          new AdvancedMarkerElement({
            map:
              map.value,

            position: {
              lat:
                point.lat,

              lng:
                point.lng
            },

            title:
              point.name,

            content:
              pin
          })

        marker.__operator =
          point.operator ||
          null

        marker.__day =
          point.day ||
          null

        sequence.push(
          marker
        )

        trackOverlay(
          marker
        )
      }
    }

    subrouteColors.value =
      colors

    return {
      polylines,
      seqMarkers:
        sequence
    }
  }

  // =========================================================
  // UI SUB-RUTAS
  // =========================================================

  function buildSubroutesUi(
    data
  ) {
    subroutesUi.value =
      []

    allSubroutesUi.value =
      []

    if (
      !data ||
      !Array.isArray(
        data.subroutes
      )
    ) {
      return
    }

    const countersByOperator =
      new Map()

    let globalAcc =
      1

    data.subroutes
      .forEach(
        (
          subroute,
          index
        ) => {
          const operator =
            subroute.operator ||
            null

          let start
          let end

          if (
            operator
          ) {
            const current =
              countersByOperator
                .get(
                  operator
                ) ||
              1

            start =
              current

            end =
              current +
              Number(
                subroute.count ||
                0
              ) -
              1

            countersByOperator
              .set(
                operator,
                end + 1
              )
          } else {
            start =
              globalAcc

            end =
              globalAcc +
              Number(
                subroute.count ||
                0
              ) -
              1

            globalAcc =
              end + 1
          }

          allSubroutesUi.value
            .push({
              idx:
                index,

              operator,

              day:
                subroute.day ||
                null,

              label:
                subroute.label ||
                (
                  operator
                    ? `Operador ${operator}`
                    : `Sub-ruta ${index + 1}`
                ),

              color:
                subrouteColors
                  .value[
                    index
                  ] ||
                '#1565C0',

              distance:
                subroute.distance ||
                0,

              duration:
                subroute.duration ||
                '0s',

              range:
                subroute.count
                  ? `${start}→${end}`
                  : '—',

              tolls:
                subroute.tolls ||
                {
                  hasTolls:
                    false,

                  known:
                    false,

                  currencyCode:
                    null,

                  amount:
                    null,

                  text:
                    'Sin peajes estimados'
                }
            })
        }
      )

    subroutesUi.value =
      [
        ...allSubroutesUi.value
      ]
  }

  function recolorCurrent() {
    currentPolylines.value
      .forEach(
        (
          polyline,
          index
        ) => {
          polyline.setOptions({
            strokeColor:
              unifyColors.value
                ? '#1565C0'
                : (
                    subrouteColors
                      .value[
                        index
                      ] ||
                    '#1565C0'
                  )
          })
        }
      )

    subroutesUi.value =
      subroutesUi.value
        .map(
          (
            subroute,
            index
          ) => ({
            ...subroute,

            color:
              unifyColors.value
                ? '#1565C0'
                : (
                    subrouteColors
                      .value[
                        index
                      ] ||
                    '#1565C0'
                  )
          })
        )
  }

  function focusSubroute(
    index
  ) {
    const polyline =
      currentPolylines.value[
        index
      ]

    if (
      !polyline
    ) {
      return
    }

    const path =
      polyline.getPath()

    const bounds =
      new google.maps
        .LatLngBounds()

    for (
      let indexPath = 0;
      indexPath <
      path.getLength();
      indexPath++
    ) {
      bounds.extend(
        path.getAt(
          indexPath
        )
      )
    }

    if (
      !bounds.isEmpty()
    ) {
      map.value.fitBounds(
        bounds
      )
    }
  }

  // =========================================================
  // LINKS GOOGLE MAPS
  // =========================================================

  const mapsLinks =
    ref([])

  const linkChunkSize =
    ref(8)

  function toFiniteNumber(
    value
  ) {
    const number =
      Number(
        value
      )

    return Number.isFinite(
      number
    )
      ? number
      : null
  }

  function normalizePoint(
    point
  ) {
    if (
      !point
    ) {
      return null
    }

    const lat =
      toFiniteNumber(
        point.lat
      )

    const lng =
      toFiniteNumber(
        point.lng
      )

    if (
      lat ==
        null ||
      lng ==
        null
    ) {
      return null
    }

    return {
      ...point,
      lat,
      lng
    }
  }

  function sameCoords(
    a,
    b,
    precision = 6
  ) {
    if (
      !a ||
      !b
    ) {
      return false
    }

    return (
      Number(
        a.lat
      ).toFixed(
        precision
      ) ===
        Number(
          b.lat
        ).toFixed(
          precision
        ) &&
      Number(
        a.lng
      ).toFixed(
        precision
      ) ===
        Number(
          b.lng
        ).toFixed(
          precision
        )
    )
  }

  function buildGoogleMapsDirUrl(
    origin,
    destination,
    waypoints = []
  ) {
    const params =
      new URLSearchParams()

    params.set(
      'api',
      '1'
    )

    params.set(
      'travelmode',
      'driving'
    )

    params.set(
      'origin',
      `${origin.lat},${origin.lng}`
    )

    params.set(
      'destination',
      `${destination.lat},${destination.lng}`
    )

    if (
      waypoints.length
    ) {
      params.set(
        'waypoints',

        waypoints
          .map(
            point =>
              `${point.lat},${point.lng}`
          )
          .join(
            '|'
          )
      )
    }

    return (
      `https://www.google.com/maps/dir/?${params.toString()}`
    )
  }

  function rebuildLinks(
    data
  ) {
    if (
      Array.isArray(
        data?.operatorRoutes
      ) &&
      data.operatorRoutes.length
    ) {
      const links =
        []

      const origin =
        normalizePoint(
          data.start
        )

      const maxIntermediate =
        Math.max(
          1,

          Number(
            linkChunkSize.value
          ) ||
          8
        )

      for (
        const operator
        of data.operatorRoutes
      ) {
        const points =
          (
            operator.points ||
            []
          )
            .map(
              normalizePoint
            )
            .filter(
              Boolean
            )

        if (
          !origin ||
          !points.length
        ) {
          continue
        }

        let fullRoute = [
          origin,
          ...points
        ]

        if (
          criteria.value
            .options
            ?.returnToOrigin
        ) {
          fullRoute.push(
            origin
          )
        }

        let startIndex =
          0

        while (
          startIndex <
          fullRoute.length -
            1
        ) {
          const endIndex =
            Math.min(
              startIndex +
                maxIntermediate +
                1,

              fullRoute.length -
                1
            )

          const chunk =
            fullRoute.slice(
              startIndex,
              endIndex + 1
            )

          if (
            chunk.length >=
            2
          ) {
            const chunkOrigin =
              chunk[0]

            const chunkDestination =
              chunk[
                chunk.length -
                1
              ]

            const chunkWaypoints =
              chunk.slice(
                1,
                -1
              )

            links.push({
              operator:
                operator.operator,

              label:
                operator.label ||
                `Operador ${operator.operator}`,

              url:
                buildGoogleMapsDirUrl(
                  chunkOrigin,
                  chunkDestination,
                  chunkWaypoints
                ),

              from:
                startIndex +
                1,

              to:
                endIndex +
                1
            })
          }

          startIndex =
            endIndex
        }
      }

      mapsLinks.value =
        links

      allMapsLinks.value =
        links

      return
    }

    const origin =
      normalizePoint(
        data.start
      )

    const visitPoints =
      (
        data.visitOrder ||
        []
      )
        .filter(
          point =>
            point &&
            point.name !==
              'ORIGEN' &&
            !String(
              point.name ||
              ''
            ).includes(
              'ORIGEN'
            )
        )
        .map(
          normalizePoint
        )
        .filter(
          Boolean
        )

    if (
      !origin &&
      !visitPoints.length
    ) {
      mapsLinks.value =
        []

      return
    }

    const safeOrigin =
      origin ||
      visitPoints[0]

    let routeStops =
      [
        ...visitPoints
      ]

    if (
      routeStops.length &&
      sameCoords(
        safeOrigin,
        routeStops[0]
      )
    ) {
      routeStops.shift()
    }

    let fullRoute = [
      safeOrigin,
      ...routeStops
    ]

    if (
      criteria.value
        .options
        ?.returnToOrigin
    ) {
      const last =
        fullRoute[
          fullRoute.length -
          1
        ]

      if (
        !sameCoords(
          last,
          safeOrigin
        )
      ) {
        fullRoute.push(
          safeOrigin
        )
      }
    }

    fullRoute =
      fullRoute.filter(
        (
          point,
          index,
          array
        ) => {
          if (
            index ===
            0
          ) {
            return true
          }

          return !sameCoords(
            point,
            array[
              index -
              1
            ]
          )
        }
      )

    if (
      fullRoute.length <
      2
    ) {
      mapsLinks.value =
        []

      return
    }

    const links =
      []

    const maxIntermediate =
      Math.max(
        1,

        Number(
          linkChunkSize.value
        ) ||
        8
      )

    let startIndex =
      0

    while (
      startIndex <
      fullRoute.length -
        1
    ) {
      const endIndex =
        Math.min(
          startIndex +
            maxIntermediate +
            1,

          fullRoute.length -
            1
        )

      const chunk =
        fullRoute.slice(
          startIndex,
          endIndex + 1
        )

      if (
        chunk.length >=
        2
      ) {
        const chunkOrigin =
          chunk[0]

        const chunkDestination =
          chunk[
            chunk.length -
              1
          ]

        const chunkWaypoints =
          chunk.slice(
            1,
            -1
          )

        const operator =
          chunk.find(
            point =>
              point.operator
          )?.operator ||
          null

        links.push({
          operator,

          url:
            buildGoogleMapsDirUrl(
              chunkOrigin,
              chunkDestination,
              chunkWaypoints
            ),

          from:
            startIndex +
            1,

          to:
            endIndex +
            1
        })
      }

      startIndex =
        endIndex
    }

    mapsLinks.value =
      links

    allMapsLinks.value =
      links
  }

  function copyToClipboard(
    url
  ) {
    return copyLinkToClipboard(
      url
    )
  }

  // =========================================================
  // APLICAR RESULTADO
  // =========================================================

  async function applyComputedRoute(
    data,
    runId
  ) {
    if (
      !data ||
      runId !==
        computeRunId.value
    ) {
      return
    }

    lastRawData.value =
      data

    routeTotal.value =
      data.total

    routeLegs.value =
      Array.isArray(
        data.legs
      )
        ? data.legs
        : []

    readableOrder.value =
      data.readableOrder ||
      []

    operatorRoutes.value =
      Array.isArray(
        data.operatorRoutes
      )
        ? data.operatorRoutes
        : []

    routeFuel.value =
      data.fuel ||
      null

    routeTolls.value =
      data.tolls ||
      {
        hasTolls:
          false,

        known:
          false,

        currencyCode:
          null,

        amount:
          null,

        text:
          'Sin peajes estimados'
      }

    initPostOrderFromVisit(
      data.visitOrder
    )

    const {
      polylines,
      seqMarkers
    } =
      await drawSubroutesAndNumbers(
        data
      )

    if (
      runId !==
      computeRunId.value
    ) {
      polylines.forEach(
        detachOverlay
      )

      seqMarkers.forEach(
        detachOverlay
      )

      return
    }

    currentPolylines.value =
      polylines

    sequenceMarkers.value =
      seqMarkers

    buildSubroutesUi(
      data
    )

    recolorCurrent()

    rebuildLinks(
      data
    )
  }

  // =========================================================
  // CALCULAR RUTA GENERAL
  // =========================================================

  async function runCompute() {
    /*
    * ==========================================================
    * VALIDAR ORIGEN ANTES DE CERRAR MODAL O TOCAR EL MAPA
    * ==========================================================
    */

    if (
      originMode.value ===
      'cedis' &&
      !criteria.value
        .selectedCedisId
    ) {
      alert(
        'Debes seleccionar un origen antes de calcular la ruta.\n\nSelecciona un CEDIS de origen o, si el proyecto no tiene CEDIS registrado, utiliza "Buscar otro origen".'
      )

      return
    }

    if (
      originMode.value ===
      'coords'
    ) {
      const lat =
        Number(
          criteria.value
            .originCoords
            ?.lat
        )

      const lng =
        Number(
          criteria.value
            .originCoords
            ?.lng
        )

      const validCoords =
        Number.isFinite(
          lat
        ) &&
        Number.isFinite(
          lng
        ) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180

      if (
        !validCoords
      ) {
        alert(
          'Debes seleccionar un origen antes de calcular la ruta.\n\nBusca una dirección, CEDIS o establecimiento en "Buscar otro origen" y selecciónalo.'
        )

        return
      }
    }

    if (
      originMode.value ===
        'pharmacy' &&
      !originPharmacyId.value
    ) {
      alert(
        'Debes seleccionar una unidad de origen antes de calcular la ruta.'
      )

      return
    }

    /*
    * Sólo cerramos el modal y limpiamos la ruta anterior
    * cuando la configuración mínima ya es válida.
    */

    criteriaOpen.value =
      false

    onCloseRoute()

    const runId =
      computeRunId.value

    /*
    * ==========================================================
    * UNA REGIÓN
    * ==========================================================
    */

    if (
      criteria.value.scope ===
      'single'
    ) {
      const payload =
        buildPayload(
          criteria.value.region
        )

      const data =
        await postCompute(
          payload,
          runId
        )

      if (
        !data
      ) {
        return
      }

      await applyComputedRoute(
        data,
        runId
      )

      return
    }

    /*
    * ==========================================================
    * TODO EL PROYECTO
    *
    * Debe utilizar siempre una sola solicitud PROJECT,
    * independientemente de si se seleccionó 1 o N operadores.
    *
    * Esto permite que el backend devuelva un resultado
    * consolidado y que applyComputedRoute alimente:
    *
    * - mapa
    * - panel
    * - totales
    * - operadores
    * - combustible
    * - peajes
    * - enlaces
    * ==========================================================
    */

    if (
      criteria.value.scope ===
      'all'
    ) {
      const payload =
        buildPayload(
          null
        )

      payload.region_sanitaria =
        null

      payload.scope =
        'PROJECT'

      payload.projectWide =
        true

      const data =
        await postCompute(
          payload,
          runId
        )

      if (
        !data
      ) {
        return
      }

      await applyComputedRoute(
        data,
        runId
      )

      return
    }

    /*
    * Si por alguna razón llega un scope no reconocido,
    * no enviamos una petición ambigua al backend.
    */
    alert(
      'El alcance de cálculo seleccionado no es válido.'
    )
  }

  // =========================================================
  // RUTA PERSONALIZADA
  // =========================================================

  async function runCustomRoute() {
    if (
      !customPoints.value.length
    ) {
      alert(
        'Agrega al menos una unidad a la ruta personalizada.'
      )

      return
    }

    /*
     * Sólo permitimos IDs pertenecientes
     * al ámbito Estado/Proyecto activo.
     */
    const allowedIds =
      new Set(
        scopedFarmacias.value
          .map(
            farmacia =>
              Number(
                farmacia.id
              )
          )
      )

    const enabledPoints =
      customPoints.value
        .filter(
          point =>
            point.enabled !==
              false &&
            allowedIds.has(
              Number(
                point.id
              )
            )
        )

    const idsBase =
      enabledPoints
        .map(
          point =>
            Number(
              point.id
            )
        )

    if (
      !idsBase.length
    ) {
      alert(
        'Agrega al menos una unidad válida del proyecto seleccionado a la ruta personalizada.'
      )

      return
    }

    const origin =
      resolveCustomOrigin()

    if (
      customOriginMode.value ===
        'coords' &&
      !origin
    ) {
      alert(
        'Captura coordenadas válidas para el punto de inicio.'
      )

      return
    }

    if (
      customOriginMode.value ===
        'pharmacy' &&
      !origin
    ) {
      alert(
        'Selecciona una unidad válida como punto de inicio.'
      )

      return
    }

    if (
      customOriginMode.value ===
        'first' &&
      !origin
    ) {
      alert(
        'La primera unidad no tiene coordenadas válidas para usarla como origen.'
      )

      return
    }

    const ids =
      rotateIdsFromCustomOrigin(
        idsBase
      )

    const payload = {
      estado:
        criteria.value.estado ||
        null,

      proyecto:
        criteria.value.proyecto ||
        'JALISCO',

      routeEngine:
        criteria.value.routeEngine ||
        'GOOGLE_ROUTES_PLUS',

      /*
       * Si ya resolvimos un origen,
       * lo enviamos como coordenadas.
       */
      originMode:
        origin
          ? 'coords'
          : 'cedis',

      selectedCedisId:
        origin
          ? null
          : (
              criteria.value
                .selectedCedisId ||
              null
            ),

      operatorCount:
        1,

      kmPerLiter:
        Number(
          criteria.value
            .kmPerLiter ||
          10
        ),

      fuelPricePerLiter:
        Number(
          criteria.value
            .fuelPricePerLiter ||
          0
        ),

      dailyAllowance:
        Number(
          criteria.value
            .dailyAllowance ||
          0
        ),

      strategy:
        customStrategy.value ||
        'FASTEST',

      manualOrderIds:
        ids,

      options: {
        ...criteria.value
          .options,

        /*
         * En ruta manual el usuario ya decidió
         * explícitamente qué unidades incluir.
         */
        avoidDificilAcceso:
          false,

        avoidTolls:
          customStrategy.value ===
            'RESOURCES'
            ? true
            : criteria.value
                .options
                .avoidTolls
      }
    }

    if (
      origin
    ) {
      payload.origin =
        origin

      lastOriginUsed.value =
        origin
    } else {
      lastOriginUsed.value =
        null
    }

    lastRegionUsed.value =
      null

    onCloseRoute()

    const runId =
      computeRunId.value

    const data =
      await postCompute(
        payload,
        runId
      )

    await applyComputedRoute(
      data,
      runId
    )
  }

  // =========================================================
  // RECALCULAR ORDEN POSTERIOR
  // =========================================================

  async function recalcWithPostOrder() {
    if (
      !postOrder.value.length
    ) {
      alert(
        'No hay puntos activos para recalcular'
      )

      return
    }

    const ids =
      postOrder.value
        .filter(
          point =>
            point.enabled
        )
        .map(
          point =>
            Number(
              point.id
            )
        )

    if (
      !ids.length
    ) {
      alert(
        'Selecciona al menos un punto'
      )

      return
    }

    const payload = {
      estado:
        criteria.value.estado ||
        null,

      proyecto:
        criteria.value.proyecto ||
        'JALISCO',

      routeEngine:
        criteria.value.routeEngine ||
        'GOOGLE_ROUTES_PLUS',

      operatorCount:
        Number(
          criteria.value
            .operatorCount ||
          1
        ),

      kmPerLiter:
        Number(
          criteria.value
            .kmPerLiter ||
          10
        ),

      fuelPricePerLiter:
        Number(
          criteria.value
            .fuelPricePerLiter ||
          0
        ),

      dailyAllowance:
        Number(
          criteria.value
            .dailyAllowance ||
          0
        ),

      strategy:
        'MANUAL',

      options: {
        ...criteria.value
          .options
      },

      manualOrderIds:
        ids
    }

    const region =
      lastRegionUsed.value ||
      criteria.value.region ||
      null

    if (
      region
    ) {
      payload.region_sanitaria =
        region
    }

    if (
      lastOriginUsed.value
    ) {
      payload.origin =
        lastOriginUsed.value

      payload.originMode =
        'coords'
    } else {
      payload.originMode =
        originMode.value

      payload.selectedCedisId =
        criteria.value
          .selectedCedisId ||
        null
    }

    onCloseRoute()

    const runId =
      computeRunId.value

    const data =
      await postCompute(
        payload,
        runId
      )

    await applyComputedRoute(
      data,
      runId
    )
  }

  // =========================================================
  // VISIBILIDAD MASIVA
  // =========================================================

  function toggleMassiveVisibility(
    massiveResult
  ) {
    massiveResult.visible =
      !massiveResult.visible

    ;(
      massiveResult.polylines ||
      []
    ).forEach(
      overlay => {
        if (
          overlay
        ) {
          overlay.setMap(
            massiveResult.visible
              ? map.value
              : null
          )
        }
      }
    )

    ;(
      massiveResult
        .sequenceMarkers ||
      []
    ).forEach(
      overlay => {
        if (
          overlay
        ) {
          overlay.map =
            massiveResult.visible
              ? map.value
              : null
        }
      }
    )
  }

  function seedPostOrderFromManual() {
    postOrder.value =
      []

    for (
      const point
      of manualPoints.value ||
      []
    ) {
      if (
        !point?.id
      ) {
        continue
      }

      postOrder.value.push({
        id:
          Number(
            point.id
          ),

        name:
          point.name ||
          String(
            point.id
          ),

        clues:
          point.clues ||
          '',

        unidad:
          point.unidad ||
          '',

        region:
          point.region ||
          '',

        enabled:
          point.enabled !==
          false,

        hard:
          Boolean(
            point.hard
          )
      })
    }
  }

  // =========================================================
  // FILTRO VISUAL POR OPERADOR / DÍA
  // =========================================================

  function applyOperatorFilter(
    operator
  ) {
    if (
      selectedOperator.value ===
      operator
    ) {
      selectedOperator.value =
        null

      selectedOperatorDay.value =
        null
    } else {
      selectedOperator.value =
        operator

      selectedOperatorDay.value =
        null
    }

    applyRouteVisualFilter()
  }

  function applyOperatorDayFilter(
    operator,
    day
  ) {
    const sameOperator =
      selectedOperator.value ===
      operator

    const sameDay =
      selectedOperatorDay.value ===
      day

    if (
      sameOperator &&
      sameDay
    ) {
      selectedOperator.value =
        operator

      selectedOperatorDay.value =
        null
    } else {
      selectedOperator.value =
        operator

      selectedOperatorDay.value =
        day
    }

    applyRouteVisualFilter()
  }

  function applyRouteVisualFilter() {
    const activeOperator =
      selectedOperator.value

    const activeDay =
      selectedOperatorDay.value

    const bounds =
      new google.maps
        .LatLngBounds()

    currentPolylines.value
      .forEach(
        polyline => {
          if (
            !polyline
          ) {
            return
          }

          const operator =
            polyline.__operator ||
            null

          const day =
            polyline.__day ||
            null

          const visible =
            !activeOperator ||
            (
              operator ===
                activeOperator &&
              (
                !activeDay ||
                day ===
                  activeDay
              )
            )

          polyline.setMap(
            map.value
          )

          polyline.setOptions({
            strokeOpacity:
              visible
                ? 0.95
                : 0.05,

            strokeWeight:
              visible
                ? 7
                : 2,

            zIndex:
              visible
                ? 999
                : 1
          })

          if (
            visible &&
            activeOperator
          ) {
            const path =
              polyline.getPath()

            for (
              let index = 0;
              index <
              path.getLength();
              index++
            ) {
              bounds.extend(
                path.getAt(
                  index
                )
              )
            }
          }
        }
      )

    sequenceMarkers.value
      .forEach(
        marker => {
          if (
            !marker
          ) {
            return
          }

          if (
            marker
              .__isOriginMarker
          ) {
            marker.map =
              map.value

            return
          }

          const operator =
            marker.__operator ||
            null

          const day =
            marker.__day ||
            null

          const visible =
            !activeOperator ||
            (
              operator ===
                activeOperator &&
              (
                !activeDay ||
                day ===
                  activeDay
              )
            )

          marker.map =
            visible
              ? map.value
              : null
        }
      )

    subroutesUi.value =
      activeOperator
        ? allSubroutesUi.value
            .filter(
              subroute =>
                subroute.operator ===
                  activeOperator &&
                (
                  !activeDay ||
                  subroute.day ===
                    activeDay
                )
            )
        : [
            ...allSubroutesUi.value
          ]

    mapsLinks.value =
      activeOperator
        ? allMapsLinks.value
            .filter(
              link =>
                link.operator ===
                  activeOperator &&
                (
                  !activeDay ||
                  link.day ===
                    activeDay
                )
            )
        : [
            ...allMapsLinks.value
          ]

    if (
      activeOperator
    ) {
      const operatorRoute =
        operatorRoutes.value
          .find(
            route =>
              Number(
                route.operator
              ) ===
              Number(
                activeOperator
              )
          )

      const ids =
        activeDay
          ? (
              operatorRoute
                ?.days ||
              []
            )
              .find(
                day =>
                  Number(
                    day.day
                  ) ===
                  Number(
                    activeDay
                  )
              )
              ?.points
              ?.map(
                point =>
                  Number(
                    point.id
                  )
              )
              ?.filter(
                Number.isFinite
              ) ||
            []
          : (
              operatorRoute
                ?.points ||
              []
            )
              .map(
                point =>
                  Number(
                    point.id
                  )
              )
              .filter(
                Number.isFinite
              )

      /*
       * Intencionalmente escondemos los marcadores
       * normales para no tapar la numeración.
       */
      if (
        typeof filterPharmacyMarkersByIds ===
        'function'
      ) {
        filterPharmacyMarkersByIds(
          []
        )
      }

      if (
        !bounds.isEmpty()
      ) {
        map.value.fitBounds(
          bounds
        )
      }
    } else if (
      operatorRoutes.value.length &&
      typeof filterPharmacyMarkersByIds ===
        'function'
    ) {
      filterPharmacyMarkersByIds(
        []
      )
    } else if (
      typeof clearPharmacyMarkerFilter ===
      'function'
    ) {
      clearPharmacyMarkerFilter()
    }
  }

  // =========================================================
  // EXPORT
  // =========================================================

  return {
    /*
     * Catálogo / ámbito
     */
    farmacias,
    scopedFarmacias,
    regiones,
    farmaciasRegion,

    /*
     * Criterios
     */
    criteriaOpen,
    criteria,
    originMode,
    originPharmacyId,
    openCriteria,

    /*
     * Manual
     */
    manualPoints,
    lockManualFromTemplate,
    onDragStart,
    onDragEnter,
    onDrop,

    /*
     * Ruta personalizada
     */
    customPoints,
    customStrategy,
    customOriginMode,
    customOriginPharmacyId,
    customOriginCoords,
    customOriginCandidates,
    addCustomStops,
    setCustomPoints,
    clearCustomPoints,
    runCustomRoute,

    /*
     * Post cálculo
     */
    postOrder,
    postDragStart,
    postDragEnter,
    postDrop,

    /*
     * Resultado
     */
    routeTotal,
    routeLegs,
    readableOrder,
    operatorRoutes,
    routeFuel,

    selectedOperator,
    selectedOperatorDay,

    applyOperatorFilter,
    applyOperatorDayFilter,

    routeTolls,

    massiveResults,
    currentPolylines,
    sequenceMarkers,

    subroutesUi,
    subrouteColors,
    unifyColors,

    recolorCurrent,
    focusSubroute,

    hasAnyRoute,

    /*
     * Google Maps
     */
    mapsLinks,
    linkChunkSize,
    copyToClipboard,

    /*
     * Ejecución
     */
    runCompute,
    recalcWithPostOrder,
    onCloseRoute,

    /*
     * Último cálculo
     */
    lastRegionUsed,
    lastOriginUsed,
    lastRawData,

    toggleMassiveVisibility,
    seedPostOrderFromManual
  }
}
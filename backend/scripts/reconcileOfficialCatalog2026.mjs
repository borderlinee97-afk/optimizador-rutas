import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

import { pool } from '../db/pool.js'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const catalogArgument = process.argv[2]

const CATALOG_PATH = catalogArgument
  ? path.resolve(
      process.cwd(),
      catalogArgument
    )
  : path.resolve(
      __dirname,
      '../data/CATALOGO_OFICIAL_2026_REESTRUCTURA.xlsx'
    )

const REPORT_DIR = path.resolve(
  __dirname,
  '../reports'
)

const REPORT_PATH = path.resolve(
  REPORT_DIR,
  'reconciliation-2026.json'
)

const PREFERRED_SHEET_NAME =
  '2026'

/*
 * ==========================================================
 * ALIAS CONFIRMADOS
 * ==========================================================
 *
 * Cómo aparece en catálogo
 *              ↓
 * Persona canónica en nuestra BD.
 */
const SUPERVISOR_ALIASES =
  new Map([
    [
      normalizeName(
        'SOLANOLOPEZ EDGAR EFRAIN'
      ),
      'SOLANO LOPEZ EDGAR EFRAIN',
    ],

    [
      normalizeName(
        'TAVAREZ OÑATE CHRISTIAN'
      ),
      'TAVARES OÑATE CHRISTIAN VICENTE',
    ],

    [
      normalizeName(
        'TAVAREZ OÑATE CHRISTIAN VICENTE'
      ),
      'TAVARES OÑATE CHRISTIAN VICENTE',
    ],

    [
      normalizeName(
        'PEREZ LOPEZ ALEJANDRO'
      ),
      'PEREZ LOPEZ JESUS ALEJANDRO',
    ],
  ])

/*
 * ==========================================================
 * CORRECCIONES DE COORDINADOR CONFIRMADAS
 * ==========================================================
 */

const SUPERVISOR_COORDINATOR_OVERRIDES =
  new Map([
    [
      normalizeName(
        'TAVARES OÑATE CHRISTIAN VICENTE'
      ),
      'CALDERON MALDONADO MIRELLA',
    ],
  ])

/*
 * ==========================================================
 * REGISTROS EXCLUIDOS DE LA NUEVA ASIGNACIÓN
 * ==========================================================
 *
 * Esta unidad está cerrada.
 *
 * NO borra nada de PostgreSQL.
 * Únicamente evita usar esta fila para generar
 * la nueva estructura Supervisor → Unidad.
 *
 * Conservamos a PEREZ LOPEZ JESUS ALEJANDRO
 * como persona porque las demás unidades de
 * PEREZ LOPEZ ALEJANDRO corresponden a él.
 */

const EXCLUDED_ASSIGNMENTS = [
  {
    supervisor:
      normalizeName(
        'PEREZ LOPEZ JESUS ALEJANDRO'
      ),

    unit:
      normalizeName(
        'CENTRO DE SALUD SAN LUCAS EVANGELISTA'
      ),

    reason:
      'UNIDAD_CERRADA',
  },
]

/*
 * El script busca automáticamente la fila
 * real de encabezados.
 */
const REQUIRED_HEADER_GROUPS = [
  [
    'CLUES ACTUALIZADO',
    'CLUES',
  ],

  [
    'UNIDAD',
  ],

  [
    'SUPERVISOR',
  ],

  [
    'COORDINADOR',
  ],
]

async function main() {
  printBanner()

  if (
    !fs.existsSync(
      CATALOG_PATH
    )
  ) {
    throw new Error(
      `No encontré el Excel en:\n${CATALOG_PATH}`
    )
  }

  console.log(
    `Excel: ${CATALOG_PATH}`
  )

  console.log('')

  /*
   * ========================================================
   * EXCEL
   * ========================================================
   */

  const catalog =
    loadOfficialCatalog()

  /*
   * ========================================================
   * POSTGRESQL LOCAL
   * ========================================================
   */

  const [
    dbUnitsResult,
    personasResult,
  ] =
    await Promise.all([
      pool.query(`
        SELECT
          id,
          clues,
          unidad,
          region_sanitaria,

          estatus::text
            AS estatus,

          direccion,

          latitud::double precision
            AS latitud,

          longitud::double precision
            AS longitud,

          estado,
          proyecto

        FROM public.farmacia

        WHERE UPPER(
          BTRIM(
            COALESCE(
              estado,
              ''
            )
          )
        ) =
        'JALISCO'

        ORDER BY id
      `),

      pool.query(`
        SELECT
          id,
          nombre,
          area,
          rol,
          superior_id,
          activo,
          pharmacy_scope_mode

        FROM public.personas

        WHERE area =
            'FARMACIAS'

          AND activo =
            TRUE

        ORDER BY nombre
      `),
    ])

  const dbUnits =
    dbUnitsResult.rows

  const personas =
    personasResult.rows

  /*
   * Índices para conciliación.
   */
  const dbIndexes =
    buildDatabaseIndexes(
      dbUnits
    )

  const personaByName =
    buildPersonaIndex(
      personas
    )

  /*
   * ========================================================
   * CONCILIAR CATÁLOGO ↔ 583 UNIDADES
   * ========================================================
   */

  const reconciliation =
    reconcileCatalogRows({
      officialRows:
        catalog.rows,

      dbUnits,

      dbIndexes,
    })

  /*
   * ========================================================
   * PERSONAS
   * ========================================================
   */

  const people =
    analyzePeople({
      matched:
        reconciliation
          .matched,

      personas,

      personaByName,
    })

  /*
   * ========================================================
   * FARMACIA MÓVIL
   * ========================================================
   */

  const mobilePharmacy =
    reconciliation
      .matched
      .filter(
        ({
          database,
          official,
        }) => {
          return (
            normalizeName(
              database.unidad
            ) ===
              normalizeName(
                'FARMACIA MOVIL'
              ) ||

            normalizeName(
              official.unidad
            ) ===
              normalizeName(
                'FARMACIA MOVIL'
              )
          )
        }
      )
      .map(
        ({
          database,
          official,
          matchMethod,
        }) => ({
          databaseId:
            Number(
              database.id
            ),

          clues:
            database.clues,

          unidad:
            database.unidad,

          latitud:
            database.latitud,

          longitud:
            database.longitud,

          supervisor:
            official.supervisor,

          coordinator:
            official.coordinator,

          matchMethod,

          hasFixedCoordinates:
            Number.isFinite(
              Number(
                database.latitud
              )
            ) &&
            Number.isFinite(
              Number(
                database.longitud
              )
            ),
        })
      )

  /*
   * Filas potencialmente dañadas/desplazadas.
   */
  const malformedRows =
    catalog.rows.filter(
      isPotentiallyMalformedRow
    )

  /*
   * ========================================================
   * REPORTE
   * ========================================================
   */

  const report = {
    generatedAt:
      new Date()
        .toISOString(),

    mode:
      'READ_ONLY',

    catalogPath:
      CATALOG_PATH,

    sheetName:
      catalog.sheetName,

    headerRow:
      catalog.headerRowNumber,

    database: {
      jaliscoUnits:
        dbUnits.length,

      duplicateClues:
        serializeDuplicateMap(
          dbIndexes
            .duplicateClues
        ),

      duplicateIds:
        serializeDuplicateMap(
          dbIndexes
            .duplicateIds
        ),
    },

    officialCatalog: {
      rawDataRows:
        catalog.rawDataRows,

      consideredRows:
        catalog.rows.length,

      excludedRows:
        catalog.excludedRows,

      malformedRows,

      duplicateClues:
        catalog
          .duplicateClues,

      duplicateSystemIds:
        catalog
          .duplicateSystemIds,
    },

    reconciliation: {
      matched:
        reconciliation
          .matched
          .map(
            simplifyMatch
          ),

      matchedCount:
        reconciliation
          .matched
          .length,

      matchedByClues:
        reconciliation
          .matched
          .filter(
            item =>
              item.matchMethod ===
              'CLUES'
          )
          .length,

      matchedBySystemId:
        reconciliation
          .matched
          .filter(
            item =>
              item.matchMethod ===
              'ID_SISTEMA'
          )
          .length,

      conflicts:
        reconciliation
          .conflicts,

      officialNotInDatabase:
        reconciliation
          .officialNotInDatabase
          .map(
            simplifyOfficialRow
          ),

      databaseNotInOfficial:
        reconciliation
          .databaseNotInOfficial
          .map(
            simplifyDatabaseUnit
          ),

      nameRegionCandidates:
        reconciliation
          .nameRegionCandidates,
    },

    people,

    mobilePharmacy,
  }

  /*
   * ========================================================
   * GUARDAR JSON
   * ========================================================
   */

  fs.mkdirSync(
    REPORT_DIR,
    {
      recursive:
        true,
    }
  )

  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      report,
      null,
      2
    ),
    'utf8'
  )

  printSummary(
    report
  )

  console.log('')

  console.log(
    `Reporte completo: ${REPORT_PATH}`
  )

  console.log('')
}

/*
 * ==========================================================
 * LECTURA DEL EXCEL
 * ==========================================================
 */

function loadOfficialCatalog() {
  const workbook =
    XLSX.readFile(
      CATALOG_PATH,
      {
        cellDates:
          false,

        raw:
          false,
      }
    )

  /*
   * Preferimos la hoja 2026.
   *
   * Si cambia el nombre posteriormente,
   * utilizamos la primera hoja.
   */
  const sheetName =
    workbook
      .SheetNames
      .includes(
        PREFERRED_SHEET_NAME
      )
      ? PREFERRED_SHEET_NAME
      : workbook
          .SheetNames[0]

  if (!sheetName) {
    throw new Error(
      'El Excel no contiene hojas.'
    )
  }

  const sheet =
    workbook
      .Sheets[
        sheetName
      ]

  /*
   * Convertimos primero a matriz para poder
   * detectar la fila real de encabezados.
   *
   * Esto también nos evita depender de que
   * siempre sea exactamente la fila 2.
   */
  const matrix =
    XLSX.utils
      .sheet_to_json(
        sheet,
        {
          header:
            1,

          defval:
            null,

          raw:
            false,

          blankrows:
            false,
        }
      )

  if (!matrix.length) {
    throw new Error(
      `La hoja "${sheetName}" está vacía.`
    )
  }

  const headerIndex =
    findHeaderRowIndex(
      matrix
    )

  if (
    headerIndex <
    0
  ) {
    throw new Error(
      `No pude detectar la fila de encabezados en la hoja "${sheetName}".`
    )
  }

  const headers =
    matrix[
      headerIndex
    ].map(
      normalizeHeader
    )

  const dataRows =
    matrix.slice(
      headerIndex +
      1
    )

  const rows = []

  const excludedRows =
    []

  for (
    let index = 0;
    index <
    dataRows.length;
    index += 1
  ) {
    const values =
      dataRows[index]

    const excelRowNumber =
      headerIndex +
      2 +
      index

    if (
      isEmptyRow(
        values
      )
    ) {
      continue
    }

    const raw =
      rowArrayToObject(
        headers,
        values
      )

    /*
     * --------------------------
     * Supervisor
     * --------------------------
     */

    const catalogSupervisor =
      cleanText(
        firstValue(
          raw,
          [
            'SUPERVISOR',
          ]
        )
      )

    const supervisor =
      resolveSupervisorName(
        catalogSupervisor
      )

    /*
     * --------------------------
     * Coordinador
     * --------------------------
     */

    let coordinator =
      cleanText(
        firstValue(
          raw,
          [
            'COORDINADOR',
          ]
        )
      )

    const override =
      SUPERVISOR_COORDINATOR_OVERRIDES
        .get(
          normalizeName(
            supervisor
          )
        )

    /*
     * Para TAVARES utilizamos la
     * relación confirmada.
     */
    if (override) {
      coordinator =
        override
    }

    coordinator =
      coordinator
        ? canonicalDisplayName(
            coordinator
          )
        : null

    /*
     * --------------------------
     * Registro normalizado
     * --------------------------
     */

    const official = {
      row:
        excelRowNumber,

      idSistema:
        normalizeSystemId(
          firstValue(
            raw,
            [
              'ID SISTEMA',
              'IDSISTEMA',
            ]
          )
        ),

      clues:
        normalizeClues(
          firstValue(
            raw,
            [
              'CLUES ACTUALIZADO',
              'CLUES ACTUALIZADA',
              'CLUES',
            ]
          )
        ),

      unidad:
        cleanText(
          firstValue(
            raw,
            [
              'UNIDAD',
            ]
          )
        ),

      region:
        cleanText(
          firstValue(
            raw,
            [
              'REGION',
              'REGION SANITARIA',
            ]
          )
        ),

      supervisor,

      catalogSupervisor,

      coordinator,

      rawState:
        cleanText(
          firstValue(
            raw,
            [
              'ESTADO',
            ]
          )
        ),
    }

    /*
     * Excluimos exclusivamente registros
     * confirmados fuera de la nueva operación.
     */
    const exclusion =
      getExclusion(
        official
      )

    if (exclusion) {
      excludedRows.push({
        ...simplifyOfficialRow(
          official
        ),

        reason:
          exclusion.reason,
      })

      continue
    }

    rows.push(
      official
    )
  }

  return {
    sheetName,

    headerRowNumber:
      headerIndex +
      1,

    rawDataRows:
      dataRows.filter(
        row =>
          !isEmptyRow(
            row
          )
      ).length,

    rows,

    excludedRows,

    duplicateClues:
      findDuplicates(
        rows,
        row =>
          row.clues
      ),

    duplicateSystemIds:
      findDuplicates(
        rows,
        row =>
          row.idSistema
      ),
  }
}

/*
 * ==========================================================
 * DETECTAR FILA DE ENCABEZADOS
 * ==========================================================
 */

function findHeaderRowIndex(
  matrix
) {
  const maxRowsToInspect =
    Math.min(
      matrix.length,
      20
    )

  for (
    let rowIndex = 0;
    rowIndex <
    maxRowsToInspect;
    rowIndex += 1
  ) {
    const normalizedHeaders =
      new Set(
        (
          matrix[
            rowIndex
          ] ||
          []
        )
          .map(
            normalizeHeader
          )
          .filter(
            Boolean
          )
      )

    const matchesAllGroups =
      REQUIRED_HEADER_GROUPS
        .every(
          group => {
            return group.some(
              header =>
                normalizedHeaders
                  .has(
                    normalizeHeader(
                      header
                    )
                  )
            )
          }
        )

    if (
      matchesAllGroups
    ) {
      return rowIndex
    }
  }

  return -1
}

/*
 * ==========================================================
 * MATRIZ → OBJETO
 * ==========================================================
 */

function rowArrayToObject(
  headers,
  values
) {
  const result = {}

  for (
    let index = 0;
    index <
    headers.length;
    index += 1
  ) {
    const header =
      headers[index]

    if (!header) {
      continue
    }

    if (
      result[
        header
      ] ===
        undefined ||
      result[
        header
      ] ===
        null
    ) {
      result[
        header
      ] =
        values[
          index
        ] ??
        null
    }
  }

  return result
}

function firstValue(
  row,
  candidates
) {
  for (
    const candidate
    of candidates
  ) {
    const key =
      normalizeHeader(
        candidate
      )

    const value =
      row[
        key
      ]

    if (
      value !==
        undefined &&
      value !==
        null &&
      String(
        value
      ).trim() !==
        ''
    ) {
      return value
    }
  }

  return null
}

/*
 * ==========================================================
 * ÍNDICES DE BD
 * ==========================================================
 */

function buildDatabaseIndexes(
  dbUnits
) {
  const byClues =
    new Map()

  const byId =
    new Map()

  const byNameRegion =
    new Map()

  const duplicateClues =
    new Map()

  const duplicateIds =
    new Map()

  for (
    const unit
    of dbUnits
  ) {
    const clues =
      normalizeClues(
        unit.clues
      )

    const id =
      normalizeSystemId(
        unit.id
      )

    const nameRegionKey =
      buildNameRegionKey(
        unit.unidad,
        unit.region_sanitaria
      )

    addUniqueIndex({
      map:
        byClues,

      duplicateMap:
        duplicateClues,

      key:
        clues,

      value:
        unit,
    })

    addUniqueIndex({
      map:
        byId,

      duplicateMap:
        duplicateIds,

      key:
        id,

      value:
        unit,
    })

    if (
      nameRegionKey
    ) {
      if (
        !byNameRegion.has(
          nameRegionKey
        )
      ) {
        byNameRegion.set(
          nameRegionKey,
          []
        )
      }

      byNameRegion
        .get(
          nameRegionKey
        )
        .push(
          unit
        )
    }
  }

  return {
    byClues,
    byId,
    byNameRegion,
    duplicateClues,
    duplicateIds,
  }
}

function addUniqueIndex({
  map,
  duplicateMap,
  key,
  value,
}) {
  if (!key) {
    return
  }

  if (
    !map.has(
      key
    )
  ) {
    map.set(
      key,
      value
    )

    return
  }

  if (
    !duplicateMap.has(
      key
    )
  ) {
    duplicateMap.set(
      key,
      [
        map.get(
          key
        ),
      ]
    )
  }

  duplicateMap
    .get(
      key
    )
    .push(
      value
    )
}

/*
 * ==========================================================
 * CONCILIACIÓN
 * ==========================================================
 *
 * Prioridad:
 *
 * 1. CLUES exacto
 * 2. ID SISTEMA = farmacia.id
 *
 * Nombre + región solo se reporta como
 * candidato. NO se considera coincidencia
 * automática.
 */

function reconcileCatalogRows({
  officialRows,
  dbUnits,
  dbIndexes,
}) {
  const matched =
    []

  const conflicts =
    []

  const officialNotInDatabase =
    []

  const nameRegionCandidates =
    []

  const matchedDatabaseIds =
    new Set()

  for (
    const official
    of officialRows
  ) {
    const byClues =
      official.clues
        ? dbIndexes
            .byClues
            .get(
              official.clues
            )
        : null

    const bySystemId =
      official.idSistema
        ? dbIndexes
            .byId
            .get(
              official.idSistema
            )
        : null

    /*
     * Si CLUES e ID SISTEMA apuntan
     * a farmacias distintas, no decidimos.
     */
    if (
      byClues &&
      bySystemId &&
      Number(
        byClues.id
      ) !==
        Number(
          bySystemId.id
        )
    ) {
      conflicts.push({
        type:
          'CLUES_ID_SYSTEM_DISAGREE',

        official:
          simplifyOfficialRow(
            official
          ),

        cluesDatabaseUnit:
          simplifyDatabaseUnit(
            byClues
          ),

        systemIdDatabaseUnit:
          simplifyDatabaseUnit(
            bySystemId
          ),
      })

      continue
    }

    const database =
      byClues ||
      bySystemId

    if (database) {
      const databaseId =
        Number(
          database.id
        )

      /*
       * Una misma unidad de la BD no puede
       * conciliarse con dos filas diferentes.
       */
      if (
        matchedDatabaseIds.has(
          databaseId
        )
      ) {
        conflicts.push({
          type:
            'DATABASE_UNIT_MATCHED_MORE_THAN_ONCE',

          official:
            simplifyOfficialRow(
              official
            ),

          database:
            simplifyDatabaseUnit(
              database
            ),
        })

        continue
      }

      const matchMethod =
        byClues
          ? 'CLUES'
          : 'ID_SISTEMA'

      matched.push({
        database,
        official,
        matchMethod,
      })

      matchedDatabaseIds.add(
        databaseId
      )

      continue
    }

    /*
     * No lo asignamos automáticamente
     * por nombre + región.
     *
     * Solo generamos candidatos para revisar.
     */
    const nameRegionKey =
      buildNameRegionKey(
        official.unidad,
        official.region
      )

    const candidates =
      nameRegionKey
        ? dbIndexes
            .byNameRegion
            .get(
              nameRegionKey
            ) ||
          []
        : []

    if (
      candidates.length
    ) {
      nameRegionCandidates.push({
        official:
          simplifyOfficialRow(
            official
          ),

        candidates:
          candidates.map(
            simplifyDatabaseUnit
          ),
      })
    }

    officialNotInDatabase.push(
      official
    )
  }

  const databaseNotInOfficial =
    dbUnits.filter(
      unit =>
        !matchedDatabaseIds
          .has(
            Number(
              unit.id
            )
          )
    )

  return {
    matched,
    conflicts,
    officialNotInDatabase,
    databaseNotInOfficial,
    nameRegionCandidates,
  }
}

/*
 * ==========================================================
 * ANALIZAR PERSONAS
 * ==========================================================
 */

function analyzePeople({
  matched,
  personas,
  personaByName,
}) {
  const supervisorAssignments =
    new Map()

  const coordinatorNames =
    new Set()

  /*
   * Solo se consideran relaciones de las
   * unidades que SÍ conciliaron con nuestras 583.
   */
  for (
    const match
    of matched
  ) {
    const {
      official,
      database,
    } =
      match

    if (
      !official.supervisor
    ) {
      continue
    }

    const supervisorName =
      canonicalDisplayName(
        official.supervisor
      )

    const supervisorKey =
      normalizeName(
        supervisorName
      )

    if (
      !supervisorAssignments.has(
        supervisorKey
      )
    ) {
      supervisorAssignments.set(
        supervisorKey,
        {
          name:
            supervisorName,

          databaseUnitIds:
            new Set(),

          clues:
            new Set(),

          coordinators:
            new Set(),
        }
      )
    }

    const entry =
      supervisorAssignments
        .get(
          supervisorKey
        )

    entry.databaseUnitIds.add(
      Number(
        database.id
      )
    )

    if (
      official.clues
    ) {
      entry.clues.add(
        official.clues
      )
    }

    if (
      official.coordinator
    ) {
      entry.coordinators.add(
        canonicalDisplayName(
          official.coordinator
        )
      )

      coordinatorNames.add(
        canonicalDisplayName(
          official.coordinator
        )
      )
    }
  }

  /*
   * ========================================================
   * SUPERVISORES
   * ========================================================
   */

  const supervisorsExisting =
    []

  const supervisorsToCreate =
    []

  const multipleCoordinatorConflicts =
    []

  const vacantTerritories =
    []

  for (
    const entry
    of supervisorAssignments.values()
  ) {
    const existing =
      personaByName.get(
        normalizeName(
          entry.name
        )
      )

    const item = {
      name:
        entry.name,

      unitsCount:
        entry
          .databaseUnitIds
          .size,

      coordinators:
        Array.from(
          entry.coordinators
        ).sort(),

      existingPersonaId:
        existing?.id ??
        null,

      existingRole:
        existing?.rol ??
        null,
    }

    /*
     * VACANTE no se crea automáticamente
     * como persona.
     */
    if (
      isVacantName(
        entry.name
      )
    ) {
      vacantTerritories.push(
        item
      )

      continue
    }

    if (
      entry
        .coordinators
        .size >
      1
    ) {
      multipleCoordinatorConflicts.push(
        item
      )
    }

    if (existing) {
      supervisorsExisting.push(
        item
      )
    } else {
      supervisorsToCreate.push(
        item
      )
    }
  }

  /*
   * ========================================================
   * COORDINADORES
   * ========================================================
   */

  const coordinatorsExisting =
    []

  const coordinatorsToCreate =
    []

  const promotions =
    []

  for (
    const coordinatorName
    of Array.from(
      coordinatorNames
    ).sort()
  ) {
    const persona =
      personaByName.get(
        normalizeName(
          coordinatorName
        )
      )

    if (!persona) {
      coordinatorsToCreate.push({
        name:
          coordinatorName,
      })

      continue
    }

    coordinatorsExisting.push({
      name:
        coordinatorName,

      personaId:
        persona.id,

      currentRole:
        persona.rol,
    })

    /*
     * Aquí debe aparecer Rodolfo.
     */
    if (
      persona.rol !==
      'COORDINADOR'
    ) {
      promotions.push({
        name:
          coordinatorName,

        personaId:
          persona.id,

        currentRole:
          persona.rol,

        targetRole:
          'COORDINADOR',
      })
    }
  }

  /*
   * Supervisores actuales que ya existen
   * pero no tienen ninguna de nuestras
   * unidades conciliadas.
   *
   * No se elimina nada.
   */
  const matchedSupervisorNames =
    new Set(
      Array.from(
        supervisorAssignments.values()
      ).map(
        entry =>
          normalizeName(
            entry.name
          )
      )
    )

  const existingSupervisorsWithoutMatchedUnits =
    personas
      .filter(
        persona =>
          persona.rol ===
          'SUPERVISOR'
      )
      .filter(
        persona =>
          !matchedSupervisorNames.has(
            normalizeName(
              persona.nombre
            )
          )
      )
      .map(
        persona => ({
          id:
            persona.id,

          name:
            persona.nombre,

          superiorId:
            persona.superior_id,
        })
      )

  return {
    coordinators: {
      names:
        Array.from(
          coordinatorNames
        ).sort(),

      existing:
        coordinatorsExisting,

      toCreate:
        coordinatorsToCreate,

      promotions,
    },

    supervisors: {
      existing:
        supervisorsExisting.sort(
          sortByName
        ),

      toCreate:
        supervisorsToCreate.sort(
          sortByName
        ),

      multipleCoordinatorConflicts:
        multipleCoordinatorConflicts
          .sort(
            sortByName
          ),

      vacantTerritories:
        vacantTerritories
          .sort(
            sortByName
          ),

      existingWithoutMatchedUnits:
        existingSupervisorsWithoutMatchedUnits
          .sort(
            sortByName
          ),
    },
  }
}

/*
 * ==========================================================
 * PERSONAS
 * ==========================================================
 */

function buildPersonaIndex(
  personas
) {
  const map =
    new Map()

  for (
    const persona
    of personas
  ) {
    const key =
      normalizeName(
        persona.nombre
      )

    if (!key) {
      continue
    }

    /*
     * Si alguna vez hubiera duplicados
     * por nombre, no sobrescribimos el primero.
     */
    if (
      !map.has(
        key
      )
    ) {
      map.set(
        key,
        persona
      )
    }
  }

  return map
}

/*
 * ==========================================================
 * ALIAS
 * ==========================================================
 */

function resolveSupervisorName(
  value
) {
  const normalized =
    normalizeName(
      value
    )

  if (!normalized) {
    return null
  }

  return (
    SUPERVISOR_ALIASES.get(
      normalized
    ) ||
    canonicalDisplayName(
      value
    )
  )
}

/*
 * ==========================================================
 * EXCLUSIONES
 * ==========================================================
 */

function getExclusion(
  row
) {
  const supervisor =
    normalizeName(
      row.supervisor
    )

  const unit =
    normalizeName(
      row.unidad
    )

  return (
    EXCLUDED_ASSIGNMENTS
      .find(
        item => {
          return (
            item.supervisor ===
              supervisor &&
            item.unit ===
              unit
          )
        }
      ) ||
    null
  )
}

/*
 * ==========================================================
 * DETECTAR FILAS DESPLAZADAS / SOSPECHOSAS
 * ==========================================================
 */

function isPotentiallyMalformedRow(
  row
) {
  if (!row) {
    return false
  }

  if (
    !row.clues ||
    !row.unidad
  ) {
    return true
  }

  const state =
    normalizeName(
      row.rawState
    )

  /*
   * Este catálogo corresponde a Jalisco.
   *
   * Si ESTADO contiene un horario u otro dato
   * desplazado, quedará marcado aquí.
   */
  if (
    state &&
    state !==
      'JALISCO'
  ) {
    return true
  }

  return false
}

/*
 * ==========================================================
 * DUPLICADOS
 * ==========================================================
 */

function findDuplicates(
  rows,
  keyGetter
) {
  const groups =
    new Map()

  for (
    const row
    of rows
  ) {
    const key =
      keyGetter(
        row
      )

    if (!key) {
      continue
    }

    if (
      !groups.has(
        key
      )
    ) {
      groups.set(
        key,
        []
      )
    }

    groups
      .get(
        key
      )
      .push(
        row
      )
  }

  return Array.from(
    groups.entries()
  )
    .filter(
      ([
        ,
        values,
      ]) =>
        values.length >
        1
    )
    .map(
      ([
        key,
        values,
      ]) => ({
        key,

        count:
          values.length,

        rows:
          values.map(
            row =>
              row.row
          ),
      })
    )
}

function serializeDuplicateMap(
  map
) {
  return Array.from(
    map.entries()
  ).map(
    ([
      key,
      values,
    ]) => ({
      key,

      count:
        values.length,

      ids:
        values.map(
          value =>
            Number(
              value.id
            )
        ),
    })
  )
}

/*
 * ==========================================================
 * SIMPLIFICAR PARA JSON
 * ==========================================================
 */

function simplifyMatch(
  item
) {
  return {
    matchMethod:
      item.matchMethod,

    database:
      simplifyDatabaseUnit(
        item.database
      ),

    official:
      simplifyOfficialRow(
        item.official
      ),
  }
}

function simplifyOfficialRow(
  row
) {
  return {
    row:
      row.row,

    idSistema:
      row.idSistema,

    clues:
      row.clues,

    unidad:
      row.unidad,

    region:
      row.region,

    supervisor:
      row.supervisor,

    catalogSupervisor:
      row.catalogSupervisor,

    coordinator:
      row.coordinator,

    rawState:
      row.rawState,
  }
}

function simplifyDatabaseUnit(
  row
) {
  return {
    id:
      Number(
        row.id
      ),

    clues:
      row.clues,

    unidad:
      row.unidad,

    region:
      row.region_sanitaria,

    estatus:
      row.estatus,

    estado:
      row.estado,

    proyecto:
      row.proyecto,

    latitud:
      row.latitud,

    longitud:
      row.longitud,
  }
}

/*
 * ==========================================================
 * NORMALIZACIONES
 * ==========================================================
 */

function buildNameRegionKey(
  name,
  region
) {
  const normalizedName =
    normalizeName(
      name
    )

  const normalizedRegion =
    normalizeName(
      region
    )

  if (
    !normalizedName ||
    !normalizedRegion
  ) {
    return null
  }

  return (
    `${normalizedName}` +
    `||` +
    `${normalizedRegion}`
  )
}

function normalizeHeader(
  value
) {
  return normalizeName(
    value
  )
    .replace(
      /[^A-Z0-9]+/g,
      ' '
    )
    .trim()
}

function normalizeClues(
  value
) {
  return String(
    value ??
    ''
  )
    .trim()
    .toUpperCase()
    .replace(
      /\s+/g,
      ''
    )
}

function normalizeSystemId(
  value
) {
  const text =
    String(
      value ??
      ''
    ).trim()

  if (!text) {
    return ''
  }

  const numeric =
    Number(
      text.replace(
        /,/g,
        ''
      )
    )

  if (
    Number.isInteger(
      numeric
    ) &&
    numeric >=
      0
  ) {
    return String(
      numeric
    )
  }

  return text
    .toUpperCase()
}

function cleanText(
  value
) {
  const result =
    String(
      value ??
      ''
    )
      .replace(
        /\s+/g,
        ' '
      )
      .trim()

  return (
    result ||
    null
  )
}

function normalizeName(
  value
) {
  return String(
    value ??
    ''
  )
    .normalize(
      'NFD'
    )
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .replace(
      /[^A-Z0-9Ñ]+/gi,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
    .toUpperCase()
}

function canonicalDisplayName(
  value
) {
  return String(
    value ??
    ''
  )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
    .toUpperCase()
}

function isEmptyRow(
  values
) {
  return !(
    values ||
    []
  ).some(
    value => {
      return (
        value !==
          null &&
        value !==
          undefined &&
        String(
          value
        ).trim() !==
          ''
      )
    }
  )
}

function isVacantName(
  value
) {
  return normalizeName(
    value
  ).startsWith(
    'VACANTE'
  )
}

function sortByName(
  a,
  b
) {
  return String(
    a.name ||
    ''
  ).localeCompare(
    String(
      b.name ||
      ''
    ),
    'es'
  )
}

/*
 * ==========================================================
 * CONSOLA
 * ==========================================================
 */

function printBanner() {
  console.log('')

  console.log(
    '============================================'
  )

  console.log(
    ' CONCILIACIÓN CATÁLOGO OFICIAL 2026'
  )

  console.log(
    ' MODO SOLO LECTURA - NO MODIFICA LA BD'
  )

  console.log(
    '============================================'
  )

  console.log('')
}

function printSummary(
  report
) {
  console.log(
    'RESUMEN'
  )

  console.log(
    '--------------------------------------------'
  )

  console.log(
    'BD Jalisco:',
    report
      .database
      .jaliscoUnits
  )

  console.log(
    'Filas catálogo leídas:',
    report
      .officialCatalog
      .rawDataRows
  )

  console.log(
    'Filas catálogo consideradas:',
    report
      .officialCatalog
      .consideredRows
  )

  console.log(
    'Filas excluidas:',
    report
      .officialCatalog
      .excludedRows
      .length
  )

  console.log('')

  console.log(
    'Coincidencias seguras:',
    report
      .reconciliation
      .matchedCount
  )

  console.log(
    '  por CLUES:',
    report
      .reconciliation
      .matchedByClues
  )

  console.log(
    '  por ID SISTEMA:',
    report
      .reconciliation
      .matchedBySystemId
  )

  console.log(
    'Catálogo fuera de nuestras 583:',
    report
      .reconciliation
      .officialNotInDatabase
      .length
  )

  console.log(
    'BD sin coincidencia en catálogo:',
    report
      .reconciliation
      .databaseNotInOfficial
      .length
  )

  console.log(
    'Conflictos de conciliación:',
    report
      .reconciliation
      .conflicts
      .length
  )

  console.log(
    'Candidatos por nombre + región:',
    report
      .reconciliation
      .nameRegionCandidates
      .length
  )

  console.log('')

  console.log(
    'Coordinadores oficiales utilizados:',
    report
      .people
      .coordinators
      .names
      .length
  )

  console.log(
    'Coordinadores por crear:',
    report
      .people
      .coordinators
      .toCreate
      .length
  )

  console.log(
    'Personas a promover a coordinador:',
    report
      .people
      .coordinators
      .promotions
      .length
  )

  console.log('')

  console.log(
    'Supervisores existentes con unidades conciliadas:',
    report
      .people
      .supervisors
      .existing
      .length
  )

  console.log(
    'Supervisores por crear:',
    report
      .people
      .supervisors
      .toCreate
      .length
  )

  console.log(
    'Conflictos supervisor/coordinador:',
    report
      .people
      .supervisors
      .multipleCoordinatorConflicts
      .length
  )

  console.log(
    'Territorios VACANTE:',
    report
      .people
      .supervisors
      .vacantTerritories
      .length
  )

  console.log('')

  /*
   * Registros excluidos.
   */
  if (
    report
      .officialCatalog
      .excludedRows
      .length
  ) {
    console.log(
      'REGISTROS EXCLUIDOS:'
    )

    for (
      const item
      of report
        .officialCatalog
        .excludedRows
    ) {
      console.log(
        `- fila ${item.row}: ` +
        `${item.unidad || 'SIN UNIDAD'} | ` +
        `${item.supervisor || 'SIN SUPERVISOR'} | ` +
        `${item.reason}`
      )
    }

    console.log('')
  }

  /*
   * Promoción de Rodolfo.
   */
  if (
    report
      .people
      .coordinators
      .promotions
      .length
  ) {
    console.log(
      'PROMOCIONES DETECTADAS:'
    )

    for (
      const item
      of report
        .people
        .coordinators
        .promotions
    ) {
      console.log(
        `- ${item.name}: ` +
        `${item.currentRole} -> ` +
        `${item.targetRole}`
      )
    }

    console.log('')
  }

  /*
   * Coordinadores nuevos.
   */
  if (
    report
      .people
      .coordinators
      .toCreate
      .length
  ) {
    console.log(
      'COORDINADORES NUEVOS:'
    )

    for (
      const item
      of report
        .people
        .coordinators
        .toCreate
    ) {
      console.log(
        `- ${item.name}`
      )
    }

    console.log('')
  }

  /*
   * Supervisores nuevos.
   */
  if (
    report
      .people
      .supervisors
      .toCreate
      .length
  ) {
    console.log(
      'SUPERVISORES NUEVOS:'
    )

    for (
      const item
      of report
        .people
        .supervisors
        .toCreate
    ) {
      console.log(
        `- ${item.name} ` +
        `(${item.unitsCount} unidades conciliadas)`
      )
    }

    console.log('')
  }

  /*
   * Supervisor bajo más de un coordinador.
   */
  if (
    report
      .people
      .supervisors
      .multipleCoordinatorConflicts
      .length
  ) {
    console.log(
      'CONFLICTOS DE COORDINACIÓN:'
    )

    for (
      const item
      of report
        .people
        .supervisors
        .multipleCoordinatorConflicts
    ) {
      console.log(
        `- ${item.name}: ` +
        `${item.coordinators.join(' / ')}`
      )
    }

    console.log('')
  }

  /*
   * Conflictos de unidades.
   */
  if (
    report
      .reconciliation
      .conflicts
      .length
  ) {
    console.log(
      'CONFLICTOS DE UNIDADES:'
    )

    for (
      const item
      of report
        .reconciliation
        .conflicts
        .slice(
          0,
          20
        )
    ) {
      console.log(
        `- ${item.type}: ` +
        `fila ${item.official?.row ?? '?'} | ` +
        `${item.official?.clues ?? 'SIN CLUES'} | ` +
        `${item.official?.unidad ?? 'SIN UNIDAD'}`
      )
    }

    if (
      report
        .reconciliation
        .conflicts
        .length >
      20
    ) {
      console.log(
        `... y ${
          report
            .reconciliation
            .conflicts
            .length -
          20
        } más en el JSON.`
      )
    }

    console.log('')
  }

  /*
   * Farmacia móvil.
   */
  if (
    report
      .mobilePharmacy
      .length
  ) {
    console.log(
      'FARMACIA MÓVIL:'
    )

    for (
      const item
      of report
        .mobilePharmacy
    ) {
      console.log(
        `- ${item.clues} | ` +
        `${item.unidad} | ` +
        `coords: ${
          item.latitud ??
          'NULL'
        }, ${
          item.longitud ??
          'NULL'
        } | ` +
        `fija: ${
          item.hasFixedCoordinates
            ? 'SÍ'
            : 'NO'
        }`
      )
    }
  }
}

/*
 * ==========================================================
 * EJECUCIÓN
 * ==========================================================
 */

main()
  .catch(
    error => {
      console.error('')

      console.error(
        '❌ Error de conciliación:'
      )

      console.error(
        error
      )

      process.exitCode =
        1
    }
  )
  .finally(
    async () => {
      try {
        await pool.end()
      } catch {}
    }
  )
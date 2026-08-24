import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

import { pool } from '../db/pool.js'

const require =
  createRequire(
    import.meta.url
  )

const XLSX =
  require('xlsx')

const __filename =
  fileURLToPath(
    import.meta.url
  )

const __dirname =
  path.dirname(
    __filename
  )

const catalogArgument =
  process.argv[2]

const DATA_DIR =
  path.resolve(
    __dirname,
    '../data'
  )

const CATALOG_PATH =
  resolveCatalogPath()

function resolveCatalogPath() {
  /*
   * 1. Si nosotros indicamos expresamente
   *    un archivo al ejecutar el script,
   *    ese tiene prioridad.
   */
  if (
    catalogArgument
  ) {
    const explicitPath =
      path.resolve(
        process.cwd(),
        catalogArgument
      )

    if (
      !fs.existsSync(
        explicitPath
      )
    ) {
      throw new Error(
        [
          'El archivo indicado no existe:',
          explicitPath,
        ].join('\n')
      )
    }

    return explicitPath
  }

  /*
   * 2. Intentar primero el nombre estándar.
   */
  const standardPath =
    path.resolve(
      DATA_DIR,
      'CATALOGO_OFICIAL_2026_REESTRUCTURA.xlsx'
    )

  if (
    fs.existsSync(
      standardPath
    )
  ) {
    return standardPath
  }

  /*
   * 3. Si no existe, buscar automáticamente
   *    archivos .xlsx compatibles dentro
   *    de backend/data.
   */
  if (
    !fs.existsSync(
      DATA_DIR
    )
  ) {
    throw new Error(
      `No existe la carpeta:\n${DATA_DIR}`
    )
  }

  const files =
    fs.readdirSync(
      DATA_DIR,
      {
        withFileTypes:
          true,
      }
    )

  const candidates =
    files
      .filter(
        item =>
          item.isFile()
      )
      .map(
        item =>
          item.name
      )
      .filter(
        name =>
          /\.xlsx$/i.test(
            name
          )
      )
      .filter(
        name => {
          const normalized =
            normalizeFileName(
              name
            )

          return (
            normalized.includes(
              'CATALOGO'
            ) &&
            normalized.includes(
              '2026'
            ) &&
            normalized.includes(
              'REESTRUCTURA'
            )
          )
        }
      )

  if (
    candidates.length ===
    1
  ) {
    const detectedPath =
      path.resolve(
        DATA_DIR,
        candidates[0]
      )

    console.log(
      `Excel detectado automáticamente: ${candidates[0]}`
    )

    return detectedPath
  }

  if (
    candidates.length >
    1
  ) {
    throw new Error(
      [
        'Encontré varios posibles catálogos 2026 en backend/data:',
        '',
        ...candidates.map(
          name =>
            `- ${name}`
        ),
        '',
        'Indica cuál usar, por ejemplo:',
        'node scripts\\previewJaliscoAssignments2026.mjs "data\\NOMBRE_DEL_ARCHIVO.xlsx"',
      ].join('\n')
    )
  }

  throw new Error(
    [
      'No encontré ningún catálogo 2026 compatible en:',
      DATA_DIR,
      '',
      'Archivos .xlsx encontrados:',
      ...files
        .filter(
          item =>
            item.isFile() &&
            /\.xlsx$/i.test(
              item.name
            )
        )
        .map(
          item =>
            `- ${item.name}`
        ),
    ].join('\n')
  )
}

function normalizeFileName(
  value
) {
  return String(
    value ||
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
      /[^A-Z0-9]+/gi,
      '_'
    )
    .replace(
      /_+/g,
      '_'
    )
    .toUpperCase()
}

const REPORT_DIR =
  path.resolve(
    __dirname,
    '../reports'
  )

const REPORT_PATH =
  path.resolve(
    REPORT_DIR,
    'jalisco-assignment-preview-2026.json'
  )

const PREFERRED_SHEET_NAME =
  '2026'

/*
 * ==========================================================
 * EXPECTATIVAS YA VALIDADAS
 * ==========================================================
 *
 * Si cualquiera cambia, el script NO escribe nada
 * y además marcará el resultado como no apto.
 */

const EXPECTED = {
  databaseUnits:
    583,

  officialRowsAfterClosedExclusion:
    638,

  operationalMatches:
    582,

  namedAssignments:
    560,

  vacantUnits:
    22,

  closedUnits:
    1,

  officialOutsideCurrentDatabase:
    56,
}

/*
 * ==========================================================
 * UNIDAD CERRADA
 * ==========================================================
 */

const CLOSED_DB_CLUES =
  new Set([
    normalizeClues(
      'JCSSA009160'
    ),
  ])

/*
 * ==========================================================
 * EQUIVALENCIAS DE CLUES CONFIRMADAS
 * ==========================================================
 *
 * Izquierda:
 * CLUES que conservamos actualmente en farmacia.
 *
 * Derecha:
 * CLUES que aparece en el catálogo 2026.
 *
 * Por ahora NO modificamos farmacia.clues.
 */

const DB_TO_OFFICIAL_CLUES =
  new Map([
    [
      normalizeClues(
        'JCSSA00611526'
      ),

      normalizeClues(
        'JCSSA01433426'
      ),
    ],
  ])

/*
 * ==========================================================
 * NORMALIZACIÓN DE SUPERVISORES
 * ==========================================================
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
 * CORRECCIÓN DE COORDINADOR CONFIRMADA
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
   * CARGAR CATÁLOGO
   * ========================================================
   */

  const catalog =
    loadOfficialCatalog()

  /*
   * ========================================================
   * LEER POSTGRESQL
   * ========================================================
   */

  const [
    unitsResult,
    peopleResult,
  ] =
    await Promise.all([
      pool.query(`
        SELECT
          id,
          clues,
          unidad,
          region_sanitaria,
          estado,
          proyecto,
          latitud::double precision
            AS latitud,
          longitud::double precision
            AS longitud

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
          p.id,
          p.nombre,
          p.area,
          p.rol,
          p.superior_id,
          p.activo,
          p.pharmacy_scope_mode,

          superior.nombre
            AS superior_nombre,

          superior.rol
            AS superior_rol,

          EXISTS (
            SELECT 1
            FROM public.person_state_scope pss
            WHERE pss.persona_id = p.id
              AND pss.revoked_at IS NULL
              AND UPPER(
                BTRIM(
                  pss.estado
                )
              ) = 'JALISCO'
          ) AS has_jalisco_scope

        FROM public.personas p

        LEFT JOIN public.personas superior
          ON superior.id =
             p.superior_id

        WHERE p.area =
            'FARMACIAS'

          AND p.activo =
            TRUE

        ORDER BY p.nombre
      `),
    ])

  const dbUnits =
    unitsResult.rows

  const people =
    peopleResult.rows

  /*
   * ========================================================
   * ÍNDICE DE FARMACIAS POR CLUES
   * ========================================================
   */

  const dbByClues =
    buildUniqueIndex(
      dbUnits,
      unit =>
        normalizeClues(
          unit.clues
        ),
      'CLUES duplicado en public.farmacia'
    )

  /*
   * ========================================================
   * ÍNDICE DEL CATÁLOGO POR CLUES
   * ========================================================
   */

  const officialByClues =
    buildUniqueIndex(
      catalog.rows,
      row =>
        normalizeClues(
          row.clues
        ),
      'CLUES duplicado en catálogo oficial'
    )

  /*
   * ========================================================
   * ÍNDICE DE PERSONAS
   * ========================================================
   */

  const personByName =
    buildUniqueIndex(
      people,
      person =>
        normalizeName(
          person.nombre
        ),
      'Persona activa duplicada por nombre'
    )

  /*
   * ========================================================
   * CONCILIAR 583 FARMACIAS
   * ========================================================
   */

  const exactMatches =
    []

  const aliasMatches =
    []

  const closedUnits =
    []

  const unmatchedDatabaseUnits =
    []

  const matchedOfficialClues =
    new Set()

  for (
    const dbUnit
    of dbUnits
  ) {
    const dbClues =
      normalizeClues(
        dbUnit.clues
      )

    /*
     * Unidad cerrada:
     * permanece en farmacia,
     * pero no participa en la operación nueva.
     */
    if (
      CLOSED_DB_CLUES.has(
        dbClues
      )
    ) {
      closedUnits.push({
        database:
          simplifyDbUnit(
            dbUnit
          ),

        reason:
          'UNIDAD_CERRADA',
      })

      continue
    }

    /*
     * 1. CLUES exacto.
     */
    const exactOfficial =
      officialByClues.get(
        dbClues
      )

    if (
      exactOfficial
    ) {
      exactMatches.push({
        database:
          dbUnit,

        official:
          exactOfficial,

        matchMethod:
          'CLUES',
      })

      matchedOfficialClues.add(
        normalizeClues(
          exactOfficial.clues
        )
      )

      continue
    }

    /*
     * 2. Equivalencia explícita.
     */
    const officialAliasClues =
      DB_TO_OFFICIAL_CLUES.get(
        dbClues
      )

    if (
      officialAliasClues
    ) {
      const aliasOfficial =
        officialByClues.get(
          officialAliasClues
        )

      if (
        !aliasOfficial
      ) {
        throw new Error(
          `La equivalencia ${dbClues} -> ${officialAliasClues} no existe en el catálogo.`
        )
      }

      /*
       * Protección adicional:
       * la unidad debe tener el mismo nombre
       * normalizado.
       */
      if (
        normalizeName(
          dbUnit.unidad
        ) !==
        normalizeName(
          aliasOfficial.unidad
        )
      ) {
        throw new Error(
          [
            'La equivalencia de CLUES no coincide por nombre:',
            `${dbClues} | ${dbUnit.unidad}`,
            `${officialAliasClues} | ${aliasOfficial.unidad}`,
          ].join('\n')
        )
      }

      aliasMatches.push({
        database:
          dbUnit,

        official:
          aliasOfficial,

        matchMethod:
          'CLUES_ALIAS',
      })

      matchedOfficialClues.add(
        officialAliasClues
      )

      continue
    }

    unmatchedDatabaseUnits.push(
      simplifyDbUnit(
        dbUnit
      )
    )
  }

  const operationalMatches = [
    ...exactMatches,
    ...aliasMatches,
  ]

  /*
   * ========================================================
   * FILAS DEL CATÁLOGO QUE NO FORMAN PARTE
   * DE NUESTRAS 583
   * ========================================================
   */

  const officialOutsideCurrentDatabase =
    catalog.rows
      .filter(
        row =>
          !matchedOfficialClues.has(
            normalizeClues(
              row.clues
            )
          )
      )
      .map(
        simplifyOfficialRow
      )

  /*
   * ========================================================
   * PREPARAR ASIGNACIONES
   * ========================================================
   */

  const assignmentCandidates =
    []

  const vacantUnits =
    []

  const hierarchyErrors =
    []

  const missingPeople =
    []

  for (
    const match
    of operationalMatches
  ) {
    const {
      database,
      official,
      matchMethod,
    } =
      match

    const supervisorName =
      resolveSupervisorName(
        official.supervisor
      )

    const coordinatorName =
      resolveCoordinatorName({
        supervisorName,
        catalogCoordinator:
          official.coordinator,
      })

    /*
     * Territorio sin titular.
     */
    if (
      isVacant(
        supervisorName
      )
    ) {
      vacantUnits.push({
        pharmacyId:
          Number(
            database.id
          ),

        clues:
          database.clues,

        unidad:
          database.unidad,

        region:
          database.region_sanitaria,

        coordinator:
          coordinatorName,

        matchMethod,
      })

      continue
    }

    const supervisor =
      personByName.get(
        normalizeName(
          supervisorName
        )
      )

    if (!supervisor) {
      missingPeople.push({
        type:
          'SUPERVISOR_NOT_FOUND',

        supervisor:
          supervisorName,

        coordinator:
          coordinatorName,

        pharmacyId:
          Number(
            database.id
          ),

        clues:
          database.clues,

        unidad:
          database.unidad,
      })

      continue
    }

    const coordinator =
      personByName.get(
        normalizeName(
          coordinatorName
        )
      )

    if (!coordinator) {
      missingPeople.push({
        type:
          'COORDINATOR_NOT_FOUND',

        supervisor:
          supervisorName,

        coordinator:
          coordinatorName,

        pharmacyId:
          Number(
            database.id
          ),

        clues:
          database.clues,

        unidad:
          database.unidad,
      })

      continue
    }

    /*
     * ======================================================
     * VALIDACIONES DE LA FASE A
     * ======================================================
     */

    if (
      supervisor.rol !==
      'SUPERVISOR'
    ) {
      hierarchyErrors.push({
        type:
          'PERSON_NOT_SUPERVISOR',

        person:
          supervisor.nombre,

        currentRole:
          supervisor.rol,

        pharmacyId:
          Number(
            database.id
          ),
      })

      continue
    }

    if (
      coordinator.rol !==
      'COORDINADOR'
    ) {
      hierarchyErrors.push({
        type:
          'PERSON_NOT_COORDINATOR',

        person:
          coordinator.nombre,

        currentRole:
          coordinator.rol,

        pharmacyId:
          Number(
            database.id
          ),
      })

      continue
    }

    if (
      String(
        supervisor.superior_id ||
        ''
      ) !==
      String(
        coordinator.id
      )
    ) {
      hierarchyErrors.push({
        type:
          'SUPERVISOR_COORDINATOR_MISMATCH',

        supervisor:
          supervisor.nombre,

        expectedCoordinator:
          coordinator.nombre,

        currentSuperior:
          supervisor.superior_nombre,

        pharmacyId:
          Number(
            database.id
          ),

        clues:
          database.clues,
      })

      continue
    }

    if (
      !supervisor.has_jalisco_scope
    ) {
      hierarchyErrors.push({
        type:
          'SUPERVISOR_WITHOUT_JALISCO_SCOPE',

        supervisor:
          supervisor.nombre,

        pharmacyId:
          Number(
            database.id
          ),
      })

      continue
    }

    if (
      !coordinator.has_jalisco_scope
    ) {
      hierarchyErrors.push({
        type:
          'COORDINATOR_WITHOUT_JALISCO_SCOPE',

        coordinator:
          coordinator.nombre,

        pharmacyId:
          Number(
            database.id
          ),
      })

      continue
    }

    assignmentCandidates.push({
      pharmacyId:
        Number(
          database.id
        ),

      clues:
        database.clues,

      unidad:
        database.unidad,

      region:
        database.region_sanitaria,

      latitud:
        database.latitud,

      longitud:
        database.longitud,

      supervisorId:
        supervisor.id,

      supervisor:
        supervisor.nombre,

      coordinatorId:
        coordinator.id,

      coordinator:
        coordinator.nombre,

      matchMethod,

      officialClues:
        official.clues,
    })
  }

  /*
   * ========================================================
   * RESÚMENES
   * ========================================================
   */

  const byCoordinator =
    summarizeByCoordinator(
      assignmentCandidates,
      vacantUnits
    )

  const bySupervisor =
    summarizeBySupervisor(
      assignmentCandidates
    )

  /*
   * ========================================================
   * VALIDACIONES ESTRICTAS
   * ========================================================
   */

  const checks = [
    createCheck(
      'BD Jalisco',
      dbUnits.length,
      EXPECTED.databaseUnits
    ),

    createCheck(
      'Filas oficiales consideradas',
      catalog.rows.length,
      EXPECTED.officialRowsAfterClosedExclusion
    ),

    createCheck(
      'Coincidencias exactas + alias',
      operationalMatches.length,
      EXPECTED.operationalMatches
    ),

    createCheck(
      'Asignaciones con supervisor',
      assignmentCandidates.length,
      EXPECTED.namedAssignments
    ),

    createCheck(
      'Unidades VACANTE',
      vacantUnits.length,
      EXPECTED.vacantUnits
    ),

    createCheck(
      'Unidades cerradas',
      closedUnits.length,
      EXPECTED.closedUnits
    ),

    createCheck(
      'Filas oficiales fuera de nuestras 583',
      officialOutsideCurrentDatabase.length,
      EXPECTED.officialOutsideCurrentDatabase
    ),

    createCheck(
      'Unidades BD no conciliadas',
      unmatchedDatabaseUnits.length,
      0
    ),

    createCheck(
      'Personas faltantes',
      missingPeople.length,
      0
    ),

    createCheck(
      'Errores de jerarquía',
      hierarchyErrors.length,
      0
    ),
  ]

  const readyForMigration =
    checks.every(
      check =>
        check.ok
    )

  const report = {
    generatedAt:
      new Date()
        .toISOString(),

    mode:
      'READ_ONLY',

    readyForMigration,

    catalog: {
      path:
        CATALOG_PATH,

      sheetName:
        catalog.sheetName,

      headerRow:
        catalog.headerRow,

      rawRows:
        catalog.rawRows,

      consideredRows:
        catalog.rows.length,

      excludedClosedCatalogRows:
        catalog.excludedClosedRows,
    },

    database: {
      jaliscoUnits:
        dbUnits.length,
    },

    reconciliation: {
      exactMatches:
        exactMatches.length,

      aliasMatches:
        aliasMatches.map(
          item => ({
            database:
              simplifyDbUnit(
                item.database
              ),

            official:
              simplifyOfficialRow(
                item.official
              ),

            matchMethod:
              item.matchMethod,
          })
        ),

      operationalMatches:
        operationalMatches.length,

      namedAssignments:
        assignmentCandidates.length,

      vacantUnits,

      closedUnits,

      unmatchedDatabaseUnits,

      officialOutsideCurrentDatabase,

      missingPeople,

      hierarchyErrors,
    },

    assignmentCandidates,

    summaries: {
      byCoordinator,
      bySupervisor,
    },

    checks,
  }

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
    `Reporte: ${REPORT_PATH}`
  )

  console.log('')

  if (
    !readyForMigration
  ) {
    process.exitCode =
      2
  }
}

/*
 * ==========================================================
 * EXCEL
 * ==========================================================
 */

function loadOfficialCatalog() {
  const workbook =
    XLSX.readFile(
      CATALOG_PATH,
      {
        raw:
          false,
      }
    )

  const sheetName =
    workbook.SheetNames.includes(
      PREFERRED_SHEET_NAME
    )
      ? PREFERRED_SHEET_NAME
      : workbook.SheetNames[0]

  if (!sheetName) {
    throw new Error(
      'El Excel no contiene hojas.'
    )
  }

  const sheet =
    workbook.Sheets[
      sheetName
    ]

  const matrix =
    XLSX.utils.sheet_to_json(
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

  const headerIndex =
    findHeaderIndex(
      matrix
    )

  if (
    headerIndex <
    0
  ) {
    throw new Error(
      'No pude detectar la fila de encabezados.'
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
      headerIndex + 1
    )

  const rows =
    []

  const excludedClosedRows =
    []

  let rawRows =
    0

  for (
    let index = 0;
    index <
    dataRows.length;
    index += 1
  ) {
    const values =
      dataRows[index]

    if (
      isEmptyRow(
        values
      )
    ) {
      continue
    }

    rawRows +=
      1

    const raw =
      rowArrayToObject(
        headers,
        values
      )

    const catalogSupervisor =
      cleanText(
        getValue(
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

    let coordinator =
      cleanText(
        getValue(
          raw,
          [
            'COORDINADOR',
          ]
        )
      )

    coordinator =
      resolveCoordinatorName({
        supervisorName:
          supervisor,

        catalogCoordinator:
          coordinator,
      })

    const row = {
      excelRow:
        headerIndex +
        index +
        2,

      clues:
        normalizeClues(
          getValue(
            raw,
            [
              'CLUES ACTUALIZADO',
              'CLUES',
            ]
          )
        ),

      unidad:
        cleanText(
          getValue(
            raw,
            [
              'UNIDAD',
            ]
          )
        ),

      region:
        cleanText(
          getValue(
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
    }

    /*
     * San Lucas Evangelista:
     * se conserva en BD para histórico,
     * pero no participa en asignaciones 2026.
     */
    if (
      row.clues ===
      normalizeClues(
        'JCSSA009160'
      )
    ) {
      excludedClosedRows.push({
        ...row,

        reason:
          'UNIDAD_CERRADA',
      })

      continue
    }

    if (
      !row.clues
    ) {
      throw new Error(
        `La fila ${row.excelRow} no tiene CLUES.`
      )
    }

    rows.push(
      row
    )
  }

  return {
    sheetName,

    headerRow:
      headerIndex +
      1,

    rawRows,

    rows,

    excludedClosedRows,
  }
}

function findHeaderIndex(
  matrix
) {
  const maxRows =
    Math.min(
      matrix.length,
      20
    )

  for (
    let i = 0;
    i < maxRows;
    i += 1
  ) {
    const values =
      new Set(
        (
          matrix[i] ||
          []
        )
          .map(
            normalizeHeader
          )
          .filter(
            Boolean
          )
      )

    const hasClues =
      values.has(
        'CLUES ACTUALIZADO'
      ) ||
      values.has(
        'CLUES'
      )

    const hasUnit =
      values.has(
        'UNIDAD'
      )

    const hasSupervisor =
      values.has(
        'SUPERVISOR'
      )

    const hasCoordinator =
      values.has(
        'COORDINADOR'
      )

    if (
      hasClues &&
      hasUnit &&
      hasSupervisor &&
      hasCoordinator
    ) {
      return i
    }
  }

  return -1
}

function rowArrayToObject(
  headers,
  values
) {
  const result =
    {}

  for (
    let i = 0;
    i <
    headers.length;
    i += 1
  ) {
    const header =
      headers[i]

    if (!header) {
      continue
    }

    result[
      header
    ] =
      values[i] ??
      null
  }

  return result
}

function getValue(
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
      row[key]

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
 * RESOLUCIÓN DE NOMBRES
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
    canonicalName(
      value
    )
  )
}

function resolveCoordinatorName({
  supervisorName,
  catalogCoordinator,
}) {
  const override =
    SUPERVISOR_COORDINATOR_OVERRIDES.get(
      normalizeName(
        supervisorName
      )
    )

  if (override) {
    return override
  }

  return catalogCoordinator
    ? canonicalName(
        catalogCoordinator
      )
    : null
}

/*
 * ==========================================================
 * RESÚMENES
 * ==========================================================
 */

function summarizeBySupervisor(
  assignments
) {
  const map =
    new Map()

  for (
    const item
    of assignments
  ) {
    const key =
      item.supervisorId

    if (
      !map.has(
        key
      )
    ) {
      map.set(
        key,
        {
          supervisorId:
            item.supervisorId,

          supervisor:
            item.supervisor,

          coordinatorId:
            item.coordinatorId,

          coordinator:
            item.coordinator,

          unitsCount:
            0,
        }
      )
    }

    map.get(
      key
    ).unitsCount +=
      1
  }

  return Array.from(
    map.values()
  ).sort(
    (
      a,
      b
    ) =>
      a.coordinator.localeCompare(
        b.coordinator,
        'es'
      ) ||
      a.supervisor.localeCompare(
        b.supervisor,
        'es'
      )
  )
}

function summarizeByCoordinator(
  assignments,
  vacantUnits
) {
  const map =
    new Map()

  for (
    const item
    of assignments
  ) {
    const key =
      item.coordinatorId

    if (
      !map.has(
        key
      )
    ) {
      map.set(
        key,
        {
          coordinatorId:
            item.coordinatorId,

          coordinator:
            item.coordinator,

          assignedUnits:
            0,

          vacantUnits:
            0,

          totalOperationalUnits:
            0,
        }
      )
    }

    const row =
      map.get(
        key
      )

    row.assignedUnits +=
      1

    row.totalOperationalUnits +=
      1
  }

  for (
    const vacant
    of vacantUnits
  ) {
    const coordinator =
      vacant.coordinator ||
      'SIN COORDINADOR'

    let row =
      Array.from(
        map.values()
      ).find(
        item =>
          normalizeName(
            item.coordinator
          ) ===
          normalizeName(
            coordinator
          )
      )

    if (!row) {
      const key =
        `VACANT:${normalizeName(
          coordinator
        )}`

      row = {
        coordinatorId:
          null,

        coordinator,

        assignedUnits:
          0,

        vacantUnits:
          0,

        totalOperationalUnits:
          0,
      }

      map.set(
        key,
        row
      )
    }

    row.vacantUnits +=
      1

    row.totalOperationalUnits +=
      1
  }

  return Array.from(
    map.values()
  ).sort(
    (
      a,
      b
    ) =>
      a.coordinator.localeCompare(
        b.coordinator,
        'es'
      )
  )
}

/*
 * ==========================================================
 * CHECKS
 * ==========================================================
 */

function createCheck(
  name,
  actual,
  expected
) {
  return {
    name,
    actual,
    expected,
    ok:
      actual ===
      expected,
  }
}

/*
 * ==========================================================
 * ÍNDICES
 * ==========================================================
 */

function buildUniqueIndex(
  items,
  keyGetter,
  errorLabel
) {
  const map =
    new Map()

  for (
    const item
    of items
  ) {
    const key =
      keyGetter(
        item
      )

    if (!key) {
      continue
    }

    if (
      map.has(
        key
      )
    ) {
      throw new Error(
        `${errorLabel}: ${key}`
      )
    }

    map.set(
      key,
      item
    )
  }

  return map
}

/*
 * ==========================================================
 * UTILIDADES
 * ==========================================================
 */

function isVacant(
  value
) {
  return normalizeName(
    value
  ).startsWith(
    'VACANTE'
  )
}

function simplifyDbUnit(
  unit
) {
  return {
    id:
      Number(
        unit.id
      ),

    clues:
      unit.clues,

    unidad:
      unit.unidad,

    region:
      unit.region_sanitaria,

    latitud:
      unit.latitud,

    longitud:
      unit.longitud,
  }
}

function simplifyOfficialRow(
  row
) {
  return {
    excelRow:
      row.excelRow,

    clues:
      row.clues,

    unidad:
      row.unidad,

    region:
      row.region,

    supervisor:
      row.supervisor,

    coordinator:
      row.coordinator,
  }
}

function cleanText(
  value
) {
  const text =
    String(
      value ??
      ''
    )
      .replace(
        /\s+/g,
        ' '
      )
      .trim()

  return text ||
    null
}

function canonicalName(
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
      /[^A-Z0-9]+/gi,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
    .toUpperCase()
}

function normalizeHeader(
  value
) {
  return normalizeName(
    value
  )
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

function isEmptyRow(
  values
) {
  return !(
    values ||
    []
  ).some(
    value =>
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

/*
 * ==========================================================
 * CONSOLA
 * ==========================================================
 */

function printBanner() {
  console.log('')

  console.log(
    '================================================'
  )

  console.log(
    ' PREVIEW ASIGNACIONES JALISCO 2026'
  )

  console.log(
    ' SOLO LECTURA - NO MODIFICA POSTGRESQL'
  )

  console.log(
    '================================================'
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
    '------------------------------------------------'
  )

  console.log(
    'BD Jalisco:',
    report.database
      .jaliscoUnits
  )

  console.log(
    'Catálogo leído:',
    report.catalog
      .rawRows
  )

  console.log(
    'Catálogo considerado:',
    report.catalog
      .consideredRows
  )

  console.log('')

  console.log(
    'CLUES exacto:',
    report.reconciliation
      .exactMatches
  )

  console.log(
    'Equivalencias CLUES:',
    report.reconciliation
      .aliasMatches
      .length
  )

  console.log(
    'Unidades operativas conciliadas:',
    report.reconciliation
      .operationalMatches
  )

  console.log(
    'Asignaciones con supervisor:',
    report.reconciliation
      .namedAssignments
  )

  console.log(
    'Unidades VACANTE:',
    report.reconciliation
      .vacantUnits
      .length
  )

  console.log(
    'Unidades cerradas:',
    report.reconciliation
      .closedUnits
      .length
  )

  console.log(
    'Catálogo fuera de nuestras 583:',
    report.reconciliation
      .officialOutsideCurrentDatabase
      .length
  )

  console.log(
    'BD operativa sin conciliar:',
    report.reconciliation
      .unmatchedDatabaseUnits
      .length
  )

  console.log(
    'Personas faltantes:',
    report.reconciliation
      .missingPeople
      .length
  )

  console.log(
    'Errores de jerarquía:',
    report.reconciliation
      .hierarchyErrors
      .length
  )

  console.log('')

  console.log(
    'POR COORDINADOR'
  )

  console.log(
    '------------------------------------------------'
  )

  for (
    const row
    of report.summaries
      .byCoordinator
  ) {
    console.log(
      `${row.coordinator}: ` +
      `${row.totalOperationalUnits} total | ` +
      `${row.assignedUnits} asignadas | ` +
      `${row.vacantUnits} vacantes`
    )
  }

  console.log('')

  console.log(
    'POR SUPERVISOR'
  )

  console.log(
    '------------------------------------------------'
  )

  for (
    const row
    of report.summaries
      .bySupervisor
  ) {
    console.log(
      `${row.supervisor}: ${row.unitsCount}`
    )
  }

  console.log('')

  console.log(
    'VALIDACIONES'
  )

  console.log(
    '------------------------------------------------'
  )

  for (
    const check
    of report.checks
  ) {
    console.log(
      `${
        check.ok
          ? '✅'
          : '❌'
      } ${check.name}: ` +
      `${check.actual} / ${check.expected}`
    )
  }

  console.log('')

  console.log(
    report.readyForMigration
      ? '✅ READY_FOR_MIGRATION = TRUE'
      : '❌ READY_FOR_MIGRATION = FALSE'
  )
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
        '❌ Error:'
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
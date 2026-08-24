import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { pool } from '../db/pool.js'

const __filename =
  fileURLToPath(
    import.meta.url
  )

const __dirname =
  path.dirname(
    __filename
  )

const REPORT_PATH =
  path.resolve(
    __dirname,
    '../reports/jalisco-assignment-preview-2026.json'
  )

const DAMARIS_ID =
  '5db17a9e-360e-4279-adf9-019c995f9a3b'

const CLOSED_PHARMACY_ID =
  51

const EXPECTED = {
  databaseUnits:
    583,

  operationalUnits:
    582,

  supervisorAssignments:
    560,

  vacantUnits:
    22,

  coordinatorAssignments:
    582,

  coordinators:
    5,

  previousEvents:
    584,

  coordinatorEvents:
    582,

  finalEvents:
    1166,
}

const EXPECTED_BY_COORDINATOR =
  new Map([
    [
      'CALDERON MALDONADO MIRELLA',
      68,
    ],

    [
      'CARO OJEDA NESTOR EDUARDO',
      158,
    ],

    [
      'PEREZ TORRES CHRISTIAN ADOLFO',
      135,
    ],

    [
      'PONCE NIEVES RUTH',
      148,
    ],

    [
      'QUEZADA MARTINEZ RODOLFO',
      73,
    ],
  ])

const ASSIGNMENT_COMMENT =
  'Carga inicial de territorio Farmacia → Coordinador Jalisco 2026'

const EVENT_COMMENT =
  'Asignación territorial inicial derivada del catálogo oficial Jalisco 2026 conciliado'

async function main() {
  printBanner()

  /*
   * ========================================================
   * 1. CARGAR REPORTE CONCILIADO
   * ========================================================
   */

  if (
    !fs.existsSync(
      REPORT_PATH
    )
  ) {
    throw new Error(
      `No encontré el reporte:\n${REPORT_PATH}`
    )
  }

  const report =
    JSON.parse(
      fs.readFileSync(
        REPORT_PATH,
        'utf8'
      )
    )

  validateReport(
    report
  )

  /*
   * ========================================================
   * 2. CONEXIÓN
   * ========================================================
   */

  const client =
    await pool.connect()

  try {
    await client.query(
      'BEGIN'
    )

    /*
     * ======================================================
     * 3. VALIDAR ESTADO PREVIO
     * ======================================================
     */

    const currentResult =
      await client.query(`
        SELECT
          COUNT(*)::integer
            AS total,

          COUNT(*) FILTER (
            WHERE revoked_at IS NULL
          )::integer
            AS active

        FROM public.pharmacy_coordinator_assignment
      `)

    requireEqual(
      'Territorios históricos previos',
      currentResult.rows[0].total,
      0
    )

    requireEqual(
      'Territorios activos previos',
      currentResult.rows[0].active,
      0
    )


    const eventsResult =
      await client.query(`
        SELECT
          COUNT(*)::integer
            AS total,

          COUNT(*) FILTER (
            WHERE event_type =
              'PHARMACY_COORDINATOR_ASSIGNED'
          )::integer
            AS coordinator_events

        FROM public.pharmacy_assignment_event
      `)

    requireEqual(
      'Eventos previos',
      eventsResult.rows[0].total,
      EXPECTED.previousEvents
    )

    requireEqual(
      'Eventos territoriales previos',
      eventsResult.rows[0].coordinator_events,
      0
    )


    /*
     * ======================================================
     * 4. VALIDAR SAN LUCAS
     * ======================================================
     */

    const closedResult =
      await client.query(
        `
          SELECT
            id,
            clues,
            unidad,
            estatus

          FROM public.farmacia

          WHERE id =
            $1::bigint
        `,
        [
          CLOSED_PHARMACY_ID,
        ]
      )

    if (
      closedResult.rowCount !==
      1
    ) {
      throw new Error(
        'No se encontró San Lucas.'
      )
    }

    if (
      closedResult.rows[0]
        .estatus !==
      'INACTIVA'
    ) {
      throw new Error(
        'San Lucas no está marcada INACTIVA.'
      )
    }


    /*
     * ======================================================
     * 5. CARGAR COORDINADORES ACTUALES
     * ======================================================
     */

    const coordinatorsResult =
      await client.query(
        `
          SELECT
            id,
            nombre,
            rol,
            area,
            activo,
            superior_id

          FROM public.personas

          WHERE superior_id =
                $1::uuid

            AND area =
                'FARMACIAS'

            AND rol =
                'COORDINADOR'

            AND activo =
                TRUE
        `,
        [
          DAMARIS_ID,
        ]
      )

    requireEqual(
      'Coordinadores actuales',
      coordinatorsResult.rowCount,
      EXPECTED.coordinators
    )

    const coordinatorByName =
      new Map()

    for (
      const coordinator
      of coordinatorsResult.rows
    ) {
      coordinatorByName.set(
        normalizeName(
          coordinator.nombre
        ),
        coordinator
      )
    }


    /*
     * ======================================================
     * 6. CONSTRUIR LOS 582 TERRITORIOS
     * ======================================================
     */

    const territoryMap =
      new Map()

    /*
     * 560 unidades con supervisor.
     */
    for (
      const item
      of report.assignmentCandidates
    ) {
      addTerritory(
        territoryMap,
        {
          pharmacyId:
            Number(
              item.pharmacyId
            ),

          clues:
            item.clues,

          unidad:
            item.unidad,

          coordinatorId:
            item.coordinatorId,

          coordinator:
            item.coordinator,

          source:
            'NAMED_SUPERVISOR',

          supervisorId:
            item.supervisorId,

          supervisor:
            item.supervisor,
        }
      )
    }

    /*
     * 22 unidades VACANTE.
     */
    for (
      const item
      of report.reconciliation
        .vacantUnits
    ) {
      const coordinator =
        coordinatorByName.get(
          normalizeName(
            item.coordinator
          )
        )

      if (
        !coordinator
      ) {
        throw new Error(
          `No encontré al coordinador de VACANTE: ${item.coordinator}`
        )
      }

      addTerritory(
        territoryMap,
        {
          pharmacyId:
            Number(
              item.pharmacyId
            ),

          clues:
            item.clues,

          unidad:
            item.unidad,

          coordinatorId:
            coordinator.id,

          coordinator:
            coordinator.nombre,

          source:
            'VACANT_SUPERVISOR',

          supervisorId:
            null,

          supervisor:
            null,
        }
      )
    }

    const territories =
      Array.from(
        territoryMap.values()
      )

    requireEqual(
      'Territorios preparados',
      territories.length,
      EXPECTED.coordinatorAssignments
    )


    /*
     * San Lucas jamás debe formar parte.
     */
    if (
      territoryMap.has(
        CLOSED_PHARMACY_ID
      )
    ) {
      throw new Error(
        'San Lucas apareció dentro de los territorios operativos.'
      )
    }


    /*
     * ======================================================
     * 7. TABLA TEMPORAL
     * ======================================================
     */

    await client.query(`
      CREATE TEMP TABLE
        tmp_jalisco_coordinator_assignment_2026
      (
        pharmacy_id bigint
          PRIMARY KEY,

        clues text
          NOT NULL,

        unidad text,

        coordinator_id uuid
          NOT NULL,

        coordinator text
          NOT NULL,

        source text
          NOT NULL,

        supervisor_id uuid,

        supervisor text
      )
      ON COMMIT DROP
    `)


    await client.query(
      `
        INSERT INTO
          tmp_jalisco_coordinator_assignment_2026
        (
          pharmacy_id,
          clues,
          unidad,
          coordinator_id,
          coordinator,
          source,
          supervisor_id,
          supervisor
        )

        SELECT
          x."pharmacyId",
          x.clues,
          x.unidad,
          x."coordinatorId",
          x.coordinator,
          x.source,
          x."supervisorId",
          x.supervisor

        FROM jsonb_to_recordset(
          $1::jsonb
        ) AS x
        (
          "pharmacyId" bigint,
          clues text,
          unidad text,
          "coordinatorId" uuid,
          coordinator text,
          source text,
          "supervisorId" uuid,
          supervisor text
        )
      `,
      [
        JSON.stringify(
          territories
        ),
      ]
    )


    /*
     * ======================================================
     * 8. VALIDAR TEMPORAL
     * ======================================================
     */

    const tmpResult =
      await client.query(`
        SELECT
          COUNT(*)::integer
            AS total,

          COUNT(
            DISTINCT pharmacy_id
          )::integer
            AS pharmacies,

          COUNT(
            DISTINCT coordinator_id
          )::integer
            AS coordinators,

          COUNT(*) FILTER (
            WHERE source =
              'NAMED_SUPERVISOR'
          )::integer
            AS with_supervisor,

          COUNT(*) FILTER (
            WHERE source =
              'VACANT_SUPERVISOR'
          )::integer
            AS vacant

        FROM tmp_jalisco_coordinator_assignment_2026
      `)

    requireEqual(
      'Filas temporales',
      tmpResult.rows[0].total,
      EXPECTED.coordinatorAssignments
    )

    requireEqual(
      'Farmacias únicas',
      tmpResult.rows[0].pharmacies,
      EXPECTED.coordinatorAssignments
    )

    requireEqual(
      'Coordinadores únicos',
      tmpResult.rows[0].coordinators,
      EXPECTED.coordinators
    )

    requireEqual(
      'Con supervisor',
      tmpResult.rows[0].with_supervisor,
      EXPECTED.supervisorAssignments
    )

    requireEqual(
      'VACANTE',
      tmpResult.rows[0].vacant,
      EXPECTED.vacantUnits
    )


    /*
     * ======================================================
     * 9. VALIDAR FARMACIAS
     * ======================================================
     */

    const pharmacyErrors =
      await client.query(`
        SELECT
          x.pharmacy_id,
          x.clues AS expected_clues,
          x.unidad AS expected_unit,

          f.clues AS database_clues,
          f.unidad AS database_unit,
          f.estado,
          f.estatus

        FROM tmp_jalisco_coordinator_assignment_2026 x

        LEFT JOIN public.farmacia f
          ON f.id =
             x.pharmacy_id

        WHERE
          f.id IS NULL

          OR UPPER(
            BTRIM(
              COALESCE(
                f.estado,
                ''
              )
            )
          ) <> 'JALISCO'

          OR UPPER(
            BTRIM(
              COALESCE(
                f.clues,
                ''
              )
            )
          ) <>
          UPPER(
            BTRIM(
              x.clues
            )
          )

          OR f.id =
             ${CLOSED_PHARMACY_ID}
      `)

    if (
      pharmacyErrors.rowCount >
      0
    ) {
      throw new Error(
        [
          'Hay errores en las farmacias territoriales.',
          JSON.stringify(
            pharmacyErrors.rows,
            null,
            2
          ),
        ].join('\n')
      )
    }


    /*
     * ======================================================
     * 10. VALIDAR COORDINADORES
     * ======================================================
     */

    const coordinatorErrors =
      await client.query(
        `
          SELECT DISTINCT
            x.coordinator_id,
            x.coordinator,

            p.nombre,
            p.area,
            p.rol,
            p.activo,
            p.superior_id

          FROM tmp_jalisco_coordinator_assignment_2026 x

          LEFT JOIN public.personas p
            ON p.id =
               x.coordinator_id

          WHERE
            p.id IS NULL

            OR p.area <>
               'FARMACIAS'

            OR p.rol <>
               'COORDINADOR'

            OR p.activo <>
               TRUE

            OR p.superior_id IS DISTINCT FROM
               $1::uuid
        `,
        [
          DAMARIS_ID,
        ]
      )

    if (
      coordinatorErrors.rowCount >
      0
    ) {
      throw new Error(
        [
          'Hay coordinadores inválidos.',
          JSON.stringify(
            coordinatorErrors.rows,
            null,
            2
          ),
        ].join('\n')
      )
    }


    /*
     * ======================================================
     * 11. VALIDAR QUE LAS 560 ASIGNACIONES DE SUPERVISOR
     *     COINCIDAN CON EL TERRITORIO DEL COORDINADOR
     * ======================================================
     */

    const hierarchyErrors =
      await client.query(`
        SELECT
          x.pharmacy_id,
          x.coordinator,
          x.supervisor,

          psa.supervisor_id
            AS current_supervisor_id,

          supervisor.nombre
            AS current_supervisor,

          supervisor.superior_id
            AS current_coordinator_id,

          coordinator.nombre
            AS current_coordinator

        FROM tmp_jalisco_coordinator_assignment_2026 x

        INNER JOIN public.pharmacy_supervisor_assignment psa
          ON psa.pharmacy_id =
             x.pharmacy_id

         AND psa.revoked_at
             IS NULL

        INNER JOIN public.personas supervisor
          ON supervisor.id =
             psa.supervisor_id

        LEFT JOIN public.personas coordinator
          ON coordinator.id =
             supervisor.superior_id

        WHERE
          x.source =
            'NAMED_SUPERVISOR'

          AND (
            psa.supervisor_id IS DISTINCT FROM
                x.supervisor_id

            OR supervisor.superior_id IS DISTINCT FROM
                x.coordinator_id
          )
      `)

    if (
      hierarchyErrors.rowCount >
      0
    ) {
      throw new Error(
        [
          'Asignación Supervisor → Coordinador inconsistente.',
          JSON.stringify(
            hierarchyErrors.rows,
            null,
            2
          ),
        ].join('\n')
      )
    }


    /*
     * ======================================================
     * 12. VALIDAR LAS 22 VACANTES
     * ======================================================
     */

    const vacantWithSupervisor =
      await client.query(`
        SELECT
          x.pharmacy_id,
          x.unidad,
          psa.supervisor_id

        FROM tmp_jalisco_coordinator_assignment_2026 x

        INNER JOIN public.pharmacy_supervisor_assignment psa
          ON psa.pharmacy_id =
             x.pharmacy_id

         AND psa.revoked_at
             IS NULL

        WHERE x.source =
              'VACANT_SUPERVISOR'
      `)

    requireEqual(
      'VACANTE con supervisor activo',
      vacantWithSupervisor.rowCount,
      0
    )


    /*
     * ======================================================
     * 13. RESPALDO DE TABLA NUEVA PRE-CARGA
     * ======================================================
     */

    await client.query(`
      CREATE TABLE IF NOT EXISTS
        public._backup_pharmacy_coordinator_assignment_preload_2026
      AS
      SELECT *
      FROM public.pharmacy_coordinator_assignment
      WITH DATA
    `)


    /*
     * ======================================================
     * 14. INSERTAR LAS 582 ASIGNACIONES TERRITORIALES
     * ======================================================
     */

    const insertResult =
      await client.query(
        `
          INSERT INTO
            public.pharmacy_coordinator_assignment
          (
            pharmacy_id,
            coordinator_id,
            assigned_by,
            assignment_comment
          )

          SELECT
            x.pharmacy_id,
            x.coordinator_id,
            $1::uuid,
            $2::text

          FROM tmp_jalisco_coordinator_assignment_2026 x

          ORDER BY
            x.pharmacy_id

          RETURNING
            id,
            pharmacy_id,
            coordinator_id,
            assigned_by,
            assigned_at
        `,
        [
          DAMARIS_ID,
          ASSIGNMENT_COMMENT,
        ]
      )

    requireEqual(
      'Territorios insertados',
      insertResult.rowCount,
      EXPECTED.coordinatorAssignments
    )


    /*
     * ======================================================
     * 15. AUDITORÍA
     * ======================================================
     */

    const auditResult =
      await client.query(
        `
          INSERT INTO
            public.pharmacy_assignment_event
          (
            assignment_id,
            coordinator_assignment_id,

            pharmacy_id,

            supervisor_id,
            coordinator_id,

            event_type,
            actor_id,
            comment,

            before_data,
            after_data,
            metadata
          )

          SELECT
            NULL::uuid,

            pca.id,

            pca.pharmacy_id,

            x.supervisor_id,

            pca.coordinator_id,

            'PHARMACY_COORDINATOR_ASSIGNED',

            $1::uuid,

            $2::text,

            NULL::jsonb,

            jsonb_build_object(
              'coordinatorAssignmentId',
                pca.id,

              'pharmacyId',
                pca.pharmacy_id,

              'coordinatorId',
                pca.coordinator_id,

              'assignedBy',
                pca.assigned_by,

              'assignedAt',
                pca.assigned_at,

              'revokedAt',
                pca.revoked_at
            ),

            jsonb_build_object(
              'source',
                'JALISCO_OFFICIAL_CATALOG_2026',

              'migration',
                'INITIAL_COORDINATOR_TERRITORY',

              'state',
                'Jalisco',

              'databaseClues',
                x.clues,

              'coordinatorName',
                x.coordinator,

              'territorySource',
                x.source,

              'supervisorId',
                x.supervisor_id,

              'supervisorName',
                x.supervisor
            )

          FROM public.pharmacy_coordinator_assignment pca

          INNER JOIN
            tmp_jalisco_coordinator_assignment_2026 x
            ON x.pharmacy_id =
               pca.pharmacy_id

           AND x.coordinator_id =
               pca.coordinator_id

          WHERE pca.revoked_at
                IS NULL

          RETURNING id
        `,
        [
          DAMARIS_ID,
          EVENT_COMMENT,
        ]
      )

    requireEqual(
      'Eventos territoriales insertados',
      auditResult.rowCount,
      EXPECTED.coordinatorEvents
    )


    /*
     * ======================================================
     * 16. VALIDACIÓN FINAL GLOBAL
     * ======================================================
     */

    const finalResult =
      await client.query(`
        SELECT
          COUNT(*)::integer
            AS total,

          COUNT(*) FILTER (
            WHERE revoked_at IS NULL
          )::integer
            AS active,

          COUNT(
            DISTINCT pharmacy_id
          ) FILTER (
            WHERE revoked_at IS NULL
          )::integer
            AS pharmacies,

          COUNT(
            DISTINCT coordinator_id
          ) FILTER (
            WHERE revoked_at IS NULL
          )::integer
            AS coordinators

        FROM public.pharmacy_coordinator_assignment
      `)

    requireEqual(
      'Territorios históricos finales',
      finalResult.rows[0].total,
      EXPECTED.coordinatorAssignments
    )

    requireEqual(
      'Territorios activos',
      finalResult.rows[0].active,
      EXPECTED.coordinatorAssignments
    )

    requireEqual(
      'Farmacias con territorio',
      finalResult.rows[0].pharmacies,
      EXPECTED.coordinatorAssignments
    )

    requireEqual(
      'Coordinadores con territorio',
      finalResult.rows[0].coordinators,
      EXPECTED.coordinators
    )


    /*
     * ======================================================
     * 17. VALIDAR CONTEOS POR COORDINADOR
     * ======================================================
     */

    const byCoordinatorResult =
      await client.query(`
        SELECT
          p.nombre AS coordinator,
          COUNT(*)::integer AS units

        FROM public.pharmacy_coordinator_assignment pca

        INNER JOIN public.personas p
          ON p.id =
             pca.coordinator_id

        WHERE pca.revoked_at IS NULL

        GROUP BY
          p.id,
          p.nombre

        ORDER BY
          p.nombre
      `)

    for (
      const row
      of byCoordinatorResult.rows
    ) {
      const expected =
        EXPECTED_BY_COORDINATOR.get(
          normalizeName(
            row.coordinator
          )
        )

      if (
        expected ===
        undefined
      ) {
        throw new Error(
          `Coordinador inesperado: ${row.coordinator}`
        )
      }

      requireEqual(
        `Territorio ${row.coordinator}`,
        row.units,
        expected
      )
    }

    requireEqual(
      'Coordinadores validados',
      byCoordinatorResult.rowCount,
      EXPECTED.coordinators
    )


    /*
     * ======================================================
     * 18. VALIDAR 560 + 22
     * ======================================================
     */

    const operationalResult =
      await client.query(`
        SELECT
          COUNT(*) FILTER (
            WHERE psa.id IS NOT NULL
          )::integer
            AS with_supervisor,

          COUNT(*) FILTER (
            WHERE psa.id IS NULL
          )::integer
            AS without_supervisor

        FROM public.pharmacy_coordinator_assignment pca

        LEFT JOIN public.pharmacy_supervisor_assignment psa
          ON psa.pharmacy_id =
             pca.pharmacy_id

         AND psa.revoked_at
             IS NULL

        WHERE pca.revoked_at
              IS NULL
      `)

    requireEqual(
      'Territorios con supervisor',
      operationalResult.rows[0].with_supervisor,
      EXPECTED.supervisorAssignments
    )

    requireEqual(
      'Territorios sin supervisor',
      operationalResult.rows[0].without_supervisor,
      EXPECTED.vacantUnits
    )


    /*
     * ======================================================
     * 19. SAN LUCAS DEBE QUEDAR FUERA
     * ======================================================
     */

    const sanLucasAssignments =
      await client.query(
        `
          SELECT
            (
              SELECT COUNT(*)
              FROM public.pharmacy_coordinator_assignment
              WHERE pharmacy_id =
                    $1::bigint
                AND revoked_at IS NULL
            )::integer
              AS coordinator_assignments,

            (
              SELECT COUNT(*)
              FROM public.pharmacy_supervisor_assignment
              WHERE pharmacy_id =
                    $1::bigint
                AND revoked_at IS NULL
            )::integer
              AS supervisor_assignments,

            (
              SELECT COUNT(*)
              FROM public.farmacia
              WHERE id =
                    $1::bigint
                AND estatus =
                    'INACTIVA'::farmacia_estatus
            )::integer
              AS inactive
        `,
        [
          CLOSED_PHARMACY_ID,
        ]
      )

    requireEqual(
      'San Lucas coordinador activo',
      sanLucasAssignments.rows[0]
        .coordinator_assignments,
      0
    )

    requireEqual(
      'San Lucas supervisor activo',
      sanLucasAssignments.rows[0]
        .supervisor_assignments,
      0
    )

    requireEqual(
      'San Lucas INACTIVA',
      sanLucasAssignments.rows[0]
        .inactive,
      1
    )


    /*
     * ======================================================
     * 20. EVENTOS FINALES
     * ======================================================
     */

    const finalEvents =
      await client.query(`
        SELECT
          COUNT(*)::integer
            AS total,

          COUNT(*) FILTER (
            WHERE event_type =
              'PHARMACY_COORDINATOR_ASSIGNED'
          )::integer
            AS coordinator_assigned

        FROM public.pharmacy_assignment_event
      `)

    requireEqual(
      'Eventos finales',
      finalEvents.rows[0].total,
      EXPECTED.finalEvents
    )

    requireEqual(
      'Eventos PHARMACY_COORDINATOR_ASSIGNED',
      finalEvents.rows[0].coordinator_assigned,
      EXPECTED.coordinatorEvents
    )


    /*
     * ======================================================
     * 21. COMMIT
     * ======================================================
     */

    await client.query(
      'COMMIT'
    )

    console.log('')
    console.log(
      '================================================'
    )

    console.log(
      ' ✅ C2B COMPLETADA'
    )

    console.log(
      '================================================'
    )

    console.log('')
    console.log(
      '583 registradas'
    )

    console.log(
      '582 con territorio activo'
    )

    console.log(
      '560 con supervisor'
    )

    console.log(
      '22 sin supervisor'
    )

    console.log(
      '1 INACTIVA'
    )

    console.log(
      '5 coordinadores'
    )

    console.log(
      '1166 eventos acumulados'
    )

    console.log('')
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK'
      )
    } catch {}

    console.error('')
    console.error(
      '❌ C2B CANCELADA'
    )
    console.error('')

    throw error
  } finally {
    client.release()
  }
}


function addTerritory(
  map,
  item
) {
  if (
    !Number.isFinite(
      item.pharmacyId
    )
  ) {
    throw new Error(
      'Territorio con pharmacyId inválido.'
    )
  }

  if (
    map.has(
      item.pharmacyId
    )
  ) {
    throw new Error(
      `Farmacia duplicada en territorio: ${item.pharmacyId}`
    )
  }

  if (
    !item.coordinatorId
  ) {
    throw new Error(
      `Farmacia ${item.pharmacyId} sin coordinatorId.`
    )
  }

  map.set(
    item.pharmacyId,
    item
  )
}


function validateReport(
  report
) {
  if (
    report?.readyForMigration !==
    true
  ) {
    throw new Error(
      'El preview no tiene READY_FOR_MIGRATION = TRUE.'
    )
  }

  requireEqual(
    'Preview BD Jalisco',
    report.database?.jaliscoUnits,
    EXPECTED.databaseUnits
  )

  requireEqual(
    'Preview operativas',
    report.reconciliation
      ?.operationalMatches,
    EXPECTED.operationalUnits
  )

  requireEqual(
    'Preview con supervisor',
    report.assignmentCandidates
      ?.length,
    EXPECTED.supervisorAssignments
  )

  requireEqual(
    'Preview VACANTE',
    report.reconciliation
      ?.vacantUnits
      ?.length,
    EXPECTED.vacantUnits
  )

  requireEqual(
    'Preview cerradas',
    report.reconciliation
      ?.closedUnits
      ?.length,
    1
  )
}


function normalizeName(
  value
) {
  return String(
    value || ''
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


function requireEqual(
  label,
  actual,
  expected
) {
  if (
    actual !==
    expected
  ) {
    throw new Error(
      `${label}: esperado ${expected}, obtenido ${actual}`
    )
  }

  console.log(
    `✅ ${label}: ${actual}`
  )
}


function printBanner() {
  console.log('')
  console.log(
    '================================================'
  )
  console.log(
    ' C2B - TERRITORIOS JALISCO 2026'
  )
  console.log(
    ' 582 FARMACIA → COORDINADOR'
  )
  console.log(
    '================================================'
  )
  console.log('')
}


main()
  .catch(
    error => {
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
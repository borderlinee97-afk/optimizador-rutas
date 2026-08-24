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

const EXPECTED = {
  databaseUnits:
    583,

  operationalUnits:
    582,

  assignments:
    560,

  vacantUnits:
    22,

  closedUnits:
    1,

  supervisors:
    24,

  coordinators:
    5,
}

const ASSIGNMENT_COMMENT =
  'Carga inicial estructura oficial Jalisco 2026 - catálogo conciliado'

const EVENT_COMMENT =
  'Asignación inicial Supervisor → Farmacia derivada del catálogo oficial 2026 conciliado contra las 583 unidades existentes'

async function main() {
  printBanner()

  /*
   * ========================================================
   * 1. CARGAR PREVIEW VALIDADO
   * ========================================================
   */

  if (
    !fs.existsSync(
      REPORT_PATH
    )
  ) {
    throw new Error(
      [
        'No encontré el reporte de preview:',
        REPORT_PATH,
        '',
        'Ejecuta primero:',
        'node scripts\\previewJaliscoAssignments2026.mjs',
      ].join('\n')
    )
  }

  const report =
    JSON.parse(
      fs.readFileSync(
        REPORT_PATH,
        'utf8'
      )
    )

  validatePreviewReport(
    report
  )

  const assignments =
    report.assignmentCandidates

  const vacantUnits =
    report.reconciliation
      .vacantUnits

  const closedUnits =
    report.reconciliation
      .closedUnits

  console.log(
    `Reporte: ${REPORT_PATH}`
  )

  console.log(
    `Asignaciones preparadas: ${assignments.length}`
  )

  console.log(
    `VACANTE: ${vacantUnits.length}`
  )

  console.log(
    `Cerradas: ${closedUnits.length}`
  )

  console.log('')

  /*
   * ========================================================
   * 2. CONEXIÓN / TRANSACCIÓN
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
     * 3. VALIDAR DAMARIS
     * ======================================================
     */

    const damarisResult =
      await client.query(
        `
          SELECT
            id,
            nombre,
            area,
            rol,
            activo

          FROM public.personas

          WHERE id = $1::uuid
        `,
        [
          DAMARIS_ID,
        ]
      )

    if (
      damarisResult.rowCount !==
      1
    ) {
      throw new Error(
        'No se encontró a Damaris por UUID.'
      )
    }

    const damaris =
      damarisResult.rows[0]

    if (
      damaris.area !==
        'FARMACIAS' ||
      damaris.rol !==
        'GERENTE' ||
      damaris.activo !==
        true
    ) {
      throw new Error(
        [
          'El actor de migración no es el GERENTE esperado.',
          JSON.stringify(
            damaris,
            null,
            2
          ),
        ].join('\n')
      )
    }

    /*
     * ======================================================
     * 4. VALIDAR ESTADO ACTUAL DE LAS TABLAS
     * ======================================================
     */

    const currentAssignmentsResult =
      await client.query(`
        SELECT
          COUNT(*)::integer
            AS total,

          COUNT(*) FILTER (
            WHERE revoked_at IS NULL
          )::integer
            AS active

        FROM public.pharmacy_supervisor_assignment
      `)

    const currentAssignments =
      currentAssignmentsResult
        .rows[0]

    if (
      currentAssignments.total !==
        0 ||
      currentAssignments.active !==
        0
    ) {
      throw new Error(
        [
          'pharmacy_supervisor_assignment ya contiene información.',
          `Histórico: ${currentAssignments.total}`,
          `Activas: ${currentAssignments.active}`,
          '',
          'La carga inicial fue cancelada para no duplicar ni sobrescribir información.',
        ].join('\n')
      )
    }

    const currentEventsResult =
      await client.query(`
        SELECT
          COUNT(*)::integer
            AS total
        FROM public.pharmacy_assignment_event
      `)

    if (
      currentEventsResult
        .rows[0]
        .total !==
      0
    ) {
      throw new Error(
        [
          'pharmacy_assignment_event ya contiene información.',
          `Eventos: ${currentEventsResult.rows[0].total}`,
          '',
          'La carga inicial fue cancelada.',
        ].join('\n')
      )
    }

    /*
     * ======================================================
     * 5. VALIDAR 583 FARMACIAS DE JALISCO
     * ======================================================
     */

    const dbCountResult =
      await client.query(`
        SELECT
          COUNT(*)::integer
            AS total

        FROM public.farmacia

        WHERE UPPER(
          BTRIM(
            COALESCE(
              estado,
              ''
            )
          )
        ) = 'JALISCO'
      `)

    const dbUnitCount =
      dbCountResult
        .rows[0]
        .total

    requireEqual(
      'Farmacias Jalisco',
      dbUnitCount,
      EXPECTED.databaseUnits
    )

    /*
     * ======================================================
     * 6. CREAR TABLA TEMPORAL DE LAS 560 ASIGNACIONES
     * ======================================================
     */

    await client.query(`
      CREATE TEMP TABLE
        tmp_jalisco_assignments_2026 (
          pharmacy_id bigint
            NOT NULL,

          clues text
            NOT NULL,

          unidad text,

          region text,

          latitud double precision,

          longitud double precision,

          supervisor_id uuid
            NOT NULL,

          supervisor text
            NOT NULL,

          coordinator_id uuid
            NOT NULL,

          coordinator text
            NOT NULL,

          match_method text
            NOT NULL,

          official_clues text,

          PRIMARY KEY (
            pharmacy_id
          )
        )
      ON COMMIT DROP
    `)

    /*
     * ======================================================
     * CARGAR LAS 560 ASIGNACIONES DEL PREVIEW
     * ======================================================
     *
     * IMPORTANTE:
     * El JSON usa camelCase:
     *
     * pharmacyId
     * supervisorId
     * coordinatorId
     * matchMethod
     * officialClues
     *
     * PostgreSQL debe leer esos nombres exactamente,
     * por eso van entre comillas dobles.
     */

    await client.query(
      `
        INSERT INTO tmp_jalisco_assignments_2026 (
          pharmacy_id,
          clues,
          unidad,
          region,
          latitud,
          longitud,
          supervisor_id,
          supervisor,
          coordinator_id,
          coordinator,
          match_method,
          official_clues
        )

        SELECT
          x."pharmacyId",
          x.clues,
          x.unidad,
          x.region,
          x.latitud,
          x.longitud,
          x."supervisorId",
          x.supervisor,
          x."coordinatorId",
          x.coordinator,
          x."matchMethod",
          x."officialClues"

        FROM jsonb_to_recordset(
          $1::jsonb
        ) AS x (
          "pharmacyId" bigint,
          clues text,
          unidad text,
          region text,
          latitud double precision,
          longitud double precision,
          "supervisorId" uuid,
          supervisor text,
          "coordinatorId" uuid,
          coordinator text,
          "matchMethod" text,
          "officialClues" text
        )
      `,
      [
        JSON.stringify(
          assignments
        ),
      ]
    )

    /*
     * ======================================================
     * 7. VALIDAR 560 FILAS ÚNICAS
     * ======================================================
     */

    const tmpCountResult =
      await client.query(`
        SELECT
          COUNT(*)::integer
            AS total,

          COUNT(
            DISTINCT pharmacy_id
          )::integer
            AS unique_pharmacies,

          COUNT(
            DISTINCT supervisor_id
          )::integer
            AS supervisors,

          COUNT(
            DISTINCT coordinator_id
          )::integer
            AS coordinators

        FROM tmp_jalisco_assignments_2026
      `)

    const tmpCounts =
      tmpCountResult
        .rows[0]

    requireEqual(
      'Asignaciones preparadas',
      tmpCounts.total,
      EXPECTED.assignments
    )

    requireEqual(
      'Farmacias únicas',
      tmpCounts.unique_pharmacies,
      EXPECTED.assignments
    )

    requireEqual(
      'Supervisores utilizados',
      tmpCounts.supervisors,
      EXPECTED.supervisors
    )

    requireEqual(
      'Coordinadores utilizados',
      tmpCounts.coordinators,
      EXPECTED.coordinators
    )

    /*
     * ======================================================
     * 8. VALIDAR FARMACIA.ID + CLUES
     * ======================================================
     *
     * El preview conserva el CLUES actual de nuestra BD.
     *
     * Tomatlán, por ejemplo:
     * DB CLUES actual     → JCSSA00611526
     * CLUES oficial 2026 → JCSSA01433426
     *
     * Por eso comparamos farmacia.clues contra x.clues,
     * NO contra official_clues.
     */

    const pharmacyMismatchResult =
      await client.query(`
        SELECT
          x.pharmacy_id,
          x.clues AS expected_clues,
          x.unidad AS expected_unit,

          f.clues AS current_clues,
          f.unidad AS current_unit,
          f.estado

        FROM tmp_jalisco_assignments_2026 x

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
          ) <> UPPER(
            BTRIM(
              x.clues
            )
          )
      `)

    if (
      pharmacyMismatchResult.rowCount >
      0
    ) {
      throw new Error(
        [
          'Hay farmacias que cambiaron desde el preview.',
          '',
          JSON.stringify(
            pharmacyMismatchResult.rows,
            null,
            2
          ),
        ].join('\n')
      )
    }

    /*
     * ======================================================
     * 9. VALIDAR SUPERVISORES
     * ======================================================
     */

    const supervisorErrorResult =
      await client.query(`
        SELECT DISTINCT
          x.supervisor_id,
          x.supervisor,

          p.nombre
            AS current_name,

          p.area,
          p.rol,
          p.activo,

          p.superior_id,

          coordinator.id
            AS coordinator_id,

          coordinator.nombre
            AS coordinator_name,

          coordinator.area
            AS coordinator_area,

          coordinator.rol
            AS coordinator_role,

          coordinator.activo
            AS coordinator_active

        FROM tmp_jalisco_assignments_2026 x

        LEFT JOIN public.personas p
          ON p.id =
             x.supervisor_id

        LEFT JOIN public.personas coordinator
          ON coordinator.id =
             x.coordinator_id

        WHERE
          p.id IS NULL

          OR p.area <>
             'FARMACIAS'

          OR p.rol <>
             'SUPERVISOR'

          OR p.activo <>
             TRUE

          OR p.superior_id IS DISTINCT FROM
             x.coordinator_id

          OR coordinator.id IS NULL

          OR coordinator.area <>
             'FARMACIAS'

          OR coordinator.rol <>
             'COORDINADOR'

          OR coordinator.activo <>
             TRUE
      `)

    if (
      supervisorErrorResult.rowCount >
      0
    ) {
      throw new Error(
        [
          'La jerarquía cambió desde la FASE A.',
          '',
          JSON.stringify(
            supervisorErrorResult.rows,
            null,
            2
          ),
        ].join('\n')
      )
    }

    /*
     * ======================================================
     * 10. VALIDAR SCOPES JALISCO
     * ======================================================
     */

    const scopeErrorsResult =
      await client.query(`
        SELECT DISTINCT
          x.supervisor,
          x.coordinator

        FROM tmp_jalisco_assignments_2026 x

        WHERE NOT EXISTS (
          SELECT 1
          FROM public.person_state_scope pss
          WHERE pss.persona_id =
                x.supervisor_id
            AND pss.revoked_at
                IS NULL
            AND UPPER(
              BTRIM(
                pss.estado
              )
            ) = 'JALISCO'
        )

        OR NOT EXISTS (
          SELECT 1
          FROM public.person_state_scope pss
          WHERE pss.persona_id =
                x.coordinator_id
            AND pss.revoked_at
                IS NULL
            AND UPPER(
              BTRIM(
                pss.estado
              )
            ) = 'JALISCO'
        )
      `)

    if (
      scopeErrorsResult.rowCount >
      0
    ) {
      throw new Error(
        [
          'Hay personas sin scope activo Jalisco.',
          '',
          JSON.stringify(
            scopeErrorsResult.rows,
            null,
            2
          ),
        ].join('\n')
      )
    }

    /*
     * ======================================================
     * 11. BACKUPS
     * ======================================================
     */

    await client.query(`
      CREATE TABLE IF NOT EXISTS
        public._backup_pharmacy_supervisor_assignment_20260728_preload
      AS
      SELECT *
      FROM public.pharmacy_supervisor_assignment
      WITH DATA
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS
        public._backup_pharmacy_assignment_event_20260728_preload
      AS
      SELECT *
      FROM public.pharmacy_assignment_event
      WITH DATA
    `)

    /*
     * ======================================================
     * 12. INSERTAR 560 ASIGNACIONES
     * ======================================================
     */

    const insertAssignmentsResult =
      await client.query(
        `
          INSERT INTO public.pharmacy_supervisor_assignment (
            pharmacy_id,
            supervisor_id,
            assigned_by,
            assignment_comment
          )

          SELECT
            x.pharmacy_id,
            x.supervisor_id,
            $1::uuid,
            $2::text

          FROM tmp_jalisco_assignments_2026 x

          ORDER BY
            x.pharmacy_id

          RETURNING
            id,
            pharmacy_id,
            supervisor_id,
            assigned_by,
            assigned_at,
            assignment_comment,
            revoked_by,
            revoked_at,
            created_at,
            updated_at
        `,
        [
          DAMARIS_ID,
          ASSIGNMENT_COMMENT,
        ]
      )

    requireEqual(
      'Asignaciones insertadas',
      insertAssignmentsResult.rowCount,
      EXPECTED.assignments
    )

    /*
     * ======================================================
     * 13. INSERTAR 560 EVENTOS DE AUDITORÍA
     * ======================================================
     */

    const insertEventsResult =
      await client.query(
        `
          INSERT INTO public.pharmacy_assignment_event (
            assignment_id,
            pharmacy_id,
            supervisor_id,
            event_type,
            actor_id,
            comment,
            before_data,
            after_data,
            metadata
          )

          SELECT
            a.id,
            a.pharmacy_id,
            a.supervisor_id,

            'PHARMACY_ASSIGNED',

            $1::uuid,

            $2::text,

            NULL::jsonb,

            jsonb_build_object(
              'assignmentId',
                a.id,

              'pharmacyId',
                a.pharmacy_id,

              'supervisorId',
                a.supervisor_id,

              'assignedBy',
                a.assigned_by,

              'assignedAt',
                a.assigned_at,

              'assignmentComment',
                a.assignment_comment,

              'revokedAt',
                a.revoked_at
            ),

            jsonb_build_object(
              'source',
                'JALISCO_OFFICIAL_CATALOG_2026',

              'migration',
                'INITIAL_FORMAL_ASSIGNMENTS',

              'state',
                'Jalisco',

              'matchMethod',
                x.match_method,

              'databaseClues',
                x.clues,

              'officialClues',
                x.official_clues,

              'supervisorName',
                x.supervisor,

              'coordinatorName',
                x.coordinator
            )

          FROM public.pharmacy_supervisor_assignment a

          INNER JOIN tmp_jalisco_assignments_2026 x
            ON x.pharmacy_id =
               a.pharmacy_id

           AND x.supervisor_id =
               a.supervisor_id

          WHERE a.revoked_at
                IS NULL

          RETURNING id
        `,
        [
          DAMARIS_ID,
          EVENT_COMMENT,
        ]
      )

    requireEqual(
      'Eventos insertados',
      insertEventsResult.rowCount,
      EXPECTED.assignments
    )

    /*
     * ======================================================
     * 14. VALIDAR ESTADO FINAL DE ASIGNACIONES
     * ======================================================
     */

    const finalAssignmentsResult =
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
            AS active_pharmacies,

          COUNT(
            DISTINCT supervisor_id
          ) FILTER (
            WHERE revoked_at IS NULL
          )::integer
            AS active_supervisors

        FROM public.pharmacy_supervisor_assignment
      `)

    const finalAssignments =
      finalAssignmentsResult
        .rows[0]

    requireEqual(
      'Histórico final',
      finalAssignments.total,
      EXPECTED.assignments
    )

    requireEqual(
      'Asignaciones activas',
      finalAssignments.active,
      EXPECTED.assignments
    )

    requireEqual(
      'Farmacias activamente asignadas',
      finalAssignments.active_pharmacies,
      EXPECTED.assignments
    )

    requireEqual(
      'Supervisores con asignación',
      finalAssignments.active_supervisors,
      EXPECTED.supervisors
    )

    /*
     * ======================================================
     * 15. VALIDAR EVENTOS
     * ======================================================
     */

    const finalEventsResult =
    await client.query(`
        SELECT
        COUNT(*)::integer
            AS total,

        COUNT(*) FILTER (
            WHERE event_type =
                'PHARMACY_ASSIGNED'
        )::integer
            AS assigned_events

        FROM public.pharmacy_assignment_event
    `)

    requireEqual(
      'Eventos totales',
      finalEventsResult.rows[0].total,
      EXPECTED.assignments
    )

    requireEqual(
    'Eventos PHARMACY_ASSIGNED',
    finalEventsResult.rows[0].assigned_events,
    EXPECTED.assignments
    )

    /*
     * ======================================================
     * 16. VALIDAR CONTEOS POR SUPERVISOR
     * ======================================================
     */

    const supervisorCountErrors =
      await client.query(`
        WITH expected AS (
          SELECT
            supervisor_id,
            supervisor,
            COUNT(*)::integer
              AS expected_count

          FROM tmp_jalisco_assignments_2026

          GROUP BY
            supervisor_id,
            supervisor
        ),

        actual AS (
          SELECT
            supervisor_id,

            COUNT(*)::integer
              AS actual_count

          FROM public.pharmacy_supervisor_assignment

          WHERE revoked_at
                IS NULL

          GROUP BY
            supervisor_id
        )

        SELECT
          e.supervisor,
          e.expected_count,

          COALESCE(
            a.actual_count,
            0
          ) AS actual_count

        FROM expected e

        LEFT JOIN actual a
          ON a.supervisor_id =
             e.supervisor_id

        WHERE e.expected_count <>
              COALESCE(
                a.actual_count,
                0
              )

        ORDER BY
          e.supervisor
      `)

    if (
      supervisorCountErrors.rowCount >
      0
    ) {
      throw new Error(
        [
          'Los conteos finales por supervisor no coinciden.',
          '',
          JSON.stringify(
            supervisorCountErrors.rows,
            null,
            2
          ),
        ].join('\n')
      )
    }

    /*
     * ======================================================
     * 17. VALIDAR LAS 22 VACANTES
     * ======================================================
     */

    const vacantIds =
      vacantUnits.map(
        item =>
          Number(
            item.pharmacyId
          )
      )

    if (
      vacantIds.length !==
      EXPECTED.vacantUnits
    ) {
      throw new Error(
        `Se esperaban ${EXPECTED.vacantUnits} farmacias VACANTE.`
      )
    }

    const vacantAssignedResult =
      await client.query(
        `
          SELECT
            pharmacy_id,
            supervisor_id

          FROM public.pharmacy_supervisor_assignment

          WHERE revoked_at
                IS NULL

            AND pharmacy_id =
                ANY(
                  $1::bigint[]
                )
        `,
        [
          vacantIds,
        ]
      )

    requireEqual(
      'VACANTE con asignación activa',
      vacantAssignedResult.rowCount,
      0
    )

    /*
     * ======================================================
     * 18. VALIDAR LA UNIDAD CERRADA
     * ======================================================
     */

    const closedIds =
      closedUnits
        .map(
          item =>
            Number(
              item.database?.id
            )
        )
        .filter(
          Number.isFinite
        )

    if (
      closedIds.length !==
      EXPECTED.closedUnits
    ) {
      throw new Error(
        'No se pudo determinar exactamente la unidad cerrada.'
      )
    }

    const closedAssignedResult =
      await client.query(
        `
          SELECT
            pharmacy_id,
            supervisor_id

          FROM public.pharmacy_supervisor_assignment

          WHERE revoked_at
                IS NULL

            AND pharmacy_id =
                ANY(
                  $1::bigint[]
                )
        `,
        [
          closedIds,
        ]
      )

    requireEqual(
      'Unidades cerradas asignadas',
      closedAssignedResult.rowCount,
      0
    )

    /*
     * ======================================================
     * 19. VALIDAR QUE NO CAMBIAMOS pharmacy_scope_mode
     * ======================================================
     */

    const scopeModeResult =
      await client.query(`
        SELECT
          COUNT(*)::integer
            AS official_supervisors,

          COUNT(*) FILTER (
            WHERE pharmacy_scope_mode =
                  'ALL'
          )::integer
            AS all_mode

        FROM public.personas

        WHERE area =
              'FARMACIAS'

          AND rol =
              'SUPERVISOR'

          AND activo =
              TRUE

          AND id IN (
            SELECT DISTINCT
              supervisor_id

            FROM tmp_jalisco_assignments_2026
          )
      `)

    requireEqual(
      'Supervisores oficiales',
      scopeModeResult.rows[0].official_supervisors,
      EXPECTED.supervisors
    )

    requireEqual(
      'Supervisores todavía en ALL',
      scopeModeResult.rows[0].all_mode,
      EXPECTED.supervisors
    )

    /*
     * ======================================================
     * 20. COMMIT
     * ======================================================
     */

    await client.query(
      'COMMIT'
    )

    console.log('')
    console.log(
      '=============================================='
    )
    console.log(
      ' ✅ FASE B2 COMPLETADA'
    )
    console.log(
      '=============================================='
    )

    console.log('')
    console.log(
      'Asignaciones activas: 560'
    )
    console.log(
      'Eventos de auditoría: 560'
    )
    console.log(
      'VACANTE sin asignar: 22'
    )
    console.log(
      'Unidad cerrada sin asignar: 1'
    )
    console.log(
      'Supervisores: 24'
    )
    console.log(
      'pharmacy_scope_mode: sigue ALL'
    )
    console.log('')
  } catch (error) {
    try {
      await client.query(
        'ROLLBACK'
      )
    } catch {}

    console.error('')
    console.error(
      '❌ FASE B2 CANCELADA'
    )
    console.error('')

    throw error
  } finally {
    client.release()
  }
}

/*
 * ==========================================================
 * VALIDACIÓN DEL REPORTE
 * ==========================================================
 */

function validatePreviewReport(
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

  if (
    !Array.isArray(
      report.assignmentCandidates
    )
  ) {
    throw new Error(
      'El reporte no contiene assignmentCandidates.'
    )
  }

  requireEqual(
    'Preview: assignments',
    report.assignmentCandidates.length,
    EXPECTED.assignments
  )

  requireEqual(
    'Preview: BD',
    report.database?.jaliscoUnits,
    EXPECTED.databaseUnits
  )

  requireEqual(
    'Preview: operativas',
    report.reconciliation?.operationalMatches,
    EXPECTED.operationalUnits
  )

  requireEqual(
    'Preview: VACANTE',
    report.reconciliation?.vacantUnits?.length,
    EXPECTED.vacantUnits
  )

  requireEqual(
    'Preview: cerradas',
    report.reconciliation?.closedUnits?.length,
    EXPECTED.closedUnits
  )

  requireEqual(
    'Preview: sin conciliar',
    report.reconciliation?.unmatchedDatabaseUnits?.length,
    0
  )

  requireEqual(
    'Preview: personas faltantes',
    report.reconciliation?.missingPeople?.length,
    0
  )

  requireEqual(
    'Preview: errores jerarquía',
    report.reconciliation?.hierarchyErrors?.length,
    0
  )

  /*
   * Comprobar farmacias duplicadas en el JSON.
   */
  const pharmacyIds =
    report.assignmentCandidates.map(
      item =>
        Number(
          item.pharmacyId
        )
    )

  const uniquePharmacyIds =
    new Set(
      pharmacyIds
    )

  requireEqual(
    'Preview: pharmacyId únicos',
    uniquePharmacyIds.size,
    EXPECTED.assignments
  )

  const supervisorIds =
    new Set(
      report.assignmentCandidates.map(
        item =>
          item.supervisorId
      )
    )

  requireEqual(
    'Preview: supervisores',
    supervisorIds.size,
    EXPECTED.supervisors
  )

  const coordinatorIds =
    new Set(
      report.assignmentCandidates.map(
        item =>
          item.coordinatorId
      )
    )

  requireEqual(
    'Preview: coordinadores',
    coordinatorIds.size,
    EXPECTED.coordinators
  )
}

/*
 * ==========================================================
 * CHECK
 * ==========================================================
 */

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

/*
 * ==========================================================
 * CONSOLA
 * ==========================================================
 */

function printBanner() {
  console.log('')
  console.log(
    '=============================================='
  )
  console.log(
    ' FASE B2 - ASIGNACIONES JALISCO 2026'
  )
  console.log(
    ' 560 SUPERVISOR → FARMACIA'
  )
  console.log(
    '=============================================='
  )
  console.log('')
}

/*
 * ==========================================================
 * EJECUCIÓN
 * ==========================================================
 */

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
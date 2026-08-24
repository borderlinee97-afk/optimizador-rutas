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
  supervisors:
    24,

  assignments:
    560,

  previousAssignmentEvents:
    560,

  scopeEvents:
    24,

  finalEvents:
    584,
}

const EVENT_COMMENT =
  'Activación de alcance ASSIGNED_ONLY para supervisores Jalisco 2026'

async function main() {
  printBanner()

  /*
   * ========================================================
   * 1. CARGAR PREVIEW YA VALIDADO
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

  /*
   * Obtenemos los 24 supervisores únicos
   * directamente del preview conciliado.
   */
  const supervisorMap =
    new Map()

  for (
    const item
    of report.assignmentCandidates
  ) {
    if (
      !item.supervisorId
    ) {
      throw new Error(
        `Asignación sin supervisorId para farmacia ${item.pharmacyId}.`
      )
    }

    if (
      !supervisorMap.has(
        item.supervisorId
      )
    ) {
      supervisorMap.set(
        item.supervisorId,
        {
          supervisorId:
            item.supervisorId,

          supervisor:
            item.supervisor,

          coordinatorId:
            item.coordinatorId,

          coordinator:
            item.coordinator,

          expectedUnits:
            0,
        }
      )
    }

    supervisorMap
      .get(
        item.supervisorId
      )
      .expectedUnits +=
      1
  }

  const supervisors =
    Array.from(
      supervisorMap.values()
    )

  requireEqual(
    'Supervisores del preview',
    supervisors.length,
    EXPECTED.supervisors
  )

  /*
   * ========================================================
   * 2. TRANSACCIÓN
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

          WHERE id =
                $1::uuid
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
        'No se encontró a Damaris.'
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
        'Damaris no tiene el perfil GERENTE activo esperado.'
      )
    }

    /*
     * ======================================================
     * 4. VALIDAR B2
     * ======================================================
     */

    const assignmentResult =
      await client.query(`
        SELECT
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
            DISTINCT supervisor_id
          ) FILTER (
            WHERE revoked_at IS NULL
          )::integer
            AS supervisors

        FROM public.pharmacy_supervisor_assignment
      `)

    const assignmentState =
      assignmentResult.rows[0]

    requireEqual(
      'Asignaciones activas',
      assignmentState.active,
      EXPECTED.assignments
    )

    requireEqual(
      'Farmacias asignadas',
      assignmentState.pharmacies,
      EXPECTED.assignments
    )

    requireEqual(
      'Supervisores con asignación',
      assignmentState.supervisors,
      EXPECTED.supervisors
    )

    /*
     * ======================================================
     * 5. VALIDAR AUDITORÍA PREVIA
     * ======================================================
     */

    const eventResult =
      await client.query(`
        SELECT
          COUNT(*)::integer
            AS total,

          COUNT(*) FILTER (
            WHERE event_type =
                  'PHARMACY_ASSIGNED'
          )::integer
            AS pharmacy_assigned,

          COUNT(*) FILTER (
            WHERE event_type =
                  'SUPERVISOR_SCOPE_CHANGED'
          )::integer
            AS scope_changed

        FROM public.pharmacy_assignment_event
      `)

    const eventState =
      eventResult.rows[0]

    requireEqual(
      'Eventos actuales',
      eventState.total,
      EXPECTED.previousAssignmentEvents
    )

    requireEqual(
      'Eventos PHARMACY_ASSIGNED',
      eventState.pharmacy_assigned,
      EXPECTED.previousAssignmentEvents
    )

    requireEqual(
      'Eventos SUPERVISOR_SCOPE_CHANGED previos',
      eventState.scope_changed,
      0
    )

    /*
     * ======================================================
     * 6. TABLA TEMPORAL DE SUPERVISORES
     * ======================================================
     */

    await client.query(`
      CREATE TEMP TABLE
        tmp_jalisco_supervisor_scope_2026 (
          supervisor_id uuid
            PRIMARY KEY,

          supervisor text
            NOT NULL,

          coordinator_id uuid
            NOT NULL,

          coordinator text
            NOT NULL,

          expected_units integer
            NOT NULL
        )
      ON COMMIT DROP
    `)

    await client.query(
      `
        INSERT INTO tmp_jalisco_supervisor_scope_2026 (
          supervisor_id,
          supervisor,
          coordinator_id,
          coordinator,
          expected_units
        )

        SELECT
          x."supervisorId",
          x.supervisor,
          x."coordinatorId",
          x.coordinator,
          x."expectedUnits"

        FROM jsonb_to_recordset(
          $1::jsonb
        ) AS x (
          "supervisorId" uuid,
          supervisor text,
          "coordinatorId" uuid,
          coordinator text,
          "expectedUnits" integer
        )
      `,
      [
        JSON.stringify(
          supervisors
        ),
      ]
    )

    const tmpResult =
      await client.query(`
        SELECT
          COUNT(*)::integer
            AS total
        FROM tmp_jalisco_supervisor_scope_2026
      `)

    requireEqual(
      'Supervisores preparados',
      tmpResult.rows[0].total,
      EXPECTED.supervisors
    )

    /*
     * ======================================================
     * 7. VALIDAR PERSONAS Y JERARQUÍA
     * ======================================================
     */

    const personErrors =
      await client.query(`
        SELECT
          x.supervisor,
          x.coordinator,

          p.id,
          p.nombre,
          p.area,
          p.rol,
          p.activo,
          p.superior_id,
          p.pharmacy_scope_mode,

          c.nombre
            AS current_coordinator,

          c.rol
            AS coordinator_role

        FROM tmp_jalisco_supervisor_scope_2026 x

        LEFT JOIN public.personas p
          ON p.id =
             x.supervisor_id

        LEFT JOIN public.personas c
          ON c.id =
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

          OR c.id IS NULL

          OR c.area <>
             'FARMACIAS'

          OR c.rol <>
             'COORDINADOR'

          OR c.activo <>
             TRUE
      `)

    if (
      personErrors.rowCount >
      0
    ) {
      throw new Error(
        [
          'Hay errores en personas/jerarquía.',
          JSON.stringify(
            personErrors.rows,
            null,
            2
          ),
        ].join('\n')
      )
    }

    /*
     * ======================================================
     * 8. TODOS DEBEN SEGUIR EN ALL
     * ======================================================
     */

    const currentScopeResult =
      await client.query(`
        SELECT
          COUNT(*)::integer
            AS total,

          COUNT(*) FILTER (
            WHERE p.pharmacy_scope_mode =
                  'ALL'
          )::integer
            AS all_mode,

          COUNT(*) FILTER (
            WHERE p.pharmacy_scope_mode =
                  'ASSIGNED_ONLY'
          )::integer
            AS assigned_only

        FROM public.personas p

        INNER JOIN tmp_jalisco_supervisor_scope_2026 x
          ON x.supervisor_id =
             p.id
      `)

    const currentScope =
      currentScopeResult.rows[0]

    requireEqual(
      'Supervisores oficiales',
      currentScope.total,
      EXPECTED.supervisors
    )

    requireEqual(
      'Supervisores todavía ALL',
      currentScope.all_mode,
      EXPECTED.supervisors
    )

    requireEqual(
      'Supervisores ya ASSIGNED_ONLY',
      currentScope.assigned_only,
      0
    )

    /*
     * ======================================================
     * 9. VALIDAR CONTEOS POR SUPERVISOR
     * ======================================================
     */

    const countErrors =
      await client.query(`
        WITH actual AS (
          SELECT
            supervisor_id,

            COUNT(*)::integer
              AS units

          FROM public.pharmacy_supervisor_assignment

          WHERE revoked_at
                IS NULL

          GROUP BY
            supervisor_id
        )

        SELECT
          x.supervisor,
          x.expected_units,

          COALESCE(
            a.units,
            0
          ) AS actual_units

        FROM tmp_jalisco_supervisor_scope_2026 x

        LEFT JOIN actual a
          ON a.supervisor_id =
             x.supervisor_id

        WHERE
          x.expected_units <>
          COALESCE(
            a.units,
            0
          )

        ORDER BY
          x.supervisor
      `)

    if (
      countErrors.rowCount >
      0
    ) {
      throw new Error(
        [
          'Los conteos por supervisor no coinciden.',
          JSON.stringify(
            countErrors.rows,
            null,
            2
          ),
        ].join('\n')
      )
    }

    /*
     * ======================================================
     * 10. BACKUP
     * ======================================================
     */

    await client.query(`
      CREATE TABLE IF NOT EXISTS
        public._backup_personas_scope_20260728_pre_assigned_only
      AS

      SELECT p.*

      FROM public.personas p

      INNER JOIN tmp_jalisco_supervisor_scope_2026 x
        ON x.supervisor_id =
           p.id

      WITH DATA
    `)

    /*
     * ======================================================
     * 11. CAMBIAR ALL → ASSIGNED_ONLY
     * ======================================================
     */

    const updateResult =
      await client.query(`
        UPDATE public.personas p

        SET
          pharmacy_scope_mode =
            'ASSIGNED_ONLY'

        FROM tmp_jalisco_supervisor_scope_2026 x

        WHERE p.id =
              x.supervisor_id

          AND p.pharmacy_scope_mode =
              'ALL'

        RETURNING
          p.id,
          p.nombre,
          p.pharmacy_scope_mode
      `)

    requireEqual(
      'Supervisores actualizados',
      updateResult.rowCount,
      EXPECTED.supervisors
    )

    /*
     * ======================================================
     * 12. AUDITORÍA DEL CAMBIO
     * ======================================================
     */

    const auditResult =
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
            NULL::uuid,
            NULL::bigint,
            x.supervisor_id,

            'SUPERVISOR_SCOPE_CHANGED',

            $1::uuid,

            $2::text,

            jsonb_build_object(
              'pharmacyScopeMode',
                'ALL'
            ),

            jsonb_build_object(
              'pharmacyScopeMode',
                'ASSIGNED_ONLY'
            ),

            jsonb_build_object(
              'source',
                'JALISCO_OFFICIAL_CATALOG_2026',

              'migration',
                'ENABLE_FORMAL_PHARMACY_SCOPE',

              'state',
                'Jalisco',

              'supervisorName',
                x.supervisor,

              'coordinatorId',
                x.coordinator_id,

              'coordinatorName',
                x.coordinator,

              'assignedUnits',
                x.expected_units
            )

          FROM tmp_jalisco_supervisor_scope_2026 x

          ORDER BY
            x.supervisor

          RETURNING id
        `,
        [
          DAMARIS_ID,
          EVENT_COMMENT,
        ]
      )

    requireEqual(
      'Eventos de scope insertados',
      auditResult.rowCount,
      EXPECTED.scopeEvents
    )

    /*
     * ======================================================
     * 13. VALIDACIÓN FINAL DEL SCOPE
     * ======================================================
     */

    const finalScopeResult =
      await client.query(`
        SELECT
          COUNT(*)::integer
            AS total,

          COUNT(*) FILTER (
            WHERE p.pharmacy_scope_mode =
                  'ASSIGNED_ONLY'
          )::integer
            AS assigned_only,

          COUNT(*) FILTER (
            WHERE p.pharmacy_scope_mode =
                  'ALL'
          )::integer
            AS all_mode

        FROM public.personas p

        INNER JOIN tmp_jalisco_supervisor_scope_2026 x
          ON x.supervisor_id =
             p.id
      `)

    requireEqual(
      'Supervisores finales',
      finalScopeResult.rows[0].total,
      EXPECTED.supervisors
    )

    requireEqual(
      'Supervisores ASSIGNED_ONLY',
      finalScopeResult.rows[0].assigned_only,
      EXPECTED.supervisors
    )

    requireEqual(
      'Supervisores ALL restantes',
      finalScopeResult.rows[0].all_mode,
      0
    )

    /*
     * ======================================================
     * 14. VALIDAR QUE COORDINADORES Y GERENTE
     *     NO CAMBIARON
     * ======================================================
     */

    const managementResult =
      await client.query(
        `
          SELECT
            COUNT(*) FILTER (
              WHERE rol =
                    'GERENTE'
            )::integer
              AS managers,

            COUNT(*) FILTER (
              WHERE rol =
                    'COORDINADOR'
            )::integer
              AS coordinators,

            COUNT(*) FILTER (
              WHERE rol IN (
                'GERENTE',
                'COORDINADOR'
              )

              AND pharmacy_scope_mode =
                  'ALL'
            )::integer
              AS still_all

          FROM public.personas

          WHERE area =
                'FARMACIAS'

            AND activo =
                TRUE

            AND (
              id =
                $1::uuid

              OR superior_id =
                 $1::uuid
            )
        `,
        [
          DAMARIS_ID,
        ]
      )

    requireEqual(
      'Gerentes',
      managementResult.rows[0].managers,
      1
    )

    requireEqual(
      'Coordinadores',
      managementResult.rows[0].coordinators,
      5
    )

    requireEqual(
      'Gerente + coordinadores todavía ALL',
      managementResult.rows[0].still_all,
      6
    )

    /*
     * ======================================================
     * 15. VALIDAR EVENTOS FINALES
     * ======================================================
     */

    const finalEventResult =
      await client.query(`
        SELECT
          COUNT(*)::integer
            AS total,

          COUNT(*) FILTER (
            WHERE event_type =
                  'PHARMACY_ASSIGNED'
          )::integer
            AS assigned,

          COUNT(*) FILTER (
            WHERE event_type =
                  'SUPERVISOR_SCOPE_CHANGED'
          )::integer
            AS scope_changed

        FROM public.pharmacy_assignment_event
      `)

    requireEqual(
      'Eventos totales finales',
      finalEventResult.rows[0].total,
      EXPECTED.finalEvents
    )

    requireEqual(
      'Eventos PHARMACY_ASSIGNED finales',
      finalEventResult.rows[0].assigned,
      EXPECTED.previousAssignmentEvents
    )

    requireEqual(
      'Eventos SUPERVISOR_SCOPE_CHANGED finales',
      finalEventResult.rows[0].scope_changed,
      EXPECTED.scopeEvents
    )

    /*
     * ======================================================
     * 16. ALMA
     * ======================================================
     */

    const almaResult =
      await client.query(`
        SELECT
          p.nombre,
          p.pharmacy_scope_mode,

          COUNT(
            psa.id
          ) FILTER (
            WHERE psa.revoked_at
                  IS NULL
          )::integer
            AS assigned_units

        FROM public.personas p

        LEFT JOIN public.pharmacy_supervisor_assignment psa
          ON psa.supervisor_id =
             p.id

        WHERE
          UPPER(
            BTRIM(
              p.nombre
            )
          ) =
          'YAÑEZ FERNANDEZ ALMA DELIA'

        GROUP BY
          p.id,
          p.nombre,
          p.pharmacy_scope_mode
      `)

    if (
      almaResult.rowCount !==
      1
    ) {
      throw new Error(
        'No se encontró exactamente a Alma.'
      )
    }

    const alma =
      almaResult.rows[0]

    if (
      alma.pharmacy_scope_mode !==
      'ASSIGNED_ONLY'
    ) {
      throw new Error(
        'Alma no quedó en ASSIGNED_ONLY.'
      )
    }

    requireEqual(
      'Unidades de Alma',
      alma.assigned_units,
      24
    )

    /*
     * ======================================================
     * 17. COMMIT
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
      ' ✅ FASE B3 COMPLETADA'
    )
    console.log(
      '=============================================='
    )

    console.log('')
    console.log(
      '24 supervisores: ASSIGNED_ONLY'
    )

    console.log(
      '5 coordinadores: ALL'
    )

    console.log(
      'Damaris: ALL'
    )

    console.log(
      'Alma: 24 unidades asignadas'
    )

    console.log(
      '560 asignaciones sin cambios'
    )

    console.log(
      '584 eventos acumulados'
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
      '❌ FASE B3 CANCELADA'
    )
    console.error('')

    throw error
  } finally {
    client.release()
  }
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
    '=============================================='
  )
  console.log(
    ' FASE B3 - SCOPE SUPERVISORES JALISCO 2026'
  )
  console.log(
    ' ALL → ASSIGNED_ONLY'
  )
  console.log(
    '=============================================='
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
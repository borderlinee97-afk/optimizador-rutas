const VALID_SCOPE_MODES =
  new Set([
    'ALL',
    'ASSIGNED_ONLY',
  ])

const DEFAULT_SCOPE_MODE =
  'ASSIGNED_ONLY'

const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/

export function normalizePharmacyScopeMode(
  value,
) {
  const normalized =
    String(
      value ??
      DEFAULT_SCOPE_MODE,
    )
      .trim()
      .toUpperCase()

  return VALID_SCOPE_MODES.has(
    normalized,
  )
    ? normalized
    : DEFAULT_SCOPE_MODE
}

/**
 * Comprueba acceso a una unidad para una fecha concreta.
 *
 * Un supervisor ASSIGNED_ONLY tiene acceso cuando:
 *
 * 1. es titular permanente; o
 * 2. tiene una cobertura APPROVED que incluye accessDate.
 */
export async function getPharmacyAccess(
  client,
  {
    pharmacyId,
    profile,
    accessDate = null,
  },
) {
  const scopeMode =
    normalizePharmacyScopeMode(
      profile
        ?.pharmacy_scope_mode,
    )

  const normalizedAccessDate =
    normalizeOptionalDate(
      accessDate,
    )

  const result =
    await client.query(
      `
      SELECT
        farmacia.id,
        farmacia.clues,
        farmacia.unidad,
        farmacia.direccion,
        farmacia.region_sanitaria,
        farmacia.proyecto,
        farmacia.estado,

        farmacia.estatus::text
          AS estatus,

        farmacia.latitud,
        farmacia.longitud,

        permanent_assignment.id
          AS permanent_assignment_id,

        coverage.id
          AS coverage_id,

        coverage.start_date
          AS coverage_start_date,

        coverage.end_date
          AS coverage_end_date,

        coverage.coordinator_id
          AS coverage_coordinator_id,

        coverage.titular_supervisor_id
          AS coverage_titular_supervisor_id

      FROM public.farmacia
        farmacia

      LEFT JOIN LATERAL (
        SELECT
          assignment.id

        FROM public.pharmacy_supervisor_assignment
          assignment

        WHERE assignment.pharmacy_id =
            farmacia.id

          AND assignment.supervisor_id =
            $2

          AND assignment.revoked_at
            IS NULL

        ORDER BY
          assignment.assigned_at DESC

        LIMIT 1
      ) permanent_assignment
        ON TRUE

      LEFT JOIN LATERAL (
        SELECT
          approved_coverage.id,
          approved_coverage.start_date,
          approved_coverage.end_date,
          approved_coverage.coordinator_id,
          approved_coverage.titular_supervisor_id

        FROM public.pharmacy_supervisor_coverage
          approved_coverage

        WHERE approved_coverage.pharmacy_id =
            farmacia.id

          AND approved_coverage.covering_supervisor_id =
            $2

          AND approved_coverage.status =
            'APPROVED'

          AND approved_coverage.cancelled_at
            IS NULL

          AND COALESCE(
            $3::date,
            CURRENT_DATE
          ) BETWEEN
            approved_coverage.start_date
            AND approved_coverage.end_date

        ORDER BY
          approved_coverage.start_date DESC

        LIMIT 1
      ) coverage
        ON TRUE

      WHERE farmacia.id =
          $1

      LIMIT 1
      `,
      [
        pharmacyId,
        profile?.id ??
        null,
        normalizedAccessDate,
      ],
    )

  const pharmacy =
    result.rows[0] ??
    null

  if (!pharmacy) {
    return {
      exists:
        false,

      allowed:
        false,

      scopeMode,

      accessType:
        'NONE',

      accessDate:
        normalizedAccessDate,

      pharmacy:
        null,

      coverage:
        null,
    }
  }

  const hasPermanentAssignment =
    Boolean(
      pharmacy
        .permanent_assignment_id,
    )

  const hasTemporaryCoverage =
    Boolean(
      pharmacy.coverage_id,
    )

  const allowed =
    scopeMode ===
      'ALL' ||
    hasPermanentAssignment ||
    hasTemporaryCoverage

  let accessType =
    'NONE'

  if (
    scopeMode ===
    'ALL'
  ) {
    accessType =
      'ALL'
  } else if (
    hasPermanentAssignment
  ) {
    accessType =
      'PERMANENT_ASSIGNMENT'
  } else if (
    hasTemporaryCoverage
  ) {
    accessType =
      'TEMPORARY_COVERAGE'
  }

  return {
    exists:
      true,

    allowed,

    scopeMode,

    accessType,

    accessDate:
      normalizedAccessDate,

    pharmacy,

    permanentAssignmentId:
      pharmacy
        .permanent_assignment_id,

    coverage:
      hasTemporaryCoverage
        ? {
            id:
              pharmacy.coverage_id,

            startDate:
              normalizeDateValue(
                pharmacy
                  .coverage_start_date,
              ),

            endDate:
              normalizeDateValue(
                pharmacy
                  .coverage_end_date,
              ),

            coordinatorId:
              pharmacy
                .coverage_coordinator_id,

            titularSupervisorId:
              pharmacy
                .coverage_titular_supervisor_id,
          }
        : null,
  }
}

/**
 * Revisa cada farmacia del plan usando su propia fecha.
 *
 * Esto evita enviar un plan con una visita programada
 * fuera del periodo autorizado de cobertura.
 */
export async function findUnauthorizedPlanPharmacy(
  client,
  {
    planId,
    profile,
  },
) {
  const scopeMode =
    normalizePharmacyScopeMode(
      profile
        ?.pharmacy_scope_mode,
    )

  if (
    scopeMode ===
    'ALL'
  ) {
    return null
  }

  const result =
    await client.query(
      `
      SELECT
        item.id
          AS item_id,

        item.pharmacy_id,

        item.scheduled_date,

        farmacia.clues,

        COALESCE(
          NULLIF(
            BTRIM(
              farmacia.unidad
            ),
            ''
          ),
          farmacia.clues,
          'Unidad sin nombre'
        ) AS pharmacy_name,

        farmacia.estado,

        farmacia.estatus::text
          AS pharmacy_status

      FROM public.work_plan_item
        item

      INNER JOIN public.farmacia
        farmacia

        ON farmacia.id =
          item.pharmacy_id

      WHERE item.plan_id =
          $1

        AND item.removed_at
          IS NULL

        AND item.item_type =
          'PHARMACY'

        AND item.source =
          'PLAN'

        AND item.pharmacy_id
          IS NOT NULL

        AND NOT EXISTS (
          SELECT 1

          FROM public.pharmacy_supervisor_assignment
            assignment

          WHERE assignment.pharmacy_id =
              item.pharmacy_id

            AND assignment.supervisor_id =
              $2

            AND assignment.revoked_at
              IS NULL
        )

        AND NOT EXISTS (
          SELECT 1

          FROM public.pharmacy_supervisor_coverage
            coverage

          WHERE coverage.pharmacy_id =
              item.pharmacy_id

            AND coverage.covering_supervisor_id =
              $2

            AND coverage.status =
              'APPROVED'

            AND coverage.cancelled_at
              IS NULL

            AND item.scheduled_date BETWEEN
              coverage.start_date
              AND coverage.end_date
        )

      ORDER BY
        item.scheduled_date ASC,
        item.ord ASC

      LIMIT 1
      `,
      [
        planId,
        profile?.id ??
        null,
      ],
    )

  return (
    result.rows[0] ??
    null
  )
}

function normalizeOptionalDate(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  if (
    value instanceof
    Date
  ) {
    return value
      .toISOString()
      .slice(
        0,
        10,
      )
  }

  const normalized =
    String(
      value,
    )
      .trim()
      .slice(
        0,
        10,
      )

  return ISO_DATE_PATTERN.test(
    normalized,
  )
    ? normalized
    : null
}

function normalizeDateValue(
  value,
) {
  if (!value) {
    return null
  }

  if (
    value instanceof
    Date
  ) {
    return value
      .toISOString()
      .slice(
        0,
        10,
      )
  }

  return String(
    value,
  ).slice(
    0,
    10,
  )
}
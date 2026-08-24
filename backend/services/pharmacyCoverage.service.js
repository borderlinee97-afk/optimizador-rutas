import {
  pool,
} from '../db/pool.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const BIGINT_PATTERN =
  /^\d+$/

const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/

const ALLOWED_ROLES =
  new Set([
    'GERENTE',
    'COORDINADOR',
  ])

export class PharmacyCoverageError
  extends Error {
  constructor(
    message,
    {
      status = 500,
      code = 'PHARMACY_COVERAGE_FAILED',
      details = null,
    } = {},
  ) {
    super(
      message,
    )

    this.name =
      'PharmacyCoverageError'

    this.status =
      status

    this.code =
      code

    this.details =
      details
  }
}

// ============================================================
// LISTADO
// ============================================================

export async function listPharmacyCoverages({
  state,
  actor,
}) {
  validateActor(
    actor,
  )

  const normalizedState =
    normalizeRequiredText(
      state,
      'Debes indicar el estado',
      'STATE_REQUIRED',
      150,
    )

  const result =
    await pool.query(
      `
      SELECT
        coverage.id,

        coverage.pharmacy_id,
        coverage.coordinator_id,

        coverage.titular_supervisor_id,
        coverage.covering_supervisor_id,

        coverage.start_date,
        coverage.end_date,

        coverage.status,
        coverage.request_source,

        coverage.requested_by,
        coverage.requested_at,
        coverage.request_comment,

        coverage.reviewed_by,
        coverage.reviewed_at,
        coverage.review_comment,

        coverage.cancelled_by,
        coverage.cancelled_at,
        coverage.cancellation_reason,

        coverage.created_at,
        coverage.updated_at,

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
        farmacia.region_sanitaria,
        farmacia.proyecto,
        farmacia.estatus::text
          AS pharmacy_status,

        coordinator.nombre
          AS coordinator_name,

        coordinator.superior_id
          AS coordinator_manager_id,

        titular.nombre
          AS titular_supervisor_name,

        covering.nombre
          AS covering_supervisor_name,

        requester.nombre
          AS requested_by_name,

        reviewer.nombre
          AS reviewed_by_name,

        canceller.nombre
          AS cancelled_by_name,

        CASE
          WHEN coverage.status =
            'APPROVED'
            AND CURRENT_DATE <
              coverage.start_date
          THEN 'SCHEDULED'

          WHEN coverage.status =
            'APPROVED'
            AND CURRENT_DATE BETWEEN
              coverage.start_date
              AND coverage.end_date
          THEN 'ACTIVE'

          WHEN coverage.status =
            'APPROVED'
            AND CURRENT_DATE >
              coverage.end_date
          THEN 'EXPIRED'

          ELSE coverage.status
        END AS effective_status

      FROM public.pharmacy_supervisor_coverage
        coverage

      INNER JOIN public.farmacia
        farmacia

        ON farmacia.id =
          coverage.pharmacy_id

      INNER JOIN public.personas
        coordinator

        ON coordinator.id =
          coverage.coordinator_id

      LEFT JOIN public.personas
        titular

        ON titular.id =
          coverage.titular_supervisor_id

      INNER JOIN public.personas
        covering

        ON covering.id =
          coverage.covering_supervisor_id

      INNER JOIN public.personas
        requester

        ON requester.id =
          coverage.requested_by

      LEFT JOIN public.personas
        reviewer

        ON reviewer.id =
          coverage.reviewed_by

      LEFT JOIN public.personas
        canceller

        ON canceller.id =
          coverage.cancelled_by

      WHERE UPPER(
          BTRIM(
            COALESCE(
              farmacia.estado,
              ''
            )
          )
        ) =
        UPPER(
          BTRIM(
            $1::text
          )
        )

        AND EXISTS (
          SELECT 1

          FROM public.person_state_scope
            actor_scope

          WHERE actor_scope.persona_id =
              $2::uuid

            AND actor_scope.revoked_at
              IS NULL

            AND UPPER(
              BTRIM(
                actor_scope.estado
              )
            ) =
            UPPER(
              BTRIM(
                farmacia.estado
              )
            )
        )

        AND (
          (
            $3::text =
              'GERENTE'

            AND coordinator.superior_id =
              $2::uuid
          )

          OR (
            $3::text =
              'COORDINADOR'

            AND coverage.coordinator_id =
              $2::uuid
          )
        )

      ORDER BY
        CASE coverage.status
          WHEN 'PENDING_APPROVAL'
            THEN 1
          WHEN 'APPROVED'
            THEN 2
          WHEN 'REJECTED'
            THEN 3
          WHEN 'CANCELLED'
            THEN 4
          ELSE 5
        END,

        coverage.start_date DESC,

        farmacia.unidad ASC
      `,
      [
        normalizedState,
        actor.id,
        actor.rol,
      ],
    )

  const coverages =
    result.rows.map(
      mapCoverage,
    )

  return {
    context: {
      area:
        'FARMACIAS',

      role:
        actor.rol,

      state:
        normalizedState,

      canApprove:
        actor.rol ===
        'GERENTE',

      canCreateDirect:
        actor.rol ===
        'GERENTE',

      canRequest:
        actor.rol ===
        'COORDINADOR',
    },

    totals:
      buildTotals(
        coverages,
      ),

    coverages,
  }
}

// ============================================================
// CREAR
// ============================================================

export async function createPharmacyCoverage({
  pharmacyId,
  coveringSupervisorId,
  startDate,
  endDate,
  comment,
  actor,
}) {
  validateActor(
    actor,
  )

  validatePharmacyId(
    pharmacyId,
  )

  validatePersonId(
    coveringSupervisorId,
    'El identificador del supervisor de cobertura no es válido',
    'INVALID_COVERING_SUPERVISOR_ID',
  )

  const dates =
    validateNewCoverageDates({
      startDate,
      endDate,
    })

  const normalizedComment =
    normalizeRequiredText(
      comment,
      'Debes indicar el motivo de la cobertura',
      'COVERAGE_COMMENT_REQUIRED',
      2000,
      5,
    )

  const client =
    await pool.connect()

  try {
    await client.query(
      'BEGIN',
    )

    await lockCoverageKey(
      client,
      pharmacyId,
    )

    const unit =
      await loadUnitForUpdate(
        client,
        pharmacyId,
      )

    await validateUnitForActor({
      client,
      unit,
      actor,
    })

    const coveringSupervisor =
      await loadCoveringSupervisor(
        client,
        coveringSupervisorId,
        unit.estado,
      )

    validateCoveringSupervisor({
      supervisor:
        coveringSupervisor,

      unit,
    })

    const overlapping =
      await findOverlappingCoverage(
        client,
        {
          pharmacyId,

          startDate:
            dates.startDate,

          endDate:
            dates.endDate,

          includePending:
            true,
        },
      )

    if (overlapping) {
      throw new PharmacyCoverageError(
        'La unidad ya tiene una cobertura pendiente o aprobada dentro del periodo solicitado',
        {
          status:
            409,

          code:
            'COVERAGE_PERIOD_ALREADY_USED',

          details: {
            coverageId:
              overlapping.id,

            status:
              overlapping.status,

            startDate:
              normalizeDateValue(
                overlapping.start_date,
              ),

            endDate:
              normalizeDateValue(
                overlapping.end_date,
              ),

            coveringSupervisorId:
              overlapping
                .covering_supervisor_id,
          },
        },
      )
    }

    const isManagerDirect =
      actor.rol ===
      'GERENTE'

    const status =
      isManagerDirect
        ? 'APPROVED'
        : 'PENDING_APPROVAL'

    const requestSource =
      isManagerDirect
        ? 'MANAGER_DIRECT'
        : 'COORDINATOR_REQUEST'

    /*
     * IMPORTANTE:
     *
     * Se agregan conversiones explícitas a cada parámetro.
     * Esto evita que PostgreSQL infiera $9 como text dentro
     * del CASE y como uuid en requested_by/reviewed_by.
     */
    const insertResult =
      await client.query(
        `
        INSERT INTO public.pharmacy_supervisor_coverage (
          pharmacy_id,
          coordinator_id,

          titular_supervisor_id,
          covering_supervisor_id,

          start_date,
          end_date,

          status,
          request_source,

          requested_by,
          request_comment,

          reviewed_by,
          reviewed_at,
          review_comment
        )
        VALUES (
          $1::bigint,
          $2::uuid,

          $3::uuid,
          $4::uuid,

          $5::date,
          $6::date,

          $7::text,
          $8::text,

          $9::uuid,
          $10::text,

          CASE
            WHEN $7::text =
              'APPROVED'
            THEN $9::uuid
            ELSE NULL::uuid
          END,

          CASE
            WHEN $7::text =
              'APPROVED'
            THEN NOW()
            ELSE NULL::timestamptz
          END,

          CASE
            WHEN $7::text =
              'APPROVED'
            THEN
              'Cobertura autorizada directamente por gerencia.'::text
            ELSE NULL::text
          END
        )

        RETURNING id
        `,
        [
          pharmacyId,
          unit.coordinator_id,

          unit.titular_supervisor_id,
          coveringSupervisorId,

          dates.startDate,
          dates.endDate,

          status,
          requestSource,

          actor.id,
          normalizedComment,
        ],
      )

    const coverageId =
      insertResult.rows[0].id

    const coverage =
      await loadCoverageById(
        client,
        coverageId,
      )

    if (!coverage) {
      throw new PharmacyCoverageError(
        'La cobertura fue registrada, pero no pudo recuperarse para completar la operación',
        {
          status:
            500,

          code:
            'CREATED_COVERAGE_NOT_FOUND',
        },
      )
    }

    await appendCoverageEvent(
      client,
      {
        coverage,

        eventType:
          'COVERAGE_REQUESTED',

        actor,

        comment:
          normalizedComment,

        beforeData:
          null,

        afterData:
          coverage,

        metadata: {
          channel:
            actor.channel ??
            'WEB',

          requestSource,

          directApproval:
            isManagerDirect,
        },
      },
    )

    if (isManagerDirect) {
      await appendCoverageEvent(
        client,
        {
          coverage,

          eventType:
            'COVERAGE_APPROVED',

          actor,

          comment:
            'Cobertura autorizada directamente por gerencia.',

          beforeData: {
            id:
              coverage.id,

            pharmacy_id:
              coverage.pharmacy_id,

            coordinator_id:
              coverage.coordinator_id,

            titular_supervisor_id:
              coverage.titular_supervisor_id,

            covering_supervisor_id:
              coverage.covering_supervisor_id,

            start_date:
              coverage.start_date,

            end_date:
              coverage.end_date,

            status:
              'PENDING_APPROVAL',

            request_source:
              coverage.request_source,

            requested_by:
              coverage.requested_by,

            requested_at:
              coverage.requested_at,

            request_comment:
              coverage.request_comment,

            reviewed_by:
              null,

            reviewed_at:
              null,

            review_comment:
              null,
          },

          afterData:
            coverage,

          metadata: {
            channel:
              actor.channel ??
              'WEB',

            requestSource:
              requestSource,

            directApproval:
              true,
          },
        },
      )
    }

    await client.query(
      'COMMIT',
    )

    return {
      ok:
        true,

      action:
        isManagerDirect
          ? 'CREATED_AND_APPROVED'
          : 'REQUESTED',

      coverage:
        mapCoverage(
          coverage,
        ),
    }
  } catch (
    error
  ) {
    await rollbackSafely(
      client,
    )

    throw mapCoverageDatabaseError(
      error,
      'No fue posible crear la cobertura temporal',
      'COVERAGE_CREATE_FAILED',
    )
  } finally {
    client.release()
  }
}

// ============================================================
// APROBAR
// ============================================================

export async function approvePharmacyCoverage({
  coverageId,
  comment,
  actor,
}) {
  validateManagerActor(
    actor,
  )

  validatePersonId(
    coverageId,
    'El identificador de la cobertura no es válido',
    'INVALID_COVERAGE_ID',
  )

  const normalizedComment =
    normalizeOptionalText(
      comment,
      2000,
      'El comentario no puede superar 2000 caracteres',
      'COVERAGE_REVIEW_COMMENT_TOO_LONG',
    )

  const client =
    await pool.connect()

  try {
    await client.query(
      'BEGIN',
    )

    const currentCoverage =
      await loadCoverageForUpdate(
        client,
        coverageId,
      )

    await validateCoverageForManager({
      client,
      coverage:
        currentCoverage,

      actor,
    })

    if (
      currentCoverage.status !==
      'PENDING_APPROVAL'
    ) {
      throw new PharmacyCoverageError(
        'La cobertura ya no se encuentra pendiente de aprobación',
        {
          status:
            409,

          code:
            'COVERAGE_NOT_PENDING',
        },
      )
    }

    const today =
      localTodayIso()

    if (
      normalizeDateValue(
        currentCoverage.end_date,
      ) <
      today
    ) {
      throw new PharmacyCoverageError(
        'El periodo de cobertura ya terminó y no puede aprobarse',
        {
          status:
            409,

          code:
            'COVERAGE_PERIOD_ALREADY_ENDED',
        },
      )
    }

    const overlapping =
      await findOverlappingCoverage(
        client,
        {
          pharmacyId:
            currentCoverage.pharmacy_id,

          startDate:
            normalizeDateValue(
              currentCoverage.start_date,
            ),

          endDate:
            normalizeDateValue(
              currentCoverage.end_date,
            ),

          excludeCoverageId:
            currentCoverage.id,

          includePending:
            false,
        },
      )

    if (overlapping) {
      throw new PharmacyCoverageError(
        'La unidad ya tiene otra cobertura aprobada dentro del mismo periodo',
        {
          status:
            409,

          code:
            'APPROVED_COVERAGE_OVERLAP',

          details: {
            coverageId:
              overlapping.id,

            startDate:
              normalizeDateValue(
                overlapping.start_date,
              ),

            endDate:
              normalizeDateValue(
                overlapping.end_date,
              ),
          },
        },
      )
    }

    await client.query(
      `
      UPDATE public.pharmacy_supervisor_coverage

      SET
        status =
          'APPROVED',

        reviewed_by =
          $2,

        reviewed_at =
          NOW(),

        review_comment =
          NULLIF(
            $3,
            ''
          )

      WHERE id =
        $1
      `,
      [
        coverageId,
        actor.id,
        normalizedComment,
      ],
    )

    const approvedCoverage =
      await loadCoverageById(
        client,
        coverageId,
      )

    await appendCoverageEvent(
      client,
      {
        coverage:
          approvedCoverage,

        eventType:
          'COVERAGE_APPROVED',

        actor,

        comment:
          normalizedComment,

        beforeData:
          currentCoverage,

        afterData:
          approvedCoverage,

        metadata: {
          channel:
            actor.channel ??
            'WEB',
        },
      },
    )

    await client.query(
      'COMMIT',
    )

    return {
      ok:
        true,

      action:
        'APPROVED',

      coverage:
        mapCoverage(
          approvedCoverage,
        ),
    }
  } catch (
    error
  ) {
    await rollbackSafely(
      client,
    )

    throw mapCoverageDatabaseError(
      error,
      'No fue posible aprobar la cobertura',
      'COVERAGE_APPROVE_FAILED',
    )
  } finally {
    client.release()
  }
}

// ============================================================
// RECHAZAR
// ============================================================

export async function rejectPharmacyCoverage({
  coverageId,
  comment,
  actor,
}) {
  validateManagerActor(
    actor,
  )

  validatePersonId(
    coverageId,
    'El identificador de la cobertura no es válido',
    'INVALID_COVERAGE_ID',
  )

  const normalizedComment =
    normalizeRequiredText(
      comment,
      'Debes indicar el motivo del rechazo',
      'COVERAGE_REJECTION_COMMENT_REQUIRED',
      2000,
      5,
    )

  const client =
    await pool.connect()

  try {
    await client.query(
      'BEGIN',
    )

    const currentCoverage =
      await loadCoverageForUpdate(
        client,
        coverageId,
      )

    await validateCoverageForManager({
      client,
      coverage:
        currentCoverage,

      actor,
    })

    if (
      currentCoverage.status !==
      'PENDING_APPROVAL'
    ) {
      throw new PharmacyCoverageError(
        'La cobertura ya no se encuentra pendiente de aprobación',
        {
          status:
            409,

          code:
            'COVERAGE_NOT_PENDING',
        },
      )
    }

    await client.query(
      `
      UPDATE public.pharmacy_supervisor_coverage

      SET
        status =
          'REJECTED',

        reviewed_by =
          $2,

        reviewed_at =
          NOW(),

        review_comment =
          $3

      WHERE id =
        $1
      `,
      [
        coverageId,
        actor.id,
        normalizedComment,
      ],
    )

    const rejectedCoverage =
      await loadCoverageById(
        client,
        coverageId,
      )

    await appendCoverageEvent(
      client,
      {
        coverage:
          rejectedCoverage,

        eventType:
          'COVERAGE_REJECTED',

        actor,

        comment:
          normalizedComment,

        beforeData:
          currentCoverage,

        afterData:
          rejectedCoverage,

        metadata: {
          channel:
            actor.channel ??
            'WEB',
        },
      },
    )

    await client.query(
      'COMMIT',
    )

    return {
      ok:
        true,

      action:
        'REJECTED',

      coverage:
        mapCoverage(
          rejectedCoverage,
        ),
    }
  } catch (
    error
  ) {
    await rollbackSafely(
      client,
    )

    throw mapCoverageDatabaseError(
      error,
      'No fue posible rechazar la cobertura',
      'COVERAGE_REJECT_FAILED',
    )
  } finally {
    client.release()
  }
}

// ============================================================
// CANCELAR
// ============================================================

export async function cancelPharmacyCoverage({
  coverageId,
  comment,
  actor,
}) {
  validateManagerActor(
    actor,
  )

  validatePersonId(
    coverageId,
    'El identificador de la cobertura no es válido',
    'INVALID_COVERAGE_ID',
  )

  const normalizedComment =
    normalizeRequiredText(
      comment,
      'Debes indicar el motivo de la cancelación',
      'COVERAGE_CANCELLATION_COMMENT_REQUIRED',
      2000,
      5,
    )

  const client =
    await pool.connect()

  try {
    await client.query(
      'BEGIN',
    )

    const currentCoverage =
      await loadCoverageForUpdate(
        client,
        coverageId,
      )

    await validateCoverageForManager({
      client,
      coverage:
        currentCoverage,

      actor,
    })

    if (
      currentCoverage.status !==
      'APPROVED'
    ) {
      throw new PharmacyCoverageError(
        'Solo pueden cancelarse coberturas aprobadas',
        {
          status:
            409,

          code:
            'COVERAGE_NOT_APPROVED',
        },
      )
    }

    if (
      normalizeDateValue(
        currentCoverage.end_date,
      ) <
      localTodayIso()
    ) {
      throw new PharmacyCoverageError(
        'La cobertura ya terminó y no requiere cancelación',
        {
          status:
            409,

          code:
            'COVERAGE_ALREADY_EXPIRED',
        },
      )
    }

    await client.query(
      `
      UPDATE public.pharmacy_supervisor_coverage

      SET
        status =
          'CANCELLED',

        cancelled_by =
          $2,

        cancelled_at =
          NOW(),

        cancellation_reason =
          $3

      WHERE id =
        $1
      `,
      [
        coverageId,
        actor.id,
        normalizedComment,
      ],
    )

    const cancelledCoverage =
      await loadCoverageById(
        client,
        coverageId,
      )

    await appendCoverageEvent(
      client,
      {
        coverage:
          cancelledCoverage,

        eventType:
          'COVERAGE_CANCELLED',

        actor,

        comment:
          normalizedComment,

        beforeData:
          currentCoverage,

        afterData:
          cancelledCoverage,

        metadata: {
          channel:
            actor.channel ??
            'WEB',
        },
      },
    )

    await client.query(
      'COMMIT',
    )

    return {
      ok:
        true,

      action:
        'CANCELLED',

      coverage:
        mapCoverage(
          cancelledCoverage,
        ),
    }
  } catch (
    error
  ) {
    await rollbackSafely(
      client,
    )

    throw mapCoverageDatabaseError(
      error,
      'No fue posible cancelar la cobertura',
      'COVERAGE_CANCEL_FAILED',
    )
  } finally {
    client.release()
  }
}

// ============================================================
// BLOQUEOS Y CONSULTAS
// ============================================================

async function lockCoverageKey(
  client,
  pharmacyId,
) {
  await client.query(
    `
    SELECT pg_advisory_xact_lock(
      hashtextextended(
        $1::text,
        0
      )
    )
    `,
    [
      `pharmacy-coverage:${pharmacyId}`,
    ],
  )
}

async function loadUnitForUpdate(
  client,
  pharmacyId,
) {
  const result =
    await client.query(
      `
      SELECT
        farmacia.id,
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
          AS pharmacy_status,

        territory.id
          AS territory_assignment_id,

        territory.coordinator_id,

        coordinator.nombre
          AS coordinator_name,

        coordinator.area::text
          AS coordinator_area,

        coordinator.rol::text
          AS coordinator_role,

        coordinator.activo
          AS coordinator_active,

        coordinator.superior_id
          AS coordinator_manager_id,

        titular_assignment.id
          AS titular_assignment_id,

        titular_assignment.supervisor_id
          AS titular_supervisor_id,

        titular.nombre
          AS titular_supervisor_name

      FROM public.farmacia
        farmacia

      LEFT JOIN public.pharmacy_coordinator_assignment
        territory

        ON territory.pharmacy_id =
          farmacia.id

        AND territory.revoked_at
          IS NULL

      LEFT JOIN public.personas
        coordinator

        ON coordinator.id =
          territory.coordinator_id

      LEFT JOIN LATERAL (
        SELECT
          assignment.id,
          assignment.supervisor_id

        FROM public.pharmacy_supervisor_assignment
          assignment

        WHERE assignment.pharmacy_id =
            farmacia.id

          AND assignment.revoked_at
            IS NULL

        ORDER BY
          assignment.assigned_at DESC

        LIMIT 1
      ) titular_assignment
        ON TRUE

      LEFT JOIN public.personas
        titular

        ON titular.id =
          titular_assignment.supervisor_id

      WHERE farmacia.id =
          $1

      FOR UPDATE OF farmacia
      `,
      [
        pharmacyId,
      ],
    )

  return (
    result.rows[0] ??
    null
  )
}

async function loadCoveringSupervisor(
  client,
  supervisorId,
  state,
) {
  const result =
    await client.query(
      `
      SELECT
        supervisor.id,

        supervisor.nombre
          AS supervisor_name,

        supervisor.area::text
          AS supervisor_area,

        supervisor.rol::text
          AS supervisor_role,

        supervisor.activo
          AS supervisor_active,

        supervisor.superior_id,

        supervisor.pharmacy_scope_mode,

        EXISTS (
          SELECT 1

          FROM public.person_state_scope
            state_scope

          WHERE state_scope.persona_id =
              supervisor.id

            AND state_scope.revoked_at
              IS NULL

            AND UPPER(
              BTRIM(
                state_scope.estado
              )
            ) =
            UPPER(
              BTRIM(
                $2::text
              )
            )
        ) AS has_state_scope

      FROM public.personas
        supervisor

      WHERE supervisor.id =
          $1

      LIMIT 1
      `,
      [
        supervisorId,
        state,
      ],
    )

  return (
    result.rows[0] ??
    null
  )
}

async function findOverlappingCoverage(
  client,
  {
    pharmacyId,
    startDate,
    endDate,
    excludeCoverageId = null,
    includePending = false,
  },
) {
  const statuses =
    includePending
      ? [
          'PENDING_APPROVAL',
          'APPROVED',
        ]
      : [
          'APPROVED',
        ]

  const result =
    await client.query(
      `
      SELECT
        id,
        status,
        start_date,
        end_date,
        covering_supervisor_id

      FROM public.pharmacy_supervisor_coverage

      WHERE pharmacy_id =
          $1

        AND status =
          ANY(
            $2::text[]
          )

        AND cancelled_at
          IS NULL

        AND daterange(
          start_date,
          end_date,
          '[]'
        )
        &&
        daterange(
          $3::date,
          $4::date,
          '[]'
        )

        AND (
          $5::uuid IS NULL
          OR id <>
            $5::uuid
        )

      ORDER BY
        start_date ASC

      LIMIT 1

      FOR UPDATE
      `,
      [
        pharmacyId,
        statuses,
        startDate,
        endDate,
        excludeCoverageId,
      ],
    )

  return (
    result.rows[0] ??
    null
  )
}

async function loadCoverageForUpdate(
  client,
  coverageId,
) {
  const result =
    await client.query(
      `
      SELECT
        coverage.*,

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
          AS pharmacy_status,

        coordinator.nombre
          AS coordinator_name,

        coordinator.superior_id
          AS coordinator_manager_id,

        titular.nombre
          AS titular_supervisor_name,

        covering.nombre
          AS covering_supervisor_name,

        requester.nombre
          AS requested_by_name,

        reviewer.nombre
          AS reviewed_by_name,

        canceller.nombre
          AS cancelled_by_name

      FROM public.pharmacy_supervisor_coverage
        coverage

      INNER JOIN public.farmacia
        farmacia

        ON farmacia.id =
          coverage.pharmacy_id

      INNER JOIN public.personas
        coordinator

        ON coordinator.id =
          coverage.coordinator_id

      LEFT JOIN public.personas
        titular

        ON titular.id =
          coverage.titular_supervisor_id

      INNER JOIN public.personas
        covering

        ON covering.id =
          coverage.covering_supervisor_id

      INNER JOIN public.personas
        requester

        ON requester.id =
          coverage.requested_by

      LEFT JOIN public.personas
        reviewer

        ON reviewer.id =
          coverage.reviewed_by

      LEFT JOIN public.personas
        canceller

        ON canceller.id =
          coverage.cancelled_by

      WHERE coverage.id =
          $1

      FOR UPDATE OF coverage
      `,
      [
        coverageId,
      ],
    )

  return (
    result.rows[0] ??
    null
  )
}

async function loadCoverageById(
  client,
  coverageId,
) {
  const result =
    await client.query(
      `
      SELECT
        coverage.*,

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
          AS pharmacy_status,

        coordinator.nombre
          AS coordinator_name,

        coordinator.superior_id
          AS coordinator_manager_id,

        titular.nombre
          AS titular_supervisor_name,

        covering.nombre
          AS covering_supervisor_name,

        requester.nombre
          AS requested_by_name,

        reviewer.nombre
          AS reviewed_by_name,

        canceller.nombre
          AS cancelled_by_name,

        CASE
          WHEN coverage.status =
            'APPROVED'
            AND CURRENT_DATE <
              coverage.start_date
          THEN 'SCHEDULED'

          WHEN coverage.status =
            'APPROVED'
            AND CURRENT_DATE BETWEEN
              coverage.start_date
              AND coverage.end_date
          THEN 'ACTIVE'

          WHEN coverage.status =
            'APPROVED'
            AND CURRENT_DATE >
              coverage.end_date
          THEN 'EXPIRED'

          ELSE coverage.status
        END AS effective_status

      FROM public.pharmacy_supervisor_coverage
        coverage

      INNER JOIN public.farmacia
        farmacia

        ON farmacia.id =
          coverage.pharmacy_id

      INNER JOIN public.personas
        coordinator

        ON coordinator.id =
          coverage.coordinator_id

      LEFT JOIN public.personas
        titular

        ON titular.id =
          coverage.titular_supervisor_id

      INNER JOIN public.personas
        covering

        ON covering.id =
          coverage.covering_supervisor_id

      INNER JOIN public.personas
        requester

        ON requester.id =
          coverage.requested_by

      LEFT JOIN public.personas
        reviewer

        ON reviewer.id =
          coverage.reviewed_by

      LEFT JOIN public.personas
        canceller

        ON canceller.id =
          coverage.cancelled_by

      WHERE coverage.id =
          $1

      LIMIT 1
      `,
      [
        coverageId,
      ],
    )

  return (
    result.rows[0] ??
    null
  )
}

// ============================================================
// AUTORIZACIÓN
// ============================================================

async function validateUnitForActor({
  client,
  unit,
  actor,
}) {
  if (!unit) {
    throw new PharmacyCoverageError(
      'La unidad no existe',
      {
        status:
          404,

        code:
          'PHARMACY_NOT_FOUND',
      },
    )
  }

  if (
    String(
      unit.pharmacy_status ??
      '',
    )
      .trim()
      .toUpperCase() ===
    'INACTIVA'
  ) {
    throw new PharmacyCoverageError(
      'No puede crearse una cobertura para una unidad inactiva',
      {
        status:
          409,

        code:
          'PHARMACY_INACTIVE',
      },
    )
  }

  if (
    !unit.territory_assignment_id ||
    !unit.coordinator_id
  ) {
    throw new PharmacyCoverageError(
      'La unidad no tiene territorio de coordinación activo',
      {
        status:
          409,

        code:
          'PHARMACY_WITHOUT_COORDINATOR',
      },
    )
  }

  if (
    unit.coordinator_area !==
      'FARMACIAS' ||
    unit.coordinator_role !==
      'COORDINADOR' ||
    !unit.coordinator_active
  ) {
    throw new PharmacyCoverageError(
      'El coordinador territorial no tiene un perfil activo válido',
      {
        status:
          409,

        code:
          'INVALID_COORDINATOR_TERRITORY',
      },
    )
  }

  if (
    actor.rol ===
      'COORDINADOR' &&
    unit.coordinator_id !==
      actor.id
  ) {
    throw new PharmacyCoverageError(
      'La unidad no pertenece al territorio del coordinador',
      {
        status:
          403,

        code:
          'PHARMACY_OUTSIDE_COORDINATOR_TERRITORY',
      },
    )
  }

  if (
    actor.rol ===
      'GERENTE' &&
    unit.coordinator_manager_id !==
      actor.id
  ) {
    throw new PharmacyCoverageError(
      'La unidad no pertenece a la estructura del gerente',
      {
        status:
          403,

        code:
          'PHARMACY_OUTSIDE_MANAGER_STRUCTURE',
      },
    )
  }

  const stateScope =
    await client.query(
      `
      SELECT 1

      FROM public.person_state_scope

      WHERE persona_id =
          $1

        AND revoked_at
          IS NULL

        AND UPPER(
          BTRIM(
            estado
          )
        ) =
        UPPER(
          BTRIM(
            $2::text
          )
        )

      LIMIT 1
      `,
      [
        actor.id,
        unit.estado,
      ],
    )

  if (
    stateScope.rowCount ===
    0
  ) {
    throw new PharmacyCoverageError(
      'El perfil no tiene ámbito activo en el estado de la unidad',
      {
        status:
          403,

        code:
          'ACTOR_STATE_SCOPE_NOT_ALLOWED',
      },
    )
  }
}

function validateCoveringSupervisor({
  supervisor,
  unit,
}) {
  if (!supervisor) {
    throw new PharmacyCoverageError(
      'El supervisor de cobertura no existe',
      {
        status:
          404,

        code:
          'COVERING_SUPERVISOR_NOT_FOUND',
      },
    )
  }

  if (!supervisor.supervisor_active) {
    throw new PharmacyCoverageError(
      'El supervisor de cobertura se encuentra inactivo',
      {
        status:
          409,

        code:
          'COVERING_SUPERVISOR_INACTIVE',
      },
    )
  }

  if (
    supervisor.supervisor_area !==
      'FARMACIAS' ||
    supervisor.supervisor_role !==
      'SUPERVISOR'
  ) {
    throw new PharmacyCoverageError(
      'La persona seleccionada no es supervisor de Farmacias',
      {
        status:
          409,

        code:
          'INVALID_COVERING_SUPERVISOR_PROFILE',
      },
    )
  }

  if (
    supervisor.superior_id !==
    unit.coordinator_id
  ) {
    throw new PharmacyCoverageError(
      'El supervisor de cobertura debe pertenecer al coordinador territorial de la unidad',
      {
        status:
          409,

        code:
          'COVERING_SUPERVISOR_OUTSIDE_TERRITORY',
      },
    )
  }

  if (
    supervisor.id ===
    unit.titular_supervisor_id
  ) {
    throw new PharmacyCoverageError(
      'El supervisor de cobertura no puede ser el mismo supervisor titular',
      {
        status:
          409,

        code:
          'COVERING_SUPERVISOR_IS_TITULAR',
      },
    )
  }

  if (
    !supervisor.has_state_scope
  ) {
    throw new PharmacyCoverageError(
      'El supervisor de cobertura no tiene ámbito activo en el estado',
      {
        status:
          409,

        code:
          'COVERING_SUPERVISOR_STATE_SCOPE_NOT_ALLOWED',
      },
    )
  }

  if (
    String(
      supervisor.pharmacy_scope_mode ??
      '',
    ).toUpperCase() !==
    'ASSIGNED_ONLY'
  ) {
    throw new PharmacyCoverageError(
      'El supervisor de cobertura debe utilizar el ámbito ASSIGNED_ONLY',
      {
        status:
          409,

        code:
          'COVERING_SUPERVISOR_SCOPE_NOT_RESTRICTED',
      },
    )
  }
}

async function validateCoverageForManager({
  client,
  coverage,
  actor,
}) {
  if (!coverage) {
    throw new PharmacyCoverageError(
      'La cobertura no existe',
      {
        status:
          404,

        code:
          'COVERAGE_NOT_FOUND',
      },
    )
  }

  if (
    coverage.coordinator_manager_id !==
    actor.id
  ) {
    throw new PharmacyCoverageError(
      'La cobertura no pertenece a la estructura del gerente',
      {
        status:
          403,

        code:
          'COVERAGE_OUTSIDE_MANAGER_STRUCTURE',
      },
    )
  }

  const stateScope =
    await client.query(
      `
      SELECT 1

      FROM public.person_state_scope

      WHERE persona_id =
          $1

        AND revoked_at
          IS NULL

        AND UPPER(
          BTRIM(
            estado
          )
        ) =
        UPPER(
          BTRIM(
            $2::text
          )
        )

      LIMIT 1
      `,
      [
        actor.id,
        coverage.estado,
      ],
    )

  if (
    stateScope.rowCount ===
    0
  ) {
    throw new PharmacyCoverageError(
      'El gerente no tiene ámbito en el estado de la cobertura',
      {
        status:
          403,

        code:
          'MANAGER_STATE_SCOPE_NOT_ALLOWED',
      },
    )
  }
}

// ============================================================
// EVENTOS
// ============================================================

async function appendCoverageEvent(
  client,
  {
    coverage,
    eventType,
    actor,
    comment,
    beforeData,
    afterData,
    metadata,
  },
) {
  await client.query(
    `
    INSERT INTO public.pharmacy_supervisor_coverage_event (
      coverage_id,
      pharmacy_id,
      coordinator_id,

      titular_supervisor_id,
      covering_supervisor_id,

      event_type,
      actor_id,
      comment,

      before_data,
      after_data,
      metadata
    )
    VALUES (
      $1,
      $2,
      $3,

      $4,
      $5,

      $6,
      $7,
      NULLIF(
        $8,
        ''
      ),

      $9::jsonb,
      $10::jsonb,
      $11::jsonb
    )
    `,
    [
      coverage.id,
      coverage.pharmacy_id,
      coverage.coordinator_id,

      coverage.titular_supervisor_id,
      coverage.covering_supervisor_id,

      eventType,
      actor.id,
      comment ?? null,

      beforeData
        ? JSON.stringify(
            beforeData,
          )
        : null,

      afterData
        ? JSON.stringify(
            afterData,
          )
        : null,

      JSON.stringify(
        metadata ??
        {},
      ),
    ],
  )
}

// ============================================================
// VALIDACIONES GENERALES
// ============================================================

function validateActor(
  actor,
) {
  if (
    !actor?.id ||
    String(
      actor.area ??
      '',
    )
      .trim()
      .toUpperCase() !==
      'FARMACIAS' ||
    !ALLOWED_ROLES.has(
      String(
        actor.rol ??
        '',
      )
        .trim()
        .toUpperCase(),
    )
  ) {
    throw new PharmacyCoverageError(
      'El perfil no tiene autorización para gestionar coberturas',
      {
        status:
          403,

        code:
          'COVERAGE_ROLE_NOT_ALLOWED',
      },
    )
  }
}

function validateManagerActor(
  actor,
) {
  validateActor(
    actor,
  )

  if (
    actor.rol !==
    'GERENTE'
  ) {
    throw new PharmacyCoverageError(
      'Esta operación está disponible únicamente para gerentes',
      {
        status:
          403,

        code:
          'MANAGER_ROLE_REQUIRED',
      },
    )
  }
}

function validatePharmacyId(
  value,
) {
  if (
    !BIGINT_PATTERN.test(
      String(
        value ??
        '',
      ),
    )
  ) {
    throw new PharmacyCoverageError(
      'El identificador de la unidad no es válido',
      {
        status:
          400,

        code:
          'INVALID_PHARMACY_ID',
      },
    )
  }
}

function validatePersonId(
  value,
  message,
  code,
) {
  if (
    !UUID_PATTERN.test(
      String(
        value ??
        '',
      ),
    )
  ) {
    throw new PharmacyCoverageError(
      message,
      {
        status:
          400,

        code,
      },
    )
  }
}

function validateNewCoverageDates({
  startDate,
  endDate,
}) {
  const normalizedStart =
    normalizeIsoDate(
      startDate,
      'La fecha inicial no es válida',
      'INVALID_COVERAGE_START_DATE',
    )

  const normalizedEnd =
    normalizeIsoDate(
      endDate,
      'La fecha final no es válida',
      'INVALID_COVERAGE_END_DATE',
    )

  if (
    normalizedEnd <
    normalizedStart
  ) {
    throw new PharmacyCoverageError(
      'La fecha final no puede ser anterior a la fecha inicial',
      {
        status:
          400,

        code:
          'INVALID_COVERAGE_PERIOD',
      },
    )
  }

  if (
    normalizedStart <
    localTodayIso()
  ) {
    throw new PharmacyCoverageError(
      'La cobertura no puede iniciar en una fecha anterior a hoy',
      {
        status:
          400,

        code:
          'COVERAGE_START_DATE_IN_PAST',
      },
    )
  }

  if (
    differenceInDays(
      normalizedStart,
      normalizedEnd,
    ) >
    366
  ) {
    throw new PharmacyCoverageError(
      'La cobertura no puede superar 366 días',
      {
        status:
          400,

        code:
          'COVERAGE_PERIOD_TOO_LARGE',
      },
    )
  }

  return {
    startDate:
      normalizedStart,

    endDate:
      normalizedEnd,
  }
}

function normalizeIsoDate(
  value,
  message,
  code,
) {
  const normalized =
    String(
      value ??
      '',
    )
      .trim()
      .slice(
        0,
        10,
      )

  if (
    !ISO_DATE_PATTERN.test(
      normalized,
    )
  ) {
    throw new PharmacyCoverageError(
      message,
      {
        status:
          400,

        code,
      },
    )
  }

  const parsed =
    new Date(
      `${normalized}T00:00:00.000Z`,
    )

  if (
    Number.isNaN(
      parsed.getTime(),
    ) ||
    parsed
      .toISOString()
      .slice(
        0,
        10,
      ) !==
      normalized
  ) {
    throw new PharmacyCoverageError(
      message,
      {
        status:
          400,

        code,
      },
    )
  }

  return normalized
}

function normalizeRequiredText(
  value,
  message,
  code,
  maxLength,
  minLength = 1,
) {
  const normalized =
    String(
      value ??
      '',
    ).trim()

  if (
    normalized.length <
    minLength
  ) {
    throw new PharmacyCoverageError(
      message,
      {
        status:
          400,

        code,
      },
    )
  }

  if (
    normalized.length >
    maxLength
  ) {
    throw new PharmacyCoverageError(
      `El texto no puede superar ${maxLength} caracteres`,
      {
        status:
          400,

        code:
          `${code}_TOO_LONG`,
      },
    )
  }

  return normalized
}

function normalizeOptionalText(
  value,
  maxLength,
  message,
  code,
) {
  const normalized =
    String(
      value ??
      '',
    ).trim()

  if (
    normalized.length >
    maxLength
  ) {
    throw new PharmacyCoverageError(
      message,
      {
        status:
          400,

        code,
      },
    )
  }

  return normalized
}

function differenceInDays(
  start,
  end,
) {
  const startDate =
    new Date(
      `${start}T00:00:00.000Z`,
    )

  const endDate =
    new Date(
      `${end}T00:00:00.000Z`,
    )

  return Math.floor(
    (
      endDate.getTime() -
      startDate.getTime()
    ) /
    86400000,
  )
}

function localTodayIso() {
  const now =
    new Date()

  const year =
    now.getFullYear()

  const month =
    String(
      now.getMonth() +
      1,
    ).padStart(
      2,
      '0',
    )

  const day =
    String(
      now.getDate(),
    ).padStart(
      2,
      '0',
    )

  return `${year}-${month}-${day}`
}

// ============================================================
// RESPUESTAS
// ============================================================

function mapCoverage(
  row,
) {
  const status =
    row.status

  let effectiveStatus =
    row.effective_status ??
    status

  if (
    status ===
    'APPROVED' &&
    !row.effective_status
  ) {
    const today =
      localTodayIso()

    const start =
      normalizeDateValue(
        row.start_date,
      )

    const end =
      normalizeDateValue(
        row.end_date,
      )

    if (
      today <
      start
    ) {
      effectiveStatus =
        'SCHEDULED'
    } else if (
      today >
      end
    ) {
      effectiveStatus =
        'EXPIRED'
    } else {
      effectiveStatus =
        'ACTIVE'
    }
  }

  return {
    id:
      row.id,

    pharmacyId:
      String(
        row.pharmacy_id,
      ),

    clues:
      row.clues,

    pharmacyName:
      row.pharmacy_name,

    pharmacyStatus:
      row.pharmacy_status,

    state:
      row.estado,

    region:
      row.region_sanitaria,

    project:
      row.proyecto,

    coordinatorId:
      row.coordinator_id,

    coordinatorName:
      row.coordinator_name,

    titularSupervisorId:
      row.titular_supervisor_id,

    titularSupervisorName:
      row.titular_supervisor_name,

    coveringSupervisorId:
      row.covering_supervisor_id,

    coveringSupervisorName:
      row.covering_supervisor_name,

    startDate:
      normalizeDateValue(
        row.start_date,
      ),

    endDate:
      normalizeDateValue(
        row.end_date,
      ),

    status,

    effectiveStatus,

    requestSource:
      row.request_source,

    requestedBy:
      row.requested_by,

    requestedByName:
      row.requested_by_name,

    requestedAt:
      row.requested_at,

    requestComment:
      row.request_comment,

    reviewedBy:
      row.reviewed_by,

    reviewedByName:
      row.reviewed_by_name,

    reviewedAt:
      row.reviewed_at,

    reviewComment:
      row.review_comment,

    cancelledBy:
      row.cancelled_by,

    cancelledByName:
      row.cancelled_by_name,

    cancelledAt:
      row.cancelled_at,

    cancellationReason:
      row.cancellation_reason,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  }
}

function buildTotals(
  coverages,
) {
  return {
    total:
      coverages.length,

    pending:
      coverages.filter(
        coverage =>
          coverage.status ===
          'PENDING_APPROVAL',
      ).length,

    scheduled:
      coverages.filter(
        coverage =>
          coverage.effectiveStatus ===
          'SCHEDULED',
      ).length,

    active:
      coverages.filter(
        coverage =>
          coverage.effectiveStatus ===
          'ACTIVE',
      ).length,

    expired:
      coverages.filter(
        coverage =>
          coverage.effectiveStatus ===
          'EXPIRED',
      ).length,

    rejected:
      coverages.filter(
        coverage =>
          coverage.status ===
          'REJECTED',
      ).length,

    cancelled:
      coverages.filter(
        coverage =>
          coverage.status ===
          'CANCELLED',
      ).length,
  }
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

function mapCoverageDatabaseError(
  error,
  fallbackMessage,
  fallbackCode,
) {
  if (
    error instanceof
    PharmacyCoverageError
  ) {
    return error
  }

  if (
    error?.code ===
    '23P01'
  ) {
    return new PharmacyCoverageError(
      'La unidad ya tiene una cobertura aprobada que se cruza con el periodo solicitado',
      {
        status:
          409,

        code:
          'APPROVED_COVERAGE_OVERLAP',
      },
    )
  }

  if (
    error?.code ===
    '23514'
  ) {
    return new PharmacyCoverageError(
      'Los datos de la cobertura no cumplen las reglas del sistema',
      {
        status:
          409,

        code:
          'COVERAGE_CONSTRAINT_FAILED',
      },
    )
  }

  console.error(
    '[pharmacyCoverage.service]',
    error,
  )

  return new PharmacyCoverageError(
    fallbackMessage,
    {
      status:
        500,

      code:
        fallbackCode,
    },
  )
}

async function rollbackSafely(
  client,
) {
  try {
    await client.query(
      'ROLLBACK',
    )
  } catch (
    rollbackError
  ) {
    console.error(
      '[pharmacyCoverage.service][rollback]',
      rollbackError,
    )
  }
}
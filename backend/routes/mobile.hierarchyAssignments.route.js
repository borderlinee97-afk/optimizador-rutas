import {
  Router,
} from 'express'

import {
  pool,
} from '../db/pool.js'

import {
  requireAuth,
} from '../middleware/requireAuth.js'

import {
  appendWorkPlanEvent,
} from '../services/workPlanAudit.service.js'

import {
  getPharmacyAccess,
} from '../services/pharmacyAccess.service.js'

const router =
  Router()

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const BIGINT_PATTERN =
  /^\d+$/

const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/

const TIME_PATTERN =
  /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/

const ALLOWED_DESTINATION_TYPES =
  new Set([
    'PHARMACY',
    'FREE_POINT',
  ])

const ALLOWED_CATEGORIES =
  new Set([
    'DOCUMENT_DELIVERY',
    'SERVICE_PAYMENT',
    'MATERIAL_PICKUP',
    'ADMINISTRATIVE_PROCEDURE',
    'OPERATIONAL_SUPPORT',
    'OTHER',
  ])

router.use(
  requireAuth,
)

router.use(
  loadHierarchyProfile,
)

router.use(
  requireHierarchyAssigner,
)

/**
 * ============================================================
 * GET
 * /api/mobile/hierarchy-assignments/team
 *
 * COORDINADOR:
 * - devuelve Supervisores directos.
 *
 * GERENTE:
 * - devuelve Coordinadores directos.
 * ============================================================
 */
router.get(
  '/team',
  async (
    req,
    res,
  ) => {
    try {
      const targetRole =
        getTargetRole(
          req.profile.rol,
        )

      const result =
        await pool.query(
          `
          SELECT
            id,
            nombre,

            area::text
              AS area,

            rol::text
              AS rol,

            activo,
            superior_id,
            pharmacy_scope_mode

          FROM public.personas

          WHERE area::text =
              'FARMACIAS'

            AND rol::text =
              $1

            AND activo =
              TRUE

            AND superior_id =
              $2::uuid

          ORDER BY
            nombre ASC
          `,
          [
            targetRole,
            req.profile.id,
          ],
        )

      return res.json({
        role:
          req.profile.rol,

        targetRole,

        members:
          result.rows.map(
            mapTeamMember,
          ),
      })
    } catch (
      error
    ) {
      console.error(
        '[mobile.hierarchy-assignments][team]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'No fue posible obtener el equipo disponible',

          code:
            'HIERARCHY_TEAM_FETCH_FAILED',
        })
    }
  },
)

/**
 * ============================================================
 * GET
 * /api/mobile/hierarchy-assignments/pharmacies
 *
 * Catálogo para una asignación jerárquica.
 *
 * COORDINADOR -> SUPERVISOR:
 * - sólo devuelve farmacias a las que el Supervisor
 *   tiene acceso operativo en la fecha indicada.
 *
 * GERENTE -> COORDINADOR:
 * - la asignación del Gerente es autoritativa;
 *   únicamente se valida que la farmacia exista.
 * ============================================================
 */
router.get(
  '/pharmacies',
  async (
    req,
    res,
  ) => {
    const targetPersonId =
      normalizeText(
        req.query.targetPersonId,
      )

    const scheduledDate =
      normalizeDateValue(
        req.query.scheduledDate,
      )

    const search =
      normalizeText(
        req.query.search,
      )

    const rawLimit =
      Number(
        req.query.limit ??
        20,
      )

    if (
      !UUID_PATTERN.test(
        targetPersonId,
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            'La persona seleccionada no es válida',

          code:
            'INVALID_TARGET_PERSON_ID',
        })
    }

    if (
      !ISO_DATE_PATTERN.test(
        scheduledDate,
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            'La fecha programada no es válida',

          code:
            'INVALID_SCHEDULED_DATE',
        })
    }

    if (
      search.length <
      2
    ) {
      return res
        .status(400)
        .json({
          error:
            'Escribe al menos 2 caracteres para buscar una farmacia',

          code:
            'PHARMACY_SEARCH_REQUIRED',
        })
    }

    if (
      search.length >
      150
    ) {
      return res
        .status(400)
        .json({
          error:
            'La búsqueda no puede superar 150 caracteres',

          code:
            'PHARMACY_SEARCH_TOO_LONG',
        })
    }

    if (
      !Number.isInteger(
        rawLimit,
      ) ||
      rawLimit <
        1 ||
      rawLimit >
        30
    ) {
      return res
        .status(400)
        .json({
          error:
            'El límite solicitado no es válido',

          code:
            'INVALID_PHARMACY_SEARCH_LIMIT',
        })
    }

    try {
      const target =
        await findDirectTarget({
          actorId:
            req.profile.id,

          actorRole:
            req.profile.rol,

          targetPersonId,
        })

      if (!target) {
        return res
          .status(404)
          .json({
            error:
              'La persona seleccionada no pertenece directamente a tu estructura',

            code:
              'HIERARCHY_TARGET_NOT_FOUND',
          })
      }

      /*
       * Recuperamos una ventana suficientemente amplia
       * y después aplicamos getPharmacyAccess cuando
       * el destinatario es Supervisor.
       */
      const candidateLimit =
        target.rol ===
        'SUPERVISOR'
          ? 200
          : rawLimit

      const result =
        await pool.query(
          `
          SELECT
            f.id,
            f.clues,
            f.unidad,
            f.direccion,
            f.region_sanitaria,
            f.proyecto,
            f.estado,

            f.estatus::text
              AS estatus,

            f.latitud::double precision
              AS latitud,

            f.longitud::double precision
              AS longitud

          FROM public.farmacia f

          WHERE
            f.id::text ILIKE
              '%' || $1 || '%'

            OR COALESCE(
              f.clues,
              ''
            ) ILIKE
              '%' || $1 || '%'

            OR COALESCE(
              f.unidad,
              ''
            ) ILIKE
              '%' || $1 || '%'

            OR COALESCE(
              f.direccion,
              ''
            ) ILIKE
              '%' || $1 || '%'

            OR COALESCE(
              f.region_sanitaria,
              ''
            ) ILIKE
              '%' || $1 || '%'

            OR COALESCE(
              f.proyecto,
              ''
            ) ILIKE
              '%' || $1 || '%'

          ORDER BY
            f.unidad ASC
              NULLS LAST,

            f.clues ASC

          LIMIT $2
          `,
          [
            search,
            candidateLimit,
          ],
        )

      let pharmacies =
        result.rows

      if (
        target.rol ===
        'SUPERVISOR'
      ) {
        const allowed = []

        for (
          const pharmacy
          of pharmacies
        ) {
          const access =
            await getPharmacyAccess(
              pool,
              {
                pharmacyId:
                  pharmacy.id,

                profile:
                  target,

                accessDate:
                  scheduledDate,
              },
            )

          if (
            access.exists &&
            access.allowed
          ) {
            allowed.push(
              pharmacy,
            )
          }

          if (
            allowed.length >=
            rawLimit
          ) {
            break
          }
        }

        pharmacies =
          allowed
      } else {
        pharmacies =
          pharmacies.slice(
            0,
            rawLimit,
          )
      }

      return res.json({
        target: {
          id:
            target.id,

          name:
            target.nombre,

          role:
            target.rol,
        },

        scheduledDate,

        count:
          pharmacies.length,

        pharmacies:
          pharmacies.map(
            mapHierarchyPharmacy,
          ),
      })
    } catch (
      error
    ) {
      console.error(
        '[mobile.hierarchy-assignments][pharmacies]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'No fue posible obtener las farmacias disponibles',

          code:
            'HIERARCHY_PHARMACIES_FETCH_FAILED',
        })
    }
  },
)

/**
 * ============================================================
 * POST
 * /api/mobile/hierarchy-assignments/visits
 *
 * FARMACIA:
 *
 * {
 *   targetPersonId: "uuid",
 *   destinationType: "PHARMACY",
 *   pharmacyId: "123",
 *   scheduledDate: "2026-09-26",
 *   scheduledTime: "10:30",
 *   instruction: "Realizar visita de seguimiento"
 * }
 *
 * PUNTO LIBRE:
 *
 * {
 *   targetPersonId: "uuid",
 *   destinationType: "FREE_POINT",
 *   scheduledDate: "2026-09-26",
 *   scheduledTime: "10:30",
 *   instruction: "Entregar documentación",
 *
 *   name: "Secretaría de Salud",
 *   address: "Av. ...",
 *   googlePlaceId: "...",
 *   lat: 20.123456,
 *   lng: -103.123456,
 *
 *   category: "DOCUMENT_DELIVERY",
 *   estimatedMinutes: 30
 * }
 * ============================================================
 */
router.post(
  '/visits',
  async (
    req,
    res,
  ) => {
    const payload =
      parseAssignmentPayload(
        req.body,
      )

    if (!payload.ok) {
      return res
        .status(
          payload.status,
        )
        .json(
          payload.response,
        )
    }

    const client =
      await pool.connect()

    try {
      await client.query(
        'BEGIN',
      )

      /**
       * Bloqueamos al subordinado directo.
       *
       * Además de validar jerarquía,
       * serializa asignaciones simultáneas
       * para la misma persona.
       */
      const target =
        await lockDirectTarget(
          client,
          {
            actorId:
              req.profile.id,

            actorRole:
              req.profile.rol,

            targetPersonId:
              payload.value
                .targetPersonId,
          },
        )

      if (!target) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(404)
          .json({
            error:
              'La persona seleccionada no pertenece directamente a tu estructura',

            code:
              'HIERARCHY_TARGET_NOT_FOUND',
          })
      }

      /**
       * Resolver el destino.
       *
       * PHARMACY:
       * valida existencia y, cuando el
       * destinatario es Supervisor, también
       * su alcance operativo.
       *
       * FREE_POINT:
       * utiliza nombre + coordenadas +
       * datos opcionales de Google Maps.
       */
      const destinationResult =
        await resolveDestination(
          client,
          {
            payload:
              payload.value,

            target,
          },
        )

      if (
        !destinationResult.ok
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(
            destinationResult.status,
          )
          .json(
            destinationResult.response,
          )
      }

      const destination =
        destinationResult.destination

      /**
       * Buscar primero un plan APPROVED
       * ya existente que cubra la fecha.
       */
      let plan =
        await findApprovedPlanForDate(
          client,
          {
            targetPersonId:
              target.id,

            scheduledDate:
              payload.value
                .scheduledDate,
          },
        )

      let createdOperationalContainer =
        false

      /**
       * Si no existe plan APPROVED,
       * creamos un EXTRAORDINARY APPROVED
       * para ese día.
       *
       * Es un contenedor operacional:
       * no requiere aprobación del subordinado.
       */
      if (!plan) {
        plan =
          await createApprovedOperationalContainer(
            client,
            {
              target,

              scheduledDate:
                payload.value
                  .scheduledDate,

              actor:
                req.profile,
            },
          )

        createdOperationalContainer =
          true
      }

      /**
       * Evitar asignación duplicada evidente.
       */
      const duplicate =
        await findDuplicateAssignment(
          client,
          {
            targetPersonId:
              target.id,

            payload:
              payload.value,
          },
        )

      if (duplicate) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(409)
          .json({
            error:
              'La persona ya tiene una visita equivalente activa para esa fecha',

            code:
              'HIERARCHY_VISIT_ALREADY_EXISTS',

            itemId:
              duplicate.id,
          })
      }

      /**
       * Obtener siguiente orden para el día.
       */
      const orderResult =
        await client.query(
          `
          SELECT
            COALESCE(
              MAX(ord),
              0
            ) + 1
              AS next_order

          FROM public.work_plan_item

          WHERE plan_id =
              $1::uuid

            AND scheduled_date =
              $2::date

            AND removed_at
              IS NULL
          `,
          [
            plan.id,

            payload.value
              .scheduledDate,
          ],
        )

      const nextOrder =
        Number(
          orderResult
            .rows[0]
            .next_order,
        )

      /**
       * Insertar asignación.
       *
       * PHARMACY:
       * item_type = PHARMACY
       *
       * FREE_POINT:
       * item_type = EXTRA_STOP
       *
       * Ambos:
       * source = HIERARCHY_ASSIGNED
       */
      const itemValues =
        buildItemValues(
          payload.value,
        )

      const insertResult =
        await client.query(
          `
          INSERT INTO public.work_plan_item (
            plan_id,
            pharmacy_id,

            scheduled_date,
            scheduled_time,

            ord,
            required,
            status,

            item_type,
            source,

            custom_name,
            custom_address,
            google_place_id,
            custom_lat,
            custom_lng,

            activity_category,
            addition_reason,
            estimated_minutes,

            added_by,
            added_at,

            updated_by,
            updated_at
          )
          VALUES (
            $1::uuid,
            $2,

            $3::date,
            $4,

            $5,
            TRUE,
            'PENDING',

            $6,
            'HIERARCHY_ASSIGNED',

            $7,
            $8,
            $9,
            $10,
            $11,

            $12,
            $13,
            $14,

            $15::uuid,
            NOW(),

            $15::uuid,
            NOW()
          )

          RETURNING *
          `,
          [
            plan.id,

            itemValues
              .pharmacyId,

            payload.value
              .scheduledDate,

            payload.value
              .scheduledTime,

            nextOrder,

            itemValues
              .itemType,

            itemValues
              .customName,

            itemValues
              .customAddress,

            itemValues
              .googlePlaceId,

            itemValues
              .customLat,

            itemValues
              .customLng,

            itemValues
              .activityCategory,

            payload.value
              .instruction,

            itemValues
              .estimatedMinutes,

            req.profile.id,
          ],
        )

      const insertedItem =
        insertResult.rows[0]

      /**
       * El plan se mantiene APPROVED.
       * Sólo registramos actualización
       * operacional.
       */
      await client.query(
        `
        UPDATE public.work_plan

        SET
          updated_by =
            $2::uuid,

          updated_at =
            NOW()

        WHERE id =
          $1::uuid
        `,
        [
          plan.id,
          req.profile.id,
        ],
      )

      const completeItem =
        await getAssignedItem(
          client,
          insertedItem.id,
        )

      /**
       * Auditoría.
       *
       * Usamos ITEM_CREATED, que ya existe
       * en el sistema.
       *
       * metadata identifica que fue
       * una asignación jerárquica.
       */
      await appendWorkPlanEvent(
        client,
        {
          planId:
            plan.id,

          entityType:
            'PLAN_ITEM',

          entityId:
            insertedItem.id,

          revisionNumber:
            Number(
              plan.revision_number ??
              0,
            ),

          eventType:
            'ITEM_CREATED',

          actor:
            req.profile,

          previousStatus:
            null,

          newStatus:
            'PENDING',

          comment:
            payload.value
              .instruction,

          afterData:
            completeItem,

          metadata: {
            assignmentType:
              'HIERARCHY_ASSIGNED',

            destinationType:
              payload.value
                .destinationType,

            targetPersonId:
              target.id,

            targetPersonName:
              target.nombre,

            targetRole:
              target.rol,

            assignedById:
              req.profile.id,

            assignedByName:
              req.profile.nombre,

            assignedByRole:
              req.profile.rol,

            pharmacyId:
              destination
                .pharmacyId,

            googlePlaceId:
              destination
                .googlePlaceId,

            latitude:
              destination.lat,

            longitude:
              destination.lng,

            scheduledDate:
              payload.value
                .scheduledDate,

            createdOperationalContainer,
          },
        },
      )

      await client.query(
        'COMMIT',
      )

      return res
        .status(201)
        .json({
          ok:
            true,

          assignmentType:
            'HIERARCHY_ASSIGNED',

          destinationType:
            payload.value
              .destinationType,

          target: {
            id:
              target.id,

            name:
              target.nombre,

            role:
              target.rol,
          },

          plan: {
            id:
              plan.id,

            type:
              plan.plan_type,

            status:
              plan.status,

            periodStart:
              normalizeDateValue(
                plan.period_start,
              ),

            periodEnd:
              normalizeDateValue(
                plan.period_end,
              ),

            createdOperationalContainer,
          },

          item:
            mapAssignedItem(
              completeItem,
            ),
        })
    } catch (
      error
    ) {
      await rollbackSafely(
        client,
      )

      console.error(
        '[mobile.hierarchy-assignments][visits]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'No fue posible asignar la visita',

          code:
            'HIERARCHY_VISIT_ASSIGNMENT_FAILED',
        })
    } finally {
      client.release()
    }
  },
)

/**
 * ============================================================
 * PERFIL AUTENTICADO
 * ============================================================
 */
async function loadHierarchyProfile(
  req,
  res,
  next,
) {
  try {
    const result =
      await pool.query(
        `
        SELECT
          id,
          nombre,

          area::text
            AS area,

          rol::text
            AS rol,

          activo,
          superior_id,
          pharmacy_scope_mode

        FROM public.personas

        WHERE auth_user_id =
          $1

        LIMIT 1
        `,
        [
          req.auth.user.id,
        ],
      )

    if (
      result.rowCount ===
      0
    ) {
      return res
        .status(403)
        .json({
          error:
            'La cuenta no tiene un perfil operativo vinculado',

          code:
            'PROFILE_NOT_FOUND',
        })
    }

    const profile =
      result.rows[0]

    if (!profile.activo) {
      return res
        .status(403)
        .json({
          error:
            'El perfil operativo se encuentra inactivo',

          code:
            'PROFILE_INACTIVE',
        })
    }

    const area =
      String(
        profile.area ??
        '',
      )
        .trim()
        .toUpperCase()

    const role =
      String(
        profile.rol ??
        '',
      )
        .trim()
        .toUpperCase()

    if (
      area !==
      'FARMACIAS'
    ) {
      return res
        .status(403)
        .json({
          error:
            'Esta función está disponible únicamente para Farmacias',

          code:
            'AREA_NOT_ALLOWED',
        })
    }

    req.profile = {
      ...profile,

      area,

      rol:
        role,
    }

    return next()
  } catch (
    error
  ) {
    console.error(
      '[mobile.hierarchy-assignments][profile]',
      error,
    )

    return res
      .status(500)
      .json({
        error:
          'No fue posible validar el perfil operativo',

        code:
          'PROFILE_VALIDATION_FAILED',
      })
  }
}

/**
 * ============================================================
 * ROLES QUE PUEDEN ASIGNAR
 * ============================================================
 */
function requireHierarchyAssigner(
  req,
  res,
  next,
) {
  if (
    ![
      'COORDINADOR',
      'GERENTE',
    ].includes(
      req.profile?.rol,
    )
  ) {
    return res
      .status(403)
      .json({
        error:
          'Tu rol no puede asignar visitas jerárquicas desde la aplicación móvil',

        code:
          'HIERARCHY_ASSIGNMENT_ROLE_REQUIRED',
      })
  }

  return next()
}


/**
 * ============================================================
 * SUBORDINADO DIRECTO
 * ============================================================
 */

async function findDirectTarget({
  actorId,
  actorRole,
  targetPersonId,
}) {
  const targetRole =
    getTargetRole(
      actorRole,
    )

  const result =
    await pool.query(
      `
      SELECT
        id,
        nombre,

        area::text
          AS area,

        rol::text
          AS rol,

        activo,
        superior_id,
        pharmacy_scope_mode

      FROM public.personas

      WHERE id =
          $1::uuid

        AND id <> $2::uuid
        AND superior_id =
          $2::uuid

        AND area::text =
          'FARMACIAS'

        AND rol::text =
          $3

        AND activo =
          TRUE

      LIMIT 1
      `,
      [
        targetPersonId,
        actorId,
        targetRole,
      ],
    )

  return (
    result.rows[0] ??
    null
  )
}

async function lockDirectTarget(
  client,
  {
    actorId,
    actorRole,
    targetPersonId,
  },
) {
  const targetRole =
    getTargetRole(
      actorRole,
    )

  const result =
    await client.query(
      `
      SELECT
        id,
        nombre,

        area::text
          AS area,

        rol::text
          AS rol,

        activo,
        superior_id,
        pharmacy_scope_mode

      FROM public.personas

      WHERE id =
          $1::uuid

        AND id <> $2::uuid
        AND superior_id =
          $2::uuid

        AND area::text =
          'FARMACIAS'

        AND rol::text =
          $3

        AND activo =
          TRUE

      LIMIT 1

      FOR UPDATE
      `,
      [
        targetPersonId,
        actorId,
        targetRole,
      ],
    )

  return (
    result.rows[0] ??
    null
  )
}

function getTargetRole(
  actorRole,
) {
  if (
    actorRole ===
    'COORDINADOR'
  ) {
    return 'SUPERVISOR'
  }

  if (
    actorRole ===
    'GERENTE'
  ) {
    return 'COORDINADOR'
  }

  return null
}

/**
 * ============================================================
 * DESTINO
 * ============================================================
 */
async function resolveDestination(
  client,
  {
    payload,
    target,
  },
) {
  if (
    payload.destinationType ===
    'FREE_POINT'
  ) {
    return {
      ok:
        true,

      destination: {
        pharmacyId:
          null,

        googlePlaceId:
          payload.googlePlaceId,

        name:
          payload.name,

        address:
          payload.address,

        lat:
          payload.lat,

        lng:
          payload.lng,
      },
    }
  }

  return resolvePharmacyDestination(
    client,
    {
      pharmacyId:
        payload.pharmacyId,

      target,

      scheduledDate:
        payload.scheduledDate,
    },
  )
}

async function resolvePharmacyDestination(
  client,
  {
    pharmacyId,
    target,
    scheduledDate,
  },
) {
  /**
   * Para Supervisor usamos las mismas
   * reglas de asignación permanente /
   * cobertura temporal existentes.
   */
  if (
    target.rol ===
    'SUPERVISOR'
  ) {
    const access =
      await getPharmacyAccess(
        client,
        {
          pharmacyId,

          profile:
            target,

          accessDate:
            scheduledDate,
        },
      )

    if (!access.exists) {
      return {
        ok:
          false,

        status:
          404,

        response: {
          error:
            'La farmacia seleccionada no existe',

          code:
            'PHARMACY_NOT_FOUND',
        },
      }
    }

    if (!access.allowed) {
      return {
        ok:
          false,

        status:
          403,

        response: {
          error:
            'El Supervisor seleccionado no tiene acceso operativo a esa farmacia en la fecha indicada',

          code:
            'TARGET_PHARMACY_ACCESS_DENIED',
        },
      }
    }

    return {
      ok:
        true,

      destination: {
        pharmacyId:
          String(
            access.pharmacy.id,
          ),

        googlePlaceId:
          null,

        name:
          access.pharmacy.unidad ??
          access.pharmacy.clues ??
          null,

        address:
          access.pharmacy.direccion ??
          null,

        lat:
          access.pharmacy.latitud ===
            null ||
          access.pharmacy.latitud ===
            undefined
            ? null
            : Number(
                access.pharmacy
                  .latitud,
              ),

        lng:
          access.pharmacy.longitud ===
            null ||
          access.pharmacy.longitud ===
            undefined
            ? null
            : Number(
                access.pharmacy
                  .longitud,
              ),

        pharmacy:
          access.pharmacy,
      },
    }
  }

  /**
   * Coordinador:
   *
   * No existe actualmente el mismo
   * modelo de pharmacy_supervisor_assignment
   * para Coordinadores.
   *
   * La asignación del Gerente es
   * autoritativa; aquí sólo verificamos
   * que la farmacia exista.
   */
  const result =
    await client.query(
      `
      SELECT
        id,
        clues,
        unidad,
        direccion,
        region_sanitaria,
        proyecto,
        estado,

        estatus::text
          AS estatus,

        latitud,
        longitud

      FROM public.farmacia

      WHERE id =
        $1

      LIMIT 1
      `,
      [
        pharmacyId,
      ],
    )

  if (
    result.rowCount ===
    0
  ) {
    return {
      ok:
        false,

      status:
        404,

      response: {
        error:
          'La farmacia seleccionada no existe',

        code:
          'PHARMACY_NOT_FOUND',
      },
    }
  }

  const pharmacy =
    result.rows[0]

  return {
    ok:
      true,

    destination: {
      pharmacyId:
        String(
          pharmacy.id,
        ),

      googlePlaceId:
        null,

      name:
        pharmacy.unidad ??
        pharmacy.clues ??
        null,

      address:
        pharmacy.direccion ??
        null,

      lat:
        pharmacy.latitud ===
          null ||
        pharmacy.latitud ===
          undefined
          ? null
          : Number(
              pharmacy.latitud,
            ),

      lng:
        pharmacy.longitud ===
          null ||
        pharmacy.longitud ===
          undefined
          ? null
          : Number(
              pharmacy.longitud,
            ),

      pharmacy,
    },
  }
}

/**
 * ============================================================
 * PLAN OPERATIVO
 * ============================================================
 */
async function findApprovedPlanForDate(
  client,
  {
    targetPersonId,
    scheduledDate,
  },
) {
  const result =
    await client.query(
      `
      SELECT
        *

      FROM public.work_plan

      WHERE supervisor_id =
          $1::uuid

        AND status =
          'APPROVED'

        AND archived_at
          IS NULL

        AND $2::date BETWEEN
          period_start
          AND period_end

      ORDER BY
        CASE
          WHEN plan_type =
            'ORDINARY'
          THEN 0

          WHEN plan_type =
            'EXTRAORDINARY'
          THEN 1

          ELSE 2
        END ASC,

        period_start DESC,
        created_at DESC

      LIMIT 1

      FOR UPDATE
      `,
      [
        targetPersonId,
        scheduledDate,
      ],
    )

  return (
    result.rows[0] ??
    null
  )
}

async function createApprovedOperationalContainer(
  client,
  {
    target,
    scheduledDate,
    actor,
  },
) {
  const result =
    await client.query(
      `
      INSERT INTO public.work_plan (
        supervisor_id,
        status,

        period_start,
        period_end,

        week_start,

        plan_type,
        revision_number,

        approved_by,
        approved_at,

        created_by,
        updated_by
      )
      VALUES (
        $1::uuid,
        'APPROVED',

        $2::date,
        $2::date,

        date_trunc(
          'week',
          $2::date
        )::date,

        'EXTRAORDINARY',
        0,

        $3::uuid,
        NOW(),

        $3::uuid,
        $3::uuid
      )

      RETURNING *
      `,
      [
        target.id,
        scheduledDate,
        actor.id,
      ],
    )

  const plan =
    result.rows[0]

  await appendWorkPlanEvent(
    client,
    {
      planId:
        plan.id,

      entityType:
        'PLAN',

      entityId:
        plan.id,

      revisionNumber:
        0,

      eventType:
        'PLAN_CREATED',

      actor,

      previousStatus:
        null,

      newStatus:
        'APPROVED',

      afterData:
        plan,

      metadata: {
        automaticOperationalContainer:
          true,

        reason:
          'HIERARCHY_ASSIGNMENT',

        targetPersonId:
          target.id,

        targetRole:
          target.rol,

        scheduledDate,
      },
    },
  )

  return plan
}

/**
 * ============================================================
 * DUPLICADOS
 * ============================================================
 */
async function findDuplicateAssignment(
  client,
  {
    targetPersonId,
    payload,
  },
) {
  if (
    payload.destinationType ===
    'PHARMACY'
  ) {
    const result =
      await client.query(
        `
        SELECT
          wpi.id

        FROM public.work_plan_item wpi

        INNER JOIN public.work_plan wp
          ON wp.id =
            wpi.plan_id

        WHERE wp.supervisor_id =
            $1::uuid

          AND wp.status =
            'APPROVED'

          AND wp.archived_at
            IS NULL

          AND wpi.pharmacy_id =
            $2

          AND wpi.scheduled_date =
            $3::date

          AND wpi.removed_at
            IS NULL

          AND wpi.status <>
            'CANCELLED'

          AND wpi.item_type =
            'PHARMACY'

        LIMIT 1
        `,
        [
          targetPersonId,
          payload.pharmacyId,
          payload.scheduledDate,
        ],
      )

    return (
      result.rows[0] ??
      null
    )
  }

  /**
   * Para punto libre sólo usamos
   * google_place_id como llave de
   * duplicado cuando existe.
   *
   * Si fue un marcador manual,
   * no bloqueamos por coordenadas:
   * dos visitas al mismo lugar
   * pueden ser legítimas.
   */
  if (!payload.googlePlaceId) {
    return null
  }

  const result =
    await client.query(
      `
      SELECT
        wpi.id

      FROM public.work_plan_item wpi

      INNER JOIN public.work_plan wp
        ON wp.id =
          wpi.plan_id

      WHERE wp.supervisor_id =
          $1::uuid

        AND wp.status =
          'APPROVED'

        AND wp.archived_at
          IS NULL

        AND wpi.scheduled_date =
          $2::date

        AND wpi.removed_at
          IS NULL

        AND wpi.status <>
          'CANCELLED'

        AND wpi.item_type =
          'EXTRA_STOP'

        AND wpi.source =
          'HIERARCHY_ASSIGNED'

        AND wpi.google_place_id =
          $3

      LIMIT 1
      `,
      [
        targetPersonId,
        payload.scheduledDate,
        payload.googlePlaceId,
      ],
    )

  return (
    result.rows[0] ??
    null
  )
}

/**
 * ============================================================
 * VALORES DEL ITEM
 * ============================================================
 */
function buildItemValues(
  payload,
) {
  if (
    payload.destinationType ===
    'PHARMACY'
  ) {
    return {
      pharmacyId:
        payload.pharmacyId,

      itemType:
        'PHARMACY',

      customName:
        null,

      customAddress:
        null,

      googlePlaceId:
        null,

      customLat:
        null,

      customLng:
        null,

      activityCategory:
        null,

      estimatedMinutes:
        null,
    }
  }

  return {
    pharmacyId:
      null,

    itemType:
      'EXTRA_STOP',

    customName:
      payload.name,

    customAddress:
      payload.address,

    googlePlaceId:
      payload.googlePlaceId,

    customLat:
      payload.lat,

    customLng:
      payload.lng,

    activityCategory:
      payload.category,

    estimatedMinutes:
      payload.estimatedMinutes,
  }
}

/**
 * ============================================================
 * ITEM COMPLETO
 * ============================================================
 */
async function getAssignedItem(
  client,
  itemId,
) {
  const result =
    await client.query(
      `
      SELECT
        wpi.*,

        wpi.scheduled_time::text
          AS scheduled_time,

        COALESCE(
          NULLIF(
            BTRIM(
              wpi.custom_name
            ),
            ''
          ),

          NULLIF(
            BTRIM(
              f.unidad
            ),
            ''
          ),

          f.clues,

          'Punto sin nombre'
        ) AS display_name,

        COALESCE(
          NULLIF(
            BTRIM(
              wpi.custom_address
            ),
            ''
          ),

          NULLIF(
            BTRIM(
              f.direccion
            ),
            ''
          )
        ) AS display_address,

        f.clues,
        f.region_sanitaria,
        f.proyecto,
        f.estado,

        COALESCE(
          wpi.custom_lat::double precision,
          f.latitud::double precision
        ) AS lat,

        COALESCE(
          wpi.custom_lng::double precision,
          f.longitud::double precision
        ) AS lng,

        added_person.nombre
          AS added_by_name,

        added_person.rol::text
          AS added_by_role

      FROM public.work_plan_item wpi

      LEFT JOIN public.farmacia f
        ON f.id =
          wpi.pharmacy_id

      LEFT JOIN public.personas
        added_person

        ON added_person.id =
          wpi.added_by

      WHERE wpi.id =
        $1::uuid

      LIMIT 1
      `,
      [
        itemId,
      ],
    )

  return (
    result.rows[0] ??
    null
  )
}

/**
 * ============================================================
 * PAYLOAD
 * ============================================================
 */
function parseAssignmentPayload(
  body = {},
) {
  const targetPersonId =
    normalizeText(
      body.targetPersonId,
    )

  const rawDestinationType =
    normalizeText(
      body.destinationType,
    )
      .toUpperCase()

  /**
   * Compatibilidad:
   *
   * Si no llega destinationType,
   * pero sí pharmacyId,
   * se interpreta como PHARMACY.
   */
  const destinationType =
    rawDestinationType ||
    (
      normalizeText(
        body.pharmacyId,
      )
        ? 'PHARMACY'
        : 'FREE_POINT'
    )

  const pharmacyId =
    normalizeText(
      body.pharmacyId,
    )

  const scheduledDate =
    normalizeDateValue(
      body.scheduledDate,
    )

  const scheduledTime =
    normalizeOptionalTime(
      body.scheduledTime,
    )

  const instruction =
    normalizeText(
      body.instruction,
    )

  if (
    !UUID_PATTERN.test(
      targetPersonId,
    )
  ) {
    return {
      ok:
        false,

      status:
        400,

      response: {
        error:
          'La persona seleccionada no es válida',

        code:
          'INVALID_TARGET_PERSON_ID',
      },
    }
  }

  if (
    !ALLOWED_DESTINATION_TYPES.has(
      destinationType,
    )
  ) {
    return {
      ok:
        false,

      status:
        400,

      response: {
        error:
          'El tipo de destino no es válido',

        code:
          'INVALID_DESTINATION_TYPE',
      },
    }
  }

  if (
    !ISO_DATE_PATTERN.test(
      scheduledDate,
    )
  ) {
    return {
      ok:
        false,

      status:
        400,

      response: {
        error:
          'La fecha programada no es válida',

        code:
          'INVALID_SCHEDULED_DATE',
      },
    }
  }

  const rawScheduledTime =
    body.scheduledTime ===
      null ||
    body.scheduledTime ===
      undefined
      ? ''
      : String(
          body.scheduledTime,
        ).trim()

  if (
    rawScheduledTime &&
    !scheduledTime
  ) {
    return {
      ok:
        false,

      status:
        400,

      response: {
        error:
          'La hora programada no es válida',

        code:
          'INVALID_SCHEDULED_TIME',
      },
    }
  }

  if (
    instruction.length <
    3
  ) {
    return {
      ok:
        false,

      status:
        400,

      response: {
        error:
          'Debes indicar la instrucción o motivo de la visita',

        code:
          'HIERARCHY_ASSIGNMENT_INSTRUCTION_REQUIRED',
      },
    }
  }

  if (
    instruction.length >
    1000
  ) {
    return {
      ok:
        false,

      status:
        400,

      response: {
        error:
          'La instrucción no puede superar 1000 caracteres',

        code:
          'HIERARCHY_ASSIGNMENT_INSTRUCTION_TOO_LONG',
      },
    }
  }

  /**
   * ==========================================================
   * FARMACIA
   * ==========================================================
   */
  if (
    destinationType ===
    'PHARMACY'
  ) {
    if (
      !BIGINT_PATTERN.test(
        pharmacyId,
      )
    ) {
      return {
        ok:
          false,

        status:
          400,

        response: {
          error:
            'La farmacia seleccionada no es válida',

          code:
            'INVALID_PHARMACY_ID',
        },
      }
    }

    return {
      ok:
        true,

      value: {
        targetPersonId,
        destinationType,

        pharmacyId,

        scheduledDate,
        scheduledTime,

        instruction,

        name:
          null,

        address:
          null,

        googlePlaceId:
          null,

        lat:
          null,

        lng:
          null,

        category:
          null,

        estimatedMinutes:
          null,
      },
    }
  }

  /**
   * ==========================================================
   * PUNTO LIBRE
   * ==========================================================
   */
  const name =
    normalizeText(
      body.name,
    )

  const address =
    normalizeOptionalText(
      body.address,
    )

  const googlePlaceId =
    normalizeOptionalText(
      body.googlePlaceId,
    )

  const category =
    normalizeText(
      body.category,
    )
      .toUpperCase()

  const coordinates =
    parseCoordinates(
      body,
    )

  const estimatedMinutes =
    parseEstimatedMinutes(
      body.estimatedMinutes,
    )

  if (
    name.length <
    3
  ) {
    return {
      ok:
        false,

      status:
        400,

      response: {
        error:
          'El nombre del punto debe tener al menos 3 caracteres',

        code:
          'FREE_POINT_NAME_REQUIRED',
      },
    }
  }

  if (
    name.length >
    150
  ) {
    return {
      ok:
        false,

      status:
        400,

      response: {
        error:
          'El nombre del punto no puede superar 150 caracteres',

        code:
          'FREE_POINT_NAME_TOO_LONG',
      },
    }
  }

  if (
    address &&
    address.length >
      500
  ) {
    return {
      ok:
        false,

      status:
        400,

      response: {
        error:
          'La dirección no puede superar 500 caracteres',

        code:
          'FREE_POINT_ADDRESS_TOO_LONG',
      },
    }
  }

  if (
    googlePlaceId &&
    googlePlaceId.length >
      255
  ) {
    return {
      ok:
        false,

      status:
        400,

      response: {
        error:
          'El identificador de Google no es válido',

        code:
          'INVALID_GOOGLE_PLACE_ID',
      },
    }
  }

  if (
    !ALLOWED_CATEGORIES.has(
      category,
    )
  ) {
    return {
      ok:
        false,

      status:
        400,

      response: {
        error:
          'La categoría seleccionada no es válida',

        code:
          'INVALID_FREE_POINT_CATEGORY',
      },
    }
  }

  if (!coordinates.ok) {
    return {
      ok:
        false,

      status:
        400,

      response: {
        error:
          coordinates.error,

        code:
          'INVALID_FREE_POINT_COORDINATES',
      },
    }
  }

  if (
    !estimatedMinutes.ok
  ) {
    return {
      ok:
        false,

      status:
        400,

      response: {
        error:
          estimatedMinutes.error,

        code:
          'INVALID_ESTIMATED_MINUTES',
      },
    }
  }

  return {
    ok:
      true,

    value: {
      targetPersonId,
      destinationType,

      pharmacyId:
        null,

      scheduledDate,
      scheduledTime,

      instruction,

      name,
      address,
      googlePlaceId,

      lat:
        coordinates.lat,

      lng:
        coordinates.lng,

      category,

      estimatedMinutes:
        estimatedMinutes.value,
    },
  }
}

/**
 * ============================================================
 * COORDENADAS
 * ============================================================
 */
function parseCoordinates(
  body = {},
) {
  const lat =
    Number(
      body.lat,
    )

  const lng =
    Number(
      body.lng,
    )

  if (
    !Number.isFinite(
      lat,
    ) ||
    lat <
      -90 ||
    lat >
      90
  ) {
    return {
      ok:
        false,

      error:
        'La latitud no es válida',
    }
  }

  if (
    !Number.isFinite(
      lng,
    ) ||
    lng <
      -180 ||
    lng >
      180
  ) {
    return {
      ok:
        false,

      error:
        'La longitud no es válida',
    }
  }

  return {
    ok:
      true,

    lat,
    lng,
  }
}

/**
 * ============================================================
 * TIEMPO ESTIMADO
 * ============================================================
 */
function parseEstimatedMinutes(
  value,
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    value ===
      ''
  ) {
    return {
      ok:
        true,

      value:
        null,
    }
  }

  const parsed =
    Number(
      value,
    )

  if (
    !Number.isInteger(
      parsed,
    ) ||
    parsed <
      1 ||
    parsed >
      480
  ) {
    return {
      ok:
        false,

      error:
        'El tiempo estimado debe estar entre 1 y 480 minutos',
    }
  }

  return {
    ok:
      true,

    value:
      parsed,
  }
}

/**
 * ============================================================
 * NORMALIZADORES
 * ============================================================
 */
function normalizeText(
  value,
) {
  return String(
    value ??
    '',
  ).trim()
}

function normalizeOptionalText(
  value,
) {
  const normalized =
    String(
      value ??
      '',
    ).trim()

  return (
    normalized ||
    null
  )
}

function normalizeOptionalTime(
  value,
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    String(
      value,
    ).trim() ===
      ''
  ) {
    return null
  }

  const normalized =
    String(
      value,
    ).trim()

  if (
    !TIME_PATTERN.test(
      normalized,
    )
  ) {
    return null
  }

  const parts =
    normalized.split(
      ':',
    )

  return `${parts[0]}:${parts[1]}`
}

function normalizeDateValue(
  value,
) {
  if (!value) {
    return ''
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
  )
    .trim()
    .slice(
      0,
      10,
    )
}

/**
 * ============================================================
 * MAPPERS
 * ============================================================
 */
function mapTeamMember(
  row,
) {
  return {
    id:
      row.id,

    name:
      row.nombre,

    area:
      row.area,

    role:
      row.rol,

    superiorId:
      row.superior_id,

    pharmacyScopeMode:
      row.pharmacy_scope_mode ??
      null,
  }
}

function mapHierarchyPharmacy(
  row,
) {
  return {
    id:
      String(
        row.id,
      ),

    clues:
      row.clues ??
      null,

    name:
      row.unidad ??
      row.clues ??
      'Farmacia sin nombre',

    address:
      row.direccion ??
      null,

    region:
      row.region_sanitaria ??
      null,

    project:
      row.proyecto ??
      null,

    state:
      row.estado ??
      null,

    status:
      row.estatus ??
      null,

    lat:
      row.latitud ===
        null ||
      row.latitud ===
        undefined
        ? null
        : Number(
            row.latitud,
          ),

    lng:
      row.longitud ===
        null ||
      row.longitud ===
        undefined
        ? null
        : Number(
            row.longitud,
          ),
  }
}

function mapAssignedItem(
  row,
) {
  const destinationType =
    row.item_type ===
      'PHARMACY'
      ? 'PHARMACY'
      : 'FREE_POINT'

  return {
    id:
      row.id,

    planId:
      row.plan_id,

    destinationType,

    pharmacyId:
      row.pharmacy_id ===
        null ||
      row.pharmacy_id ===
        undefined
        ? null
        : String(
            row.pharmacy_id,
          ),

    clues:
      row.clues ??
      null,

    name:
      row.display_name,

    address:
      row.display_address,

    region:
      row.region_sanitaria ??
      null,

    project:
      row.proyecto ??
      null,

    state:
      row.estado ??
      null,

    lat:
      row.lat ===
        null ||
      row.lat ===
        undefined
        ? null
        : Number(
            row.lat,
          ),

    lng:
      row.lng ===
        null ||
      row.lng ===
        undefined
        ? null
        : Number(
            row.lng,
          ),

    scheduledDate:
      normalizeDateValue(
        row.scheduled_date,
      ),

    scheduledTime:
      row.scheduled_time,

    order:
      Number(
        row.ord,
      ),

    required:
      Boolean(
        row.required,
      ),

    status:
      row.status,

    itemType:
      row.item_type,

    source:
      row.source,

    googlePlaceId:
      row.google_place_id ??
      null,

    activityCategory:
      row.activity_category ??
      null,

    instruction:
      row.addition_reason ??
      null,

    estimatedMinutes:
      row.estimated_minutes ===
        null ||
      row.estimated_minutes ===
        undefined
        ? null
        : Number(
            row.estimated_minutes,
          ),

    addedBy:
      row.added_by,

    addedByName:
      row.added_by_name,

    addedByRole:
      row.added_by_role,

    addedAt:
      row.added_at,

    updatedBy:
      row.updated_by,

    updatedAt:
      row.updated_at,
  }
}

/**
 * ============================================================
 * ROLLBACK
 * ============================================================
 */
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
      '[mobile.hierarchy-assignments][rollback]',
      rollbackError,
    )
  }
}

export default router

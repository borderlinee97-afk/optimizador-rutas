const MAX_ACTIVITIES_PER_VISIT =
  50

export function parsePlannedActivitiesInput(
  value,
  {
    required =
      false,
  } = {},
) {
  const provided =
    value !==
      undefined

  if (
    !provided &&
    !required
  ) {
    return {
      ok:
        true,

      provided:
        false,

      value:
        null,
    }
  }

  if (
    !Array.isArray(
      value,
    )
  ) {
    return invalidActivities(
      'Debes indicar las actividades planeadas de la visita',
      'VISIT_ACTIVITIES_REQUIRED',
    )
  }

  if (
    value.length ===
    0
  ) {
    return invalidActivities(
      'Agrega al menos una actividad antes de guardar la visita',
      'VISIT_ACTIVITIES_REQUIRED',
    )
  }

  if (
    value.length >
    MAX_ACTIVITIES_PER_VISIT
  ) {
    return invalidActivities(
      `Una visita no puede contener más de ${MAX_ACTIVITIES_PER_VISIT} actividades`,
      'TOO_MANY_VISIT_ACTIVITIES',
    )
  }

  const activities =
    []

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    const current =
      value[index]

    if (
      !current ||
      typeof current !==
        'object' ||
      Array.isArray(
        current,
      )
    ) {
      return invalidActivities(
        `La actividad ${index + 1} no es válida`,
        'INVALID_VISIT_ACTIVITY',
      )
    }

    const activityType =
      String(
        current.activityType ??
        '',
      ).trim()

    const note =
      normalizeOptionalText(
        current.note,
      )

    if (
      !activityType
    ) {
      return invalidActivities(
        `La actividad ${index + 1} debe tener una descripción`,
        'VISIT_ACTIVITY_TYPE_REQUIRED',
      )
    }

    if (
      activityType.length >
      160
    ) {
      return invalidActivities(
        `La actividad ${index + 1} no puede superar 160 caracteres`,
        'VISIT_ACTIVITY_TYPE_TOO_LONG',
      )
    }

    if (
      note &&
      note.length >
        1000
    ) {
      return invalidActivities(
        `La nota de la actividad ${index + 1} no puede superar 1000 caracteres`,
        'VISIT_ACTIVITY_NOTE_TOO_LONG',
      )
    }

    activities.push({
      activityType,
      note,
      order:
        index + 1,
    })
  }

  return {
    ok:
      true,

    provided:
      true,

    value:
      activities,
  }
}

export async function replacePlannedActivities(
  client,
  {
    planItemId,
    activities,
    actorId,
  },
) {
  await client.query(
    `
    DELETE FROM public.pharmacy_activity

    WHERE plan_item_id =
      $1::uuid
    `,
    [
      planItemId,
    ],
  )

  for (
    const activity
    of activities
  ) {
    await client.query(
      `
      INSERT INTO public.pharmacy_activity (
        plan_item_id,
        activity_type,
        note,
        ord,
        status,
        created_by,
        created_at,
        updated_by,
        updated_at
      )
      VALUES (
        $1::uuid,
        $2::text,
        NULLIF($3::text, ''),
        $4::integer,
        'PENDING',
        $5::uuid,
        NOW(),
        $5::uuid,
        NOW()
      )
      `,
      [
        planItemId,
        activity.activityType,
        activity.note,
        activity.order,
        actorId,
      ],
    )
  }

  return getActivitiesForPlanItem(
    client,
    planItemId,
  )
}

export async function getActivitiesForPlanItem(
  client,
  planItemId,
) {
  const grouped =
    await getActivitiesByPlanItemIds(
      client,
      [
        planItemId,
      ],
    )

  return (
    grouped.get(
      String(
        planItemId,
      ),
    ) ??
    []
  )
}

export async function getActivitiesByPlanItemIds(
  client,
  planItemIds,
) {
  const normalizedIds =
    [
      ...new Set(
        (
          Array.isArray(
            planItemIds,
          )
            ? planItemIds
            : []
        )
          .map(
            value =>
              String(
                value ??
                '',
              ).trim(),
          )
          .filter(
            Boolean,
          ),
      ),
    ]

  const grouped =
    new Map()

  if (
    normalizedIds.length ===
    0
  ) {
    return grouped
  }

  const result =
    await client.query(
      `
      SELECT
        id,
        plan_item_id,
        activity_type,
        note,
        ord,
        status,
        execution_note,
        completed_by,
        completed_at,
        skipped_by,
        skipped_at,
        skip_reason,
        created_by,
        created_at,
        updated_by,
        updated_at

      FROM public.pharmacy_activity

      WHERE plan_item_id =
        ANY($1::uuid[])

      ORDER BY
        plan_item_id ASC,
        ord ASC,
        created_at ASC,
        id ASC
      `,
      [
        normalizedIds,
      ],
    )

  for (
    const row
    of result.rows
  ) {
    const key =
      String(
        row.plan_item_id,
      )

    const current =
      grouped.get(
        key,
      ) ??
      []

    current.push(
      mapPharmacyActivity(
        row,
      ),
    )

    grouped.set(
      key,
      current,
    )
  }

  return grouped
}

export async function attachActivitiesToItems(
  client,
  items,
) {
  const normalized =
    Array.isArray(
      items,
    )
      ? items
      : []

  if (
    normalized.length ===
    0
  ) {
    return normalized
  }

  const grouped =
    await getActivitiesByPlanItemIds(
      client,
      normalized.map(
        item =>
          item.id,
      ),
    )

  return normalized.map(
    item => ({
      ...item,

      activities:
        grouped.get(
          String(
            item.id,
          ),
        ) ??
        [],
    }),
  )
}

export async function findPlanItemWithoutActivities(
  client,
  planId,
) {
  const result =
    await client.query(
      `
      SELECT
        wpi.id
          AS item_id,

        wpi.pharmacy_id,

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
          'Farmacia sin nombre'
        ) AS name,

        wpi.scheduled_date

      FROM public.work_plan_item
        wpi

      LEFT JOIN public.farmacia
        f

        ON f.id =
          wpi.pharmacy_id

      WHERE wpi.plan_id =
          $1::uuid

        AND wpi.removed_at
          IS NULL

        AND wpi.item_type =
          'PHARMACY'

        AND wpi.source =
          'PLAN'

        AND NOT EXISTS (
          SELECT 1

          FROM public.pharmacy_activity
            pa

          WHERE pa.plan_item_id =
            wpi.id
        )

      ORDER BY
        wpi.scheduled_date ASC,
        wpi.ord ASC,
        wpi.id ASC

      LIMIT 1
      `,
      [
        planId,
      ],
    )

  return (
    result.rows[0] ??
    null
  )
}

export async function copyPlannedActivities(
  client,
  {
    fromPlanItemId,
    toPlanItemId,
    actorId,
  },
) {
  await client.query(
    `
    INSERT INTO public.pharmacy_activity (
      plan_item_id,
      activity_type,
      note,
      ord,
      status,
      created_by,
      created_at,
      updated_by,
      updated_at
    )

    SELECT
      $2::uuid,
      pa.activity_type,
      pa.note,
      pa.ord,
      'PENDING',
      $3::uuid,
      NOW(),
      $3::uuid,
      NOW()

    FROM public.pharmacy_activity
      pa

    WHERE pa.plan_item_id =
      $1::uuid

    ORDER BY
      pa.ord ASC,
      pa.created_at ASC,
      pa.id ASC
    `,
    [
      fromPlanItemId,
      toPlanItemId,
      actorId,
    ],
  )

  return getActivitiesForPlanItem(
    client,
    toPlanItemId,
  )
}

function mapPharmacyActivity(
  row,
) {
  return {
    id:
      row.id,

    planItemId:
      row.plan_item_id,

    activityType:
      row.activity_type,

    note:
      row.note,

    order:
      Number(
        row.ord,
      ),

    status:
      row.status,

    executionNote:
      row.execution_note,

    completedBy:
      row.completed_by,

    completedAt:
      row.completed_at,

    skippedBy:
      row.skipped_by,

    skippedAt:
      row.skipped_at,

    skipReason:
      row.skip_reason,

    createdBy:
      row.created_by,

    createdAt:
      row.created_at,

    updatedBy:
      row.updated_by,

    updatedAt:
      row.updated_at,
  }
}

function invalidActivities(
  error,
  code,
) {
  return {
    ok:
      false,

    provided:
      true,

    value:
      null,

    response: {
      error,
      code,
    },
  }
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

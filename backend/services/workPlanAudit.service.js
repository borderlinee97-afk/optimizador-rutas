export async function appendWorkPlanEvent(
  client,
  {
    planId,
    entityType,
    entityId = null,
    revisionNumber = null,
    eventType,
    actor = null,
    previousStatus = null,
    newStatus = null,
    comment = null,
    beforeData = null,
    afterData = null,
    metadata = {},
  }
) {
  if (!planId) {
    throw new Error(
      'planId es obligatorio para registrar un evento'
    )
  }

  if (!entityType) {
    throw new Error(
      'entityType es obligatorio para registrar un evento'
    )
  }

  if (!eventType) {
    throw new Error(
      'eventType es obligatorio para registrar un evento'
    )
  }

  await client.query(
    `
    INSERT INTO public.work_plan_event (
      plan_id,
      entity_type,
      entity_id,
      revision_number,
      event_type,

      actor_id,
      actor_area,
      actor_role,

      previous_status,
      new_status,

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
      $8,

      $9,
      $10,

      $11,

      $12::jsonb,
      $13::jsonb,
      $14::jsonb
    )
    `,
    [
      planId,
      entityType,
      entityId,
      revisionNumber,
      eventType,

      actor?.id ?? null,
      actor?.area ?? null,
      actor?.rol ?? null,

      previousStatus,
      newStatus,

      normalizeOptionalText(
        comment
      ),

      toJsonValue(
        beforeData
      ),

      toJsonValue(
        afterData
      ),

      toJsonValue(
        metadata ?? {}
      ),
    ]
  )
}

function toJsonValue(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null
  }

  return JSON.stringify(value)
}

function normalizeOptionalText(value) {
  const normalized =
    String(
      value ?? ''
    ).trim()

  return normalized || null
}
import {
  pool,
} from '../db/pool.js'

export async function canAccessPersona(
  actor,
  targetPersonaId,
  db = pool,
) {
  if (
    !actor ||
    !targetPersonaId
  ) {
    return false
  }

  if (
    actor.system_role ===
      'ADMIN' ||
    actor.id ===
      targetPersonaId
  ) {
    return true
  }

  const result =
    await db.query(
      `
      WITH RECURSIVE descendants AS (
        SELECT
          person.id,
          person.superior_id
        FROM public.personas person
        WHERE person.superior_id = $1::uuid
          AND person.activo = TRUE

        UNION ALL

        SELECT
          child.id,
          child.superior_id
        FROM public.personas child
        INNER JOIN descendants parent
          ON child.superior_id = parent.id
        WHERE child.activo = TRUE
      )
      SELECT 1
      FROM descendants
      WHERE id = $2::uuid
      LIMIT 1
      `,
      [
        actor.id,
        targetPersonaId,
      ],
    )

  return result.rowCount >
    0
}

// Dependencies are injected so task tests never load a database or auth client.

import {
  addSignedEvidenceReadUrl,
} from './evidencePolicy.service.js'

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']

const ASSIGNERS = ['DIRECTOR', 'GERENTE', 'COORDINADOR']
const TASK_ROLES = [...ASSIGNERS, 'SUPERVISOR']

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const terminal = task =>
  ['DONE', 'CANCELLED'].includes(task.status)

export const canAssignTasks = actor =>
  actor.system_role === 'ADMIN' ||
  ASSIGNERS.includes(actor.rol)

export const canUseOperationalTasks = actor =>
  actor?.system_role === 'ADMIN' ||
  (
    actor?.area === 'FARMACIAS' &&
    TASK_ROLES.includes(actor?.rol)
  )

function fail(status, code, message) {
  throw Object.assign(
    new Error(message),
    {
      status,
      code,
    },
  )
}

function uuid(value) {
  if (
    typeof value !== 'string' ||
    !UUID.test(value)
  ) {
    fail(
      400,
      'TASK_ID_INVALID',
      'El identificador no es válido',
    )
  }

  return value
}

function date(value) {
  if (
    value == null ||
    value === ''
  ) {
    return null
  }

  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    fail(
      400,
      'TASK_DATE_INVALID',
      'La fecha debe incluir hora y zona horaria',
    )
  }

  return new Date(value).toISOString()
}

function fields(body, partial = false) {
  const result = {}

  if (
    !partial ||
    Object.prototype.hasOwnProperty.call(
      body,
      'title',
    )
  ) {
    const title =
      typeof body.title === 'string'
        ? body.title.trim()
        : ''

    if (
      title.length < 3 ||
      title.length > 200
    ) {
      fail(
        400,
        'TASK_TITLE_INVALID',
        'El título debe tener entre 3 y 200 caracteres',
      )
    }

    result.title = title
  }

  if (
    !partial ||
    Object.prototype.hasOwnProperty.call(
      body,
      'description',
    )
  ) {
    if (
      body.description != null &&
      typeof body.description !== 'string'
    ) {
      fail(
        400,
        'TASK_DESCRIPTION_INVALID',
        'La descripción no es válida',
      )
    }

    result.description =
      body.description?.trim() || null

    if (
      result.description?.length > 4000
    ) {
      fail(
        400,
        'TASK_DESCRIPTION_INVALID',
        'La descripción no puede superar 4000 caracteres',
      )
    }
  }

  if (
    !partial ||
    Object.prototype.hasOwnProperty.call(
      body,
      'priority',
    )
  ) {
    result.priority =
      body.priority ?? 'MEDIUM'

    if (
      !TASK_PRIORITIES.includes(
        result.priority,
      )
    ) {
      fail(
        400,
        'TASK_PRIORITY_INVALID',
        'La prioridad no es válida',
      )
    }
  }

  if (
    !partial ||
    Object.prototype.hasOwnProperty.call(
      body,
      'dueAt',
    )
  ) {
    result.due_at =
      date(body.dueAt)
  }

  if (
    !partial ||
    Object.prototype.hasOwnProperty.call(
      body,
      'requiresEvidence',
    )
  ) {
    if (
      body.requiresEvidence != null &&
      typeof body.requiresEvidence !== 'boolean'
    ) {
      fail(
        400,
        'TASK_EVIDENCE_INVALID',
        'El requisito de evidencia debe ser verdadero o falso',
      )
    }

    result.requires_evidence =
      body.requiresEvidence ?? false
  }

  return result
}

const TASK_SELECT = `SELECT task.*, assignee.nombre AS assignee_name, assigner.nombre AS assigned_by_name,
  (SELECT COUNT(*)::integer FROM public.operational_task_comment WHERE task_id = task.id) AS comment_count,
  (SELECT COUNT(*)::integer FROM public.visit_evidence WHERE task_id = task.id AND status = 'READY') AS evidence_count
  FROM public.operational_task task
  JOIN public.personas assignee ON assignee.id = task.assignee_id
  JOIN public.personas assigner ON assigner.id = task.assigned_by`

export function mapTask(row, actor) {
  const active =
    !terminal(row)

  const editor =
    row.assigned_by === actor.id ||
    canAssignTasks(actor)

  const executor =
    row.assignee_id === actor.id ||
    actor.system_role === 'ADMIN'

  return {
    id:
      row.id,

    assigneeId:
      row.assignee_id,

    assigneeName:
      row.assignee_name ?? null,

    assignedBy:
      row.assigned_by,

    assignedByName:
      row.assigned_by_name ?? null,

    planItemId:
      row.plan_item_id,

    title:
      row.title,

    description:
      row.description,

    priority:
      row.priority,

    status:
      row.status,

    dueAt:
      row.due_at,

    startedAt:
      row.started_at,

    completedAt:
      row.completed_at,

    requiresEvidence:
      Boolean(
        row.requires_evidence,
      ),

    commentCount:
      Number(
        row.comment_count ?? 0,
      ),

    evidenceCount:
      Number(
        row.evidence_count ?? 0,
      ),

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    permissions: {
      edit:
        active &&
        editor,

      cancel:
        active &&
        (
          editor ||
          executor
        ),

      start:
        row.status === 'TODO' &&
        executor,

      complete:
        active &&
        executor,

      comment:
        true,

      evidence:
        active &&
        row.assignee_id === actor.id,
    },
  }
}

export function createOperationalTasksService({
  pool,
  canAccessPersona,
  signEvidence = addSignedEvidenceReadUrl,
}) {
  async function accessible(
    actor,
    task,
    db = pool,
  ) {
    return (
      task.assignee_id === actor.id ||
      (
        canAssignTasks(actor) &&
        await canAccessPersona(
          actor,
          task.assignee_id,
          db,
        )
      )
    )
  }

  async function taskFor(
    actor,
    id,
    db = pool,
    lock = false,
  ) {
    uuid(id)

    const { rows } =
      await db.query(
        `${TASK_SELECT} WHERE task.id = $1::uuid${
          lock
            ? ' FOR UPDATE OF task'
            : ''
        }`,
        [id],
      )

    if (
      !rows[0] ||
      !await accessible(
        actor,
        rows[0],
        db,
      )
    ) {
      fail(
        404,
        'TASK_NOT_FOUND',
        'La tarea no existe o está fuera del ámbito autorizado',
      )
    }

    return rows[0]
  }

  async function transaction(work) {
    const client =
      await pool.connect()

    try {
      await client.query('BEGIN')

      const result =
        await work(client)

      await client.query('COMMIT')

      return result
    } catch (error) {
      await client
        .query('ROLLBACK')
        .catch(() => {})

      throw error
    } finally {
      client.release()
    }
  }

  async function assignees(actor) {
    const { rows } =
      await pool.query(
        `WITH RECURSIVE scope AS (
      SELECT id, nombre, rol, superior_id FROM public.personas WHERE id = $1::uuid AND activo = TRUE
      UNION
      SELECT p.id, p.nombre, p.rol, p.superior_id FROM public.personas p JOIN scope s ON p.superior_id = s.id
      WHERE p.activo = TRUE AND $2::boolean
    ) SELECT id, nombre AS name, rol AS role FROM scope
      UNION SELECT id, nombre AS name, rol AS role FROM public.personas WHERE activo = TRUE AND $3::boolean
      ORDER BY name`,
        [
          actor.id,
          canAssignTasks(actor),
          actor.system_role === 'ADMIN',
        ],
      )

    return {
      assignees:
        rows,

      canAssign:
        canAssignTasks(actor),

      selfId:
        actor.id,
    }
  }

  async function list(
    actor,
    query = {},
  ) {
    const mode =
      query.mode || 'agenda'

    if (
      ![
        'agenda',
        'assigned',
      ].includes(mode)
    ) {
      fail(
        400,
        'TASK_MODE_INVALID',
        'La vista no es válida',
      )
    }

    if (
      mode === 'assigned' &&
      !canAssignTasks(actor)
    ) {
      fail(
        403,
        'TASK_ASSIGNMENT_NOT_ALLOWED',
        'El perfil no puede consultar tareas asignadas',
      )
    }

    const status =
      query.status === 'ALL'
        ? null
        : query.status || null

    const priority =
      query.priority === 'ALL'
        ? null
        : query.priority || null

    if (
      status &&
      !TASK_STATUSES.includes(status)
    ) {
      fail(
        400,
        'TASK_STATUS_INVALID',
        'El estado no es válido',
      )
    }

    if (
      priority &&
      !TASK_PRIORITIES.includes(
        priority,
      )
    ) {
      fail(
        400,
        'TASK_PRIORITY_INVALID',
        'La prioridad no es válida',
      )
    }

    const assigneeId =
      query.assigneeId
        ? uuid(query.assigneeId)
        : null

    if (
      assigneeId &&
      assigneeId !== actor.id &&
      (
        !canAssignTasks(actor) ||
        !await canAccessPersona(
          actor,
          assigneeId,
          pool,
        )
      )
    ) {
      fail(
        403,
        'TASK_ASSIGNEE_OUT_OF_SCOPE',
        'El responsable está fuera de la jerarquía autorizada',
      )
    }

    const from =
      date(query.dueFrom)

    const to =
      date(query.dueTo)

    if (
      from &&
      to &&
      from > to
    ) {
      fail(
        400,
        'TASK_DATE_RANGE_INVALID',
        'El rango de fechas no es válido',
      )
    }

    const { rows } =
      await pool.query(
        `WITH RECURSIVE scope AS (
      SELECT id FROM public.personas WHERE id = $1::uuid
      UNION SELECT p.id FROM public.personas p JOIN scope s ON p.superior_id = s.id WHERE p.activo = TRUE
    ) ${TASK_SELECT} WHERE
      (($2::boolean = FALSE AND task.assignee_id = $1::uuid) OR
       ($2::boolean = TRUE AND ($3::boolean OR task.assignee_id IN (SELECT id FROM scope))))
      AND ($4::text IS NULL OR task.status = $4)
      AND ($5::text IS NULL OR task.priority = $5)
      AND ($6::uuid IS NULL OR task.assignee_id = $6)
      AND ($7::timestamptz IS NULL OR task.due_at >= $7)
      AND ($8::timestamptz IS NULL OR task.due_at <= $8)
      ORDER BY task.due_at ASC NULLS LAST, task.created_at DESC`,
        [
          actor.id,
          mode === 'assigned',
          actor.system_role === 'ADMIN',
          status,
          priority,
          assigneeId,
          from,
          to,
        ],
      )

    return {
      mode,

      tasks:
        rows.map(
          row =>
            mapTask(
              row,
              actor,
            ),
        ),
    }
  }

  async function create(
    actor,
    body,
  ) {
    const assigneeId =
      uuid(
        body.assigneeId ??
        actor.id,
      )

    const values =
      fields(body)

    return transaction(
      async db => {
        if (
          assigneeId !== actor.id &&
          (
            !canAssignTasks(actor) ||
            !await canAccessPersona(
              actor,
              assigneeId,
              db,
            )
          )
        ) {
          fail(
            403,
            'TASK_ASSIGNEE_OUT_OF_SCOPE',
            'El responsable está fuera de la jerarquía autorizada',
          )
        }

        const person =
          await db.query(
            'SELECT id FROM public.personas WHERE id = $1::uuid AND activo = TRUE',
            [assigneeId],
          )

        if (
          !person.rows.length
        ) {
          fail(
            404,
            'TASK_ASSIGNEE_NOT_FOUND',
            'El responsable no existe o está inactivo',
          )
        }

        const { rows } =
          await db.query(
            `INSERT INTO public.operational_task
        (assignee_id, assigned_by, created_by, title, description, priority, due_at, requires_evidence)
        VALUES ($1::uuid, $2::uuid, $2::uuid, $3, $4, $5, $6::timestamptz, $7) RETURNING id`,
            [
              assigneeId,
              actor.id,
              values.title,
              values.description,
              values.priority,
              values.due_at,
              values.requires_evidence,
            ],
          )

        // The existing operational_task_audit_trigger
        // records CREATED/UPDATED/STATUS_CHANGED.

        return {
          ok:
            true,

          task:
            mapTask(
              await taskFor(
                actor,
                rows[0].id,
                db,
              ),
              actor,
            ),
        }
      },
    )
  }

  async function edit(
    actor,
    id,
    body,
  ) {
    const values =
      fields(
        body,
        true,
      )

    if (
      !Object.keys(values).length
    ) {
      fail(
        400,
        'TASK_FIELDS_REQUIRED',
        'No hay campos para actualizar',
      )
    }

    return transaction(
      async db => {
        const task =
          await taskFor(
            actor,
            id,
            db,
            true,
          )

        if (
          !mapTask(
            task,
            actor,
          ).permissions.edit
        ) {
          fail(
            403,
            'TASK_EDIT_NOT_ALLOWED',
            'No puedes editar esta tarea',
          )
        }

        const entries =
          Object.entries(values)

        await db.query(
          `UPDATE public.operational_task SET ${entries
            .map(
              ([key], i) =>
                `${key} = $${i + 3}`,
            )
            .join(', ')},
        updated_by = $2::uuid, updated_at = NOW() WHERE id = $1::uuid`,
          [
            id,
            actor.id,
            ...entries.map(
              ([, value]) =>
                value,
            ),
          ],
        )

        return {
          ok:
            true,

          task:
            mapTask(
              await taskFor(
                actor,
                id,
                db,
              ),
              actor,
            ),
        }
      },
    )
  }

  async function status(
    actor,
    id,
    body,
  ) {
    const next =
      body.status

    if (
      !TASK_STATUSES.includes(next)
    ) {
      fail(
        400,
        'TASK_STATUS_INVALID',
        'El estado no es válido',
      )
    }

    const key =
      body.idempotencyKey == null
        ? null
        : uuid(
            body.idempotencyKey,
          )

    return transaction(
      async db => {
        const task =
          await taskFor(
            actor,
            id,
            db,
            true,
          )

        if (key) {
          const prior =
            await db.query(
              `SELECT new_status FROM public.operational_task_event
            WHERE task_id = $1::uuid AND actor_id = $2::uuid AND metadata->>'idempotencyKey' = $3`,
              [
                id,
                actor.id,
                key,
              ],
            )

          if (
            prior.rows.length
          ) {
            if (
              prior.rows[0].new_status !==
              next
            ) {
              fail(
                409,
                'TASK_IDEMPOTENCY_CONFLICT',
                'El identificador ya se usó para otra operación',
              )
            }

            return {
              ok:
                true,

              task:
                mapTask(
                  task,
                  actor,
                ),
            }
          }
        }

        const executor =
          task.assignee_id === actor.id ||
          actor.system_role === 'ADMIN'

        const allowed =
          executor ||
          (
            next === 'CANCELLED' &&
            canAssignTasks(actor)
          )

        if (!allowed) {
          fail(
            403,
            'TASK_STATUS_CHANGE_NOT_ALLOWED',
            'No puedes cambiar el estado de esta tarea',
          )
        }

        if (
          task.status === next
        ) {
          return {
            ok:
              true,

            task:
              mapTask(
                task,
                actor,
              ),
          }
        }

        if (
          terminal(task) ||
          next === 'TODO'
        ) {
          fail(
            409,
            'TASK_TRANSITION_INVALID',
            'La tarea no admite esa transición',
          )
        }

        if (
          next === 'DONE' &&
          task.requires_evidence &&
          Number(
            task.evidence_count,
          ) === 0
        ) {
          fail(
            409,
            'TASK_EVIDENCE_REQUIRED',
            'La tarea requiere evidencia antes de completarse',
          )
        }

        await db.query(
          `UPDATE public.operational_task SET status = $2,
        started_at = CASE WHEN $2 = 'IN_PROGRESS' THEN COALESCE(started_at, NOW()) ELSE started_at END,
        completed_at = CASE WHEN $2 = 'DONE' THEN NOW() ELSE NULL END,
        updated_by = $3::uuid, updated_at = NOW() WHERE id = $1::uuid`,
          [
            id,
            next,
            actor.id,
          ],
        )

        if (key) {
          // Attach the receipt to the event created by
          // the existing trigger in this transaction.

          const receipt =
            await db.query(
              `UPDATE public.operational_task_event
            SET metadata = metadata || jsonb_build_object('idempotencyKey', $4::text)
            WHERE id = (SELECT id FROM public.operational_task_event WHERE task_id = $1::uuid
              AND actor_id = $2::uuid AND event_type = 'STATUS_CHANGED' AND new_status = $3
              AND created_at = transaction_timestamp() ORDER BY created_at DESC LIMIT 1) RETURNING id`,
              [
                id,
                actor.id,
                next,
                key,
              ],
            )

          if (
            !receipt.rows.length
          ) {
            fail(
              409,
              'TASK_AUDIT_UNAVAILABLE',
              'No se pudo registrar la operación; no se guardaron cambios',
            )
          }
        }

        return {
          ok:
            true,

          task:
            mapTask(
              await taskFor(
                actor,
                id,
                db,
              ),
              actor,
            ),
        }
      },
    )
  }

  async function comment(
    actor,
    id,
    body,
  ) {
    const text =
      typeof body.body === 'string'
        ? body.body.trim()
        : ''

    if (
      !text ||
      text.length > 2000
    ) {
      fail(
        400,
        'TASK_COMMENT_INVALID',
        'El comentario debe tener entre 1 y 2000 caracteres',
      )
    }

    const key =
      body.idempotencyKey == null
        ? null
        : uuid(
            body.idempotencyKey,
          )

    return transaction(
      async db => {
        await taskFor(
          actor,
          id,
          db,
          true,
        )

        const { rows } =
          await db.query(
            `INSERT INTO public.operational_task_comment (id, task_id, author_id, body)
        VALUES (COALESCE($1::uuid, gen_random_uuid()), $2::uuid, $3::uuid, $4)
        ON CONFLICT (id) DO NOTHING RETURNING *`,
            [
              key,
              id,
              actor.id,
              text,
            ],
          )

        let record =
          rows[0]

        if (!record) {
          const prior =
            await db.query(
              'SELECT * FROM public.operational_task_comment WHERE id = $1::uuid',
              [key],
            )

          record =
            prior.rows[0]

          if (
            !record ||
            record.task_id !== id ||
            record.author_id !== actor.id ||
            record.body !== text
          ) {
            fail(
              409,
              'TASK_IDEMPOTENCY_CONFLICT',
              'El identificador ya se usó para otro comentario',
            )
          }
        } else {
          await db.query(
            `INSERT INTO public.operational_task_event (task_id, actor_id, event_type, metadata)
            VALUES ($1::uuid, $2::uuid, 'COMMENT_ADDED', jsonb_build_object('commentId', $3::uuid))`,
            [
              id,
              actor.id,
              record.id,
            ],
          )
        }

        return {
          ok:
            true,

          comment:
            record,
        }
      },
    )
  }

  async function detail(
    actor,
    id,
  ) {
    const task =
      await taskFor(
        actor,
        id,
      )

    const [
      comments,
      events,
      evidence,
    ] =
      await Promise.all([
        pool.query(
          `SELECT c.*, p.nombre AS author_name FROM public.operational_task_comment c
        LEFT JOIN public.personas p ON p.id = c.author_id WHERE c.task_id = $1::uuid ORDER BY c.created_at, c.id`,
          [id],
        ),

        pool.query(
          `SELECT e.*, p.nombre AS actor_name FROM public.operational_task_event e
        LEFT JOIN public.personas p ON p.id = e.actor_id WHERE e.task_id = $1::uuid ORDER BY e.created_at, e.id`,
          [id],
        ),

        pool.query(
          `SELECT id, task_id, supervisor_id, status, captured_at, uploaded_at,
            latitude, longitude, accuracy_m, mocked, mime_type, byte_size,
            rejection_reason, storage_bucket, storage_path
        FROM public.visit_evidence WHERE task_id = $1::uuid ORDER BY captured_at, id`,
          [id],
        ),
      ])

    const readableEvidence =
      await Promise.all(
        evidence.rows.map(
          row => signEvidence(row),
        ),
      )

    return {
      task:
        mapTask(
          task,
          actor,
        ),

      comments:
        comments.rows.map(
          row => ({
            id:
              row.id,

            task_id:
              row.task_id,

            author_id:
              row.author_id,

            author_name:
              row.author_name ??
              null,

            body:
              row.body,

            created_at:
              row.created_at,
          }),
        ),

      events:
        events.rows.map(
          row => ({
            id:
              row.id,

            event_type:
              row.event_type,

            actor_name:
              row.actor_name ??
              null,

            previous_status:
              row.previous_status,

            new_status:
              row.new_status,

            created_at:
              row.created_at,
          }),
        ),

      evidence:
        readableEvidence,
    }
  }

  return {
    list,
    assignees,
    create,
    edit,
    status,
    comment,
    detail,
  }
}

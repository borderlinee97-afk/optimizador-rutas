import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createOperationalTasksService,
  mapTask,
} from '../services/operationalTasks.service.js'

const actor = {
  id: '11111111-1111-4111-8111-111111111111',
  rol: 'COORDINADOR',
  system_role: 'USER',
}

const subordinateId = '22222222-2222-4222-8222-222222222222'

const baseRow = {
  id: '33333333-3333-4333-8333-333333333333',
  assignee_id: subordinateId,
  assigned_by: actor.id,
  assigned_by_name: 'Coordinación',
  assignee_name: 'Supervisión',
  plan_item_id: null,
  title: 'Revisar unidad',
  description: null,
  priority: 'HIGH',
  status: 'TODO',
  due_at: null,
  started_at: null,
  completed_at: null,
  requires_evidence: true,
  comment_count: 2,
  evidence_count: 1,
  created_at: '2026-09-18T00:00:00.000Z',
  updated_at: '2026-09-18T00:00:00.000Z',
}

const statusKey = '44444444-4444-4444-8444-444444444444'
const commentKey = '55555555-5555-4555-8555-555555555555'

test('maps task counts and permissions for its assigner', () => {
  const task = mapTask(baseRow, actor)

  assert.equal(task.commentCount, 2)
  assert.equal(task.evidenceCount, 1)

  assert.deepEqual(task.permissions, {
    edit: true,
    cancel: true,
    start: false,
    complete: false,
    comment: true,
    evidence: false,
  })
})

test('lists hierarchy tasks with validated filters', async () => {
  let received

  const pool = {
    async query(sql, values) {
      received = { sql, values }
      return { rows: [baseRow] }
    },
  }

  const service = createOperationalTasksService({
    pool,
    canAccessPersona: async (_actor, target) =>
      target === subordinateId,
  })

  const result = await service.list(actor, {
    mode: 'assigned',
    status: 'TODO',
    priority: 'HIGH',
    assigneeId: subordinateId,
    dueFrom: '2026-09-18T00:00:00.000Z',
    dueTo: '2026-09-19T23:59:59.000Z',
  })

  assert.equal(result.tasks.length, 1)
  assert.match(received.sql, /WITH RECURSIVE scope/)

  assert.deepEqual(
    received.values.slice(1, 6),
    [true, false, 'TODO', 'HIGH', subordinateId],
  )
})

test('rejects an assignment outside the actor hierarchy and rolls back', async () => {
  const statements = []

  const client = {
    async query(sql) {
      statements.push(sql)
      return { rows: [] }
    },
    release() {},
  }

  const service = createOperationalTasksService({
    pool: {
      async connect() {
        return client
      },
    },
    canAccessPersona: async () => false,
  })

  await assert.rejects(
    service.create(actor, {
      assigneeId: subordinateId,
      title: 'Tarea válida',
    }),
    error =>
      error.code === 'TASK_ASSIGNEE_OUT_OF_SCOPE' &&
      error.status === 403,
  )

  assert.deepEqual(statements, ['BEGIN', 'ROLLBACK'])
})

test('rejects invalid state and date filters before querying', async () => {
  const service = createOperationalTasksService({
    pool: {
      async query() {
        throw new Error('should not query')
      },
    },
    canAccessPersona: async () => true,
  })

  await assert.rejects(
    service.list(actor, {
      status: 'UNKNOWN',
    }),
    error =>
      error.code === 'TASK_STATUS_INVALID',
  )

  await assert.rejects(
    service.list(actor, {
      dueFrom: '2026-09-20T00:00:00Z',
      dueTo: '2026-09-18T00:00:00Z',
    }),
    error =>
      error.code === 'TASK_DATE_RANGE_INVALID',
  )
})

test('requires ready evidence before completing a protected task', async () => {
  const statements = []

  const client = {
    async query(sql) {
      statements.push(sql)

      if (sql.includes('SELECT task.*')) {
        return {
          rows: [
            {
              ...baseRow,
              assignee_id: actor.id,
              evidence_count: 0,
            },
          ],
        }
      }

      return { rows: [] }
    },
    release() {},
  }

  const service = createOperationalTasksService({
    pool: {
      async connect() {
        return client
      },
    },
    canAccessPersona: async () => false,
  })

  await assert.rejects(
    service.status(actor, baseRow.id, {
      status: 'DONE',
    }),
    error =>
      error.code === 'TASK_EVIDENCE_REQUIRED' &&
      error.status === 409,
  )

  assert.equal(
    statements.at(-1),
    'ROLLBACK',
  )

  assert.equal(
    statements.some(sql =>
      sql.startsWith(
        'UPDATE public.operational_task SET',
      ),
    ),
    false,
  )
})

test('stores an idempotency receipt when changing task status', async () => {
  const statements = []
  let taskReads = 0

  const client = {
    async query(sql) {
      statements.push(sql)

      if (sql.includes('SELECT task.*')) {
        taskReads += 1

        return {
          rows: [
            {
              ...baseRow,
              assignee_id: actor.id,
              status:
                taskReads === 1
                  ? 'TODO'
                  : 'IN_PROGRESS',
            },
          ],
        }
      }

      if (
        sql.includes(
          "metadata->>'idempotencyKey'",
        )
      ) {
        return { rows: [] }
      }

      if (
        sql.startsWith(
          'UPDATE public.operational_task SET status',
        )
      ) {
        return { rows: [] }
      }

      if (
        sql.startsWith(
          'UPDATE public.operational_task_event',
        )
      ) {
        return {
          rows: [
            {
              id: '66666666-6666-4666-8666-666666666666',
            },
          ],
        }
      }

      return { rows: [] }
    },

    release() {},
  }

  const service = createOperationalTasksService({
    pool: {
      async connect() {
        return client
      },
    },
    canAccessPersona: async () => false,
  })

  const result = await service.status(
    actor,
    baseRow.id,
    {
      status: 'IN_PROGRESS',
      idempotencyKey: statusKey,
    },
  )

  assert.equal(result.ok, true)
  assert.equal(
    result.task.status,
    'IN_PROGRESS',
  )

  assert.equal(
    statements.some(sql =>
      sql.startsWith(
        'UPDATE public.operational_task SET status',
      ),
    ),
    true,
  )

  assert.equal(
    statements.some(sql =>
      sql.startsWith(
        'UPDATE public.operational_task_event',
      ),
    ),
    true,
  )

  assert.equal(
    statements.at(-1),
    'COMMIT',
  )
})

test('replays an already applied status mutation without updating twice', async () => {
  const statements = []

  const client = {
    async query(sql) {
      statements.push(sql)

      if (sql.includes('SELECT task.*')) {
        return {
          rows: [
            {
              ...baseRow,
              assignee_id: actor.id,
              status: 'IN_PROGRESS',
            },
          ],
        }
      }

      if (
        sql.includes(
          "metadata->>'idempotencyKey'",
        )
      ) {
        return {
          rows: [
            {
              new_status: 'IN_PROGRESS',
            },
          ],
        }
      }

      return { rows: [] }
    },

    release() {},
  }

  const service = createOperationalTasksService({
    pool: {
      async connect() {
        return client
      },
    },
    canAccessPersona: async () => false,
  })

  const result = await service.status(
    actor,
    baseRow.id,
    {
      status: 'IN_PROGRESS',
      idempotencyKey: statusKey,
    },
  )

  assert.equal(result.ok, true)

  assert.equal(
    result.task.status,
    'IN_PROGRESS',
  )

  assert.equal(
    statements.some(sql =>
      sql.startsWith(
        'UPDATE public.operational_task SET status',
      ),
    ),
    false,
  )

  assert.equal(
    statements.at(-1),
    'COMMIT',
  )
})

test('rejects a status idempotency key reused for another transition', async () => {
  const statements = []

  const client = {
    async query(sql) {
      statements.push(sql)

      if (sql.includes('SELECT task.*')) {
        return {
          rows: [
            {
              ...baseRow,
              assignee_id: actor.id,
              status: 'IN_PROGRESS',
            },
          ],
        }
      }

      if (
        sql.includes(
          "metadata->>'idempotencyKey'",
        )
      ) {
        return {
          rows: [
            {
              new_status: 'IN_PROGRESS',
            },
          ],
        }
      }

      return { rows: [] }
    },

    release() {},
  }

  const service = createOperationalTasksService({
    pool: {
      async connect() {
        return client
      },
    },
    canAccessPersona: async () => false,
  })

  await assert.rejects(
    service.status(
      actor,
      baseRow.id,
      {
        status: 'DONE',
        idempotencyKey: statusKey,
      },
    ),
    error =>
      error.code === 'TASK_IDEMPOTENCY_CONFLICT' &&
      error.status === 409,
  )

  assert.equal(
    statements.some(sql =>
      sql.startsWith(
        'UPDATE public.operational_task SET status',
      ),
    ),
    false,
  )

  assert.equal(
    statements.at(-1),
    'ROLLBACK',
  )
})

test('replays an already stored comment without creating another audit event', async () => {
  const statements = []

  const existingComment = {
    id: commentKey,
    task_id: baseRow.id,
    author_id: actor.id,
    body: 'Seguimiento sin duplicados',
  }

  const client = {
    async query(sql) {
      statements.push(sql)

      if (sql.includes('SELECT task.*')) {
        return {
          rows: [
            {
              ...baseRow,
              assignee_id: actor.id,
            },
          ],
        }
      }

      if (
        sql.startsWith(
          'INSERT INTO public.operational_task_comment',
        )
      ) {
        return { rows: [] }
      }

      if (
        sql.startsWith(
          'SELECT * FROM public.operational_task_comment',
        )
      ) {
        return {
          rows: [existingComment],
        }
      }

      return { rows: [] }
    },

    release() {},
  }

  const service = createOperationalTasksService({
    pool: {
      async connect() {
        return client
      },
    },
    canAccessPersona: async () => false,
  })

  const result = await service.comment(
    actor,
    baseRow.id,
    {
      body: 'Seguimiento sin duplicados',
      idempotencyKey: commentKey,
    },
  )

  assert.equal(result.ok, true)

  assert.deepEqual(
    result.comment,
    existingComment,
  )

  assert.equal(
    statements.some(sql =>
      sql.startsWith(
        'INSERT INTO public.operational_task_event',
      ),
    ),
    false,
  )

  assert.equal(
    statements.at(-1),
    'COMMIT',
  )
})

test('rejects a comment idempotency key reused for different content', async () => {
  const statements = []

  const client = {
    async query(sql) {
      statements.push(sql)

      if (sql.includes('SELECT task.*')) {
        return {
          rows: [
            {
              ...baseRow,
              assignee_id: actor.id,
            },
          ],
        }
      }

      if (
        sql.startsWith(
          'INSERT INTO public.operational_task_comment',
        )
      ) {
        return { rows: [] }
      }

      if (
        sql.startsWith(
          'SELECT * FROM public.operational_task_comment',
        )
      ) {
        return {
          rows: [
            {
              id: commentKey,
              task_id: baseRow.id,
              author_id: actor.id,
              body: 'Contenido original',
            },
          ],
        }
      }

      return { rows: [] }
    },

    release() {},
  }

  const service = createOperationalTasksService({
    pool: {
      async connect() {
        return client
      },
    },
    canAccessPersona: async () => false,
  })

  await assert.rejects(
    service.comment(
      actor,
      baseRow.id,
      {
        body: 'Contenido diferente',
        idempotencyKey: commentKey,
      },
    ),
    error =>
      error.code === 'TASK_IDEMPOTENCY_CONFLICT' &&
      error.status === 409,
  )

  assert.equal(
    statements.some(sql =>
      sql.startsWith(
        'INSERT INTO public.operational_task_event',
      ),
    ),
    false,
  )

  assert.equal(
    statements.at(-1),
    'ROLLBACK',
  )
})

test('hides task detail when the task is outside the actor hierarchy', async () => {
  const pool = {
    async query(sql) {
      if (sql.includes('SELECT task.*')) {
        return {
          rows: [baseRow],
        }
      }

      throw new Error(
        'No debería consultar detalle adicional',
      )
    },
  }

  const service = createOperationalTasksService({
    pool,
    canAccessPersona: async () => false,
  })

  await assert.rejects(
    service.detail(
      actor,
      baseRow.id,
    ),
    error =>
      error.code === 'TASK_NOT_FOUND' &&
      error.status === 404,
  )
})
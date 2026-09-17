import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const { Pool } = pg
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '..', '..')
const local = readLocalSupabaseEnvironment()

Object.assign(process.env, {
  NODE_ENV: 'production',
  DATABASE_URL: local.DB_URL,
  DB_SSL: 'false',
  FRONTEND_URL: 'http://localhost:5173',
  SUPABASE_URL: local.API_URL,
  SUPABASE_PUBLISHABLE_KEY: local.ANON_KEY,
  SUPABASE_SECRET_KEY: local.SERVICE_ROLE_KEY,
  RATE_LIMIT_MAX: '2000',
  EVIDENCE_REQUIRED_FOR_ACTIVITY: 'true',
  EVIDENCE_REQUIRED_FOR_VISIT_WITHOUT_ACTIVITIES: 'true',
  EVIDENCE_MAX_ACCURACY_M: '100',
  GEOFENCE_RADIUS_M: '200',
  GEOFENCE_MAX_ACCURACY_M: '100',
  GEOFENCE_REQUIRE_ACCURACY: 'true',
  GEOFENCE_REJECT_MOCKED: 'true',
})

const database = new Pool({ connectionString: local.DB_URL })
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`
const password = `Pilot-${randomUUID()}!`
const createdUserIds = []
let server

try {
  const fixtures = await createFixtures()
  const backend = await import('../index.js')
  server = backend.startServer({ port: 0 })
  await onceListening(server)
  const port = server.address().port
  const baseUrl = `http://127.0.0.1:${port}`

  const managerToken = await signIn(fixtures.manager.email, password)
  const supervisorOneToken = await signIn(fixtures.supervisorOne.email, password)
  const supervisorTwoToken = await signIn(fixtures.supervisorTwo.email, password)

  await expectStatus(request(baseUrl, '/api/mobile/tasks'), 401, 'rutas privadas sin sesión')

  const ownPlan = await expectStatus(
    request(baseUrl, '/api/mobile/farmacias/my-plan/today', { token: supervisorOneToken }),
    200,
    'plan propio del supervisor 1',
  )
  assert(ownPlan.items.some(item => item.id === fixtures.itemOne.id), 'El plan propio no contiene la visita sembrada')

  const secondPlan = await expectStatus(
    request(baseUrl, '/api/mobile/farmacias/my-plan/today', { token: supervisorTwoToken }),
    200,
    'plan propio del supervisor 2',
  )
  assert(secondPlan.items.some(item => item.id === fixtures.itemTwo.id), 'El segundo supervisor no tiene un plan independiente')

  await expectStatus(
    request(baseUrl, `/api/mobile/farmacias/items/${fixtures.itemOne.id}/check-in`, {
      method: 'POST', token: supervisorTwoToken, body: nearCoordinates(),
    }),
    404,
    'rechazo de visita ajena',
  )

  const farCheckIn = await expectStatus(
    request(baseUrl, `/api/mobile/farmacias/items/${fixtures.itemOne.id}/check-in`, {
      method: 'POST', token: supervisorOneToken,
      body: { lat: 21.0, lng: -103.0, accuracyM: 10, mocked: false },
    }),
    422,
    'rechazo por geocerca',
  )
  assert(farCheckIn.code === 'OUTSIDE_GEOFENCE', 'La geocerca no devolvió el código esperado')

  await expectStatus(
    request(baseUrl, `/api/mobile/farmacias/items/${fixtures.itemOne.id}/check-in`, {
      method: 'POST', token: supervisorOneToken, body: nearCoordinates(),
    }),
    201,
    'check-in válido',
  )

  const noEvidence = await expectStatus(
    request(baseUrl, `/api/mobile/farmacias/items/${fixtures.itemOne.id}/activities/${fixtures.activityOne.id}/done`, {
      method: 'POST', token: supervisorOneToken, body: { executionNote: 'Prueba' },
    }),
    409,
    'actividad bloqueada sin evidencia',
  )
  assert(noEvidence.code === 'ACTIVITY_EVIDENCE_REQUIRED', 'La actividad no exigió evidencia')

  const visitEvidence = await createAndSyncEvidence({
    baseUrl,
    token: supervisorOneToken,
    userClient: await signedClient(fixtures.supervisorOne.email),
    path: `/api/mobile/evidence/items/${fixtures.itemOne.id}`,
    activityId: fixtures.activityOne.id,
    simulateOfflineRetry: true,
  })

  await expectStatus(
    request(baseUrl, `/api/mobile/evidence/items/${fixtures.itemOne.id}`, { token: supervisorTwoToken }),
    404,
    'rechazo de evidencia ajena',
  )

  const managerEvidence = await expectStatus(
    request(baseUrl, `/api/mobile/evidence/items/${fixtures.itemOne.id}`, { token: managerToken }),
    200,
    'consulta jerárquica de evidencia',
  )
  assert(managerEvidence.evidence.some(item => item.id === visitEvidence.id && item.signedUrl), 'El superior no recibió una URL temporal de lectura')

  await expectStatus(
    request(baseUrl, `/api/mobile/farmacias/items/${fixtures.itemOne.id}/activities/${fixtures.activityOne.id}/done`, {
      method: 'POST', token: supervisorOneToken, body: { executionNote: 'Actividad verificada' },
    }),
    200,
    'cierre de actividad con evidencia',
  )

  await expectStatus(
    request(baseUrl, `/api/mobile/farmacias/items/${fixtures.itemOne.id}/check-out`, {
      method: 'POST', token: supervisorOneToken, body: nearCoordinates(),
    }),
    200,
    'check-out de visita',
  )

  const taskResponse = await expectStatus(
    request(baseUrl, '/api/mobile/tasks', {
      method: 'POST', token: managerToken,
      body: {
        assigneeId: fixtures.supervisorOne.profileId,
        title: 'Validar anaquel de control',
        description: 'Tarea piloto con comentario y evidencia.',
        priority: 'HIGH',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        requiresEvidence: true,
      },
    }),
    201,
    'asignación jerárquica de tarea',
  )
  const task = taskResponse.task

  await expectStatus(
    request(baseUrl, `/api/mobile/tasks/${task.id}/comments`, {
      method: 'POST', token: supervisorTwoToken, body: { body: 'No autorizado' },
    }),
    404,
    'rechazo de tarea ajena',
  )

  await expectStatus(
    request(baseUrl, `/api/mobile/tasks/${task.id}/status`, {
      method: 'PATCH', token: supervisorOneToken, body: { status: 'IN_PROGRESS' },
    }),
    200,
    'inicio de tarea',
  )

  const taskWithoutEvidence = await expectStatus(
    request(baseUrl, `/api/mobile/tasks/${task.id}/status`, {
      method: 'PATCH', token: supervisorOneToken, body: { status: 'DONE' },
    }),
    409,
    'tarea bloqueada sin evidencia',
  )
  assert(taskWithoutEvidence.code === 'TASK_EVIDENCE_REQUIRED', 'La tarea no exigió evidencia')

  await createAndSyncEvidence({
    baseUrl,
    token: supervisorOneToken,
    userClient: await signedClient(fixtures.supervisorOne.email),
    path: `/api/mobile/evidence/tasks/${task.id}`,
  })

  await expectStatus(
    request(baseUrl, `/api/mobile/tasks/${task.id}/comments`, {
      method: 'POST', token: supervisorOneToken, body: { body: 'Resultado validado en campo.' },
    }),
    201,
    'comentario de tarea',
  )

  await expectStatus(
    request(baseUrl, `/api/mobile/tasks/${task.id}/status`, {
      method: 'PATCH', token: supervisorOneToken, body: { status: 'DONE' },
    }),
    200,
    'cierre de tarea con evidencia',
  )

  const taskDetail = await expectStatus(
    request(baseUrl, `/api/mobile/tasks/${task.id}`, { token: managerToken }),
    200,
    'trazabilidad de tarea',
  )
  assert(taskDetail.comments.length === 1, 'No se conservó el comentario de tarea')
  assert(taskDetail.events.some(event => event.event_type === 'STATUS_CHANGED'), 'No se auditó el cambio de estado')
  assert(taskDetail.events.some(event => event.event_type === 'EVIDENCE_ADDED'), 'No se auditó la evidencia')

  const anonymous = createClient(local.API_URL, local.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: anonymousList, error: privateBucketError } = await anonymous.storage.from('visit-evidence').list('', { limit: 1 })
  assert(privateBucketError || anonymousList.length === 0, 'El bucket privado expuso objetos a la clave pública')
  const { error: anonymousDownloadError } = await anonymous.storage
    .from('visit-evidence')
    .download(visitEvidence.storagePath)
  assert(anonymousDownloadError, 'El bucket privado permitió descargar el archivo sin autorización')

  console.log('PASS pilot-e2e: 2 supervisores, geocerca, evidencia offline/idempotente, jerarquía, tareas y almacenamiento privado.')
} finally {
  if (server) await new Promise(resolve => server.close(resolve))
  await database.end()
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId).catch(() => {})
  }
}

async function createFixtures() {
  const manager = await createUser(`manager-${suffix}@example.com`, 'Gerente Piloto')
  const supervisorOne = await createUser(`supervisor-uno-${suffix}@example.com`, 'Supervisor Piloto Uno')
  const supervisorTwo = await createUser(`supervisor-dos-${suffix}@example.com`, 'Supervisor Piloto Dos')

  const managerProfile = await insertProfile(manager.id, 'Gerente Piloto', 'GERENTE', null)
  const supervisorOneProfile = await insertProfile(supervisorOne.id, 'Supervisor Piloto Uno', 'SUPERVISOR', managerProfile.id)
  const supervisorTwoProfile = await insertProfile(supervisorTwo.id, 'Supervisor Piloto Dos', 'SUPERVISOR', managerProfile.id)

  const pharmacyOne = (await database.query(
    `INSERT INTO public.farmacia (clues, unidad, direccion, latitud, longitud, estado, proyecto)
     VALUES ($1, 'Farmacia E2E', 'Punto de prueba local', 20.6736000, -103.3440000, 'Jalisco', 'PILOTO')
     RETURNING id`,
    [`E2E-1-${suffix}`],
  )).rows[0]

  const pharmacyTwo = (await database.query(
    `INSERT INTO public.farmacia (clues, unidad, direccion, latitud, longitud, estado, proyecto)
     VALUES ($1, 'Farmacia E2E Dos', 'Segundo punto de prueba local', 20.6737000, -103.3441000, 'Jalisco', 'PILOTO')
     RETURNING id`,
    [`E2E-2-${suffix}`],
  )).rows[0]

  await database.query(
    `INSERT INTO public.pharmacy_supervisor_assignment (pharmacy_id, supervisor_id, assigned_by, assignment_comment)
     VALUES ($1, $2::uuid, $3::uuid, 'Prueba E2E'), ($4, $5::uuid, $3::uuid, 'Prueba E2E')`,
    [pharmacyOne.id, supervisorOneProfile.id, managerProfile.id, pharmacyTwo.id, supervisorTwoProfile.id],
  )

  const itemOne = await insertPlanAndItem(supervisorOneProfile.id, managerProfile.id, pharmacyOne.id)
  const itemTwo = await insertPlanAndItem(supervisorTwoProfile.id, managerProfile.id, pharmacyTwo.id)
  const activityOne = (await database.query(
    `INSERT INTO public.pharmacy_activity (plan_item_id, activity_type, note, created_by, ord)
     VALUES ($1::uuid, 'Validar inventario', 'Actividad piloto', $2::uuid, 1) RETURNING id`,
    [itemOne.id, supervisorOneProfile.id],
  )).rows[0]

  return {
    manager: { ...manager, profileId: managerProfile.id },
    supervisorOne: { ...supervisorOne, profileId: supervisorOneProfile.id },
    supervisorTwo: { ...supervisorTwo, profileId: supervisorTwoProfile.id },
    itemOne,
    itemTwo,
    activityOne,
  }
}

async function createUser(email, name) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, e2e: true },
  })
  if (error) throw error
  createdUserIds.push(data.user.id)
  return { id: data.user.id, email }
}

async function insertProfile(authUserId, name, role, superiorId) {
  return (await database.query(
    `INSERT INTO public.personas (
       nombre, auth_user_id, area, rol, superior_id, activo,
       pharmacy_scope_mode, system_role, allowed_areas
     ) VALUES ($1, $2::uuid, 'FARMACIAS', $3::public.role_type, $4::uuid, TRUE,
       $5, 'USER', ARRAY['FARMACIAS']::text[]) RETURNING id`,
    [name, authUserId, role, superiorId, role === 'SUPERVISOR' ? 'ASSIGNED_ONLY' : 'ALL'],
  )).rows[0]
}

async function insertPlanAndItem(supervisorId, managerId, pharmacyId) {
  const plan = (await database.query(
     `INSERT INTO public.work_plan (
       supervisor_id, status, period_start, period_end, week_start,
       created_by, approved_by, approved_at
     ) VALUES ($1::uuid, 'APPROVED', date_trunc('week', CURRENT_DATE)::date,
       (date_trunc('week', CURRENT_DATE) + INTERVAL '6 days')::date,
       date_trunc('week', CURRENT_DATE)::date,
       $2::uuid, $2::uuid, NOW()) RETURNING id`,
    [supervisorId, managerId],
  )).rows[0]

  return (await database.query(
    `INSERT INTO public.work_plan_item (
       plan_id, pharmacy_id, scheduled_date, scheduled_time, ord, required, status
     ) VALUES ($1::uuid, $2, CURRENT_DATE, LOCALTIME, 1, TRUE, 'PENDING') RETURNING id`,
    [plan.id, pharmacyId],
  )).rows[0]
}

async function signIn(email, userPassword) {
  const client = createClient(local.API_URL, local.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password: userPassword })
  if (error || !data.session) throw error ?? new Error('No se generó sesión')
  return data.session.access_token
}

async function signedClient(email) {
  const client = createClient(local.API_URL, local.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}

async function createAndSyncEvidence({ baseUrl, token, userClient, path: endpoint, activityId, simulateOfflineRetry = false }) {
  const evidenceId = randomUUID()
  const body = {
    evidenceId,
    idempotencyKey: evidenceId,
    activityId,
    capturedAt: new Date().toISOString(),
    latitude: 20.6736,
    longitude: -103.344,
    accuracyM: 8,
    mocked: false,
    mimeType: 'image/jpeg',
    byteSize: 4,
  }

  const ticket = await expectStatus(
    request(baseUrl, endpoint, { method: 'POST', token, body }),
    201,
    'creación de ticket de evidencia',
  )

  if (simulateOfflineRetry) {
    const pendingComplete = await expectStatus(
      request(baseUrl, `/api/mobile/evidence/${evidenceId}/complete`, { method: 'POST', token }),
      409,
      'reintento pendiente sin archivo',
    )
    assert(pendingComplete.code === 'EVIDENCE_UPLOAD_NOT_FOUND', 'El servidor marcó evidencia no cargada como lista')

    const retryTicket = await expectStatus(
      request(baseUrl, endpoint, { method: 'POST', token, body }),
      200,
      'reintento idempotente',
    )
    assert(retryTicket.evidence.id === ticket.evidence.id, 'El reintento duplicó la evidencia')
    ticket.upload = retryTicket.upload
  }

  const { error: uploadError } = await userClient.storage
    .from('visit-evidence')
    .uploadToSignedUrl(ticket.upload.path, ticket.upload.token, new Uint8Array([255, 216, 255, 217]), {
      contentType: 'image/jpeg',
      upsert: true,
    })
  if (uploadError) throw uploadError

  await expectStatus(
    request(baseUrl, `/api/mobile/evidence/${evidenceId}/complete`, { method: 'POST', token }),
    200,
    'confirmación de evidencia',
  )
  return {
    ...ticket.evidence,
    storagePath: ticket.upload.path,
  }
}

function nearCoordinates() {
  return { lat: 20.67361, lng: -103.34401, accuracyM: 8, mocked: false }
}

async function request(baseUrl, pathname, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json().catch(() => ({}))
  return { status: response.status, payload }
}

async function expectStatus(promise, expected, label) {
  const { status, payload } = await promise
  if (status !== expected) {
    throw new Error(`${label}: esperaba HTTP ${expected}, recibió ${status} (${payload.code ?? payload.error ?? 'sin detalle'})`)
  }
  return payload
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function onceListening(httpServer) {
  if (httpServer.listening) return Promise.resolve()
  return new Promise((resolve, reject) => {
    httpServer.once('listening', resolve)
    httpServer.once('error', reject)
  })
}

function readLocalSupabaseEnvironment() {
  const cli = path.join(repositoryRoot, 'node_modules', 'supabase', 'dist', 'supabase.js')
  const output = execFileSync(process.execPath, [cli, 'status', '-o', 'env'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const values = {}
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match) continue
    values[match[1]] = match[2].replace(/^"|"$/g, '')
  }
  for (const name of ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY', 'DB_URL']) {
    if (!values[name]) throw new Error(`Supabase local no informó ${name}`)
  }
  return values
}

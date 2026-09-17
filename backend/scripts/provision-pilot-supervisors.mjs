import 'dotenv/config'

import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const { Pool } = pg
const apply = process.argv.includes('--apply')

const required = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'PILOT_SUPERVISOR_1_EMAIL',
  'PILOT_SUPERVISOR_1_NAME',
  'PILOT_SUPERVISOR_1_PASSWORD',
  'PILOT_SUPERVISOR_2_EMAIL',
  'PILOT_SUPERVISOR_2_NAME',
  'PILOT_SUPERVISOR_2_PASSWORD',
]

const missing = required.filter(name => !String(process.env[name] ?? '').trim())
if (missing.length > 0) {
  throw new Error(`Faltan variables requeridas: ${missing.join(', ')}`)
}

const supervisors = [1, 2].map(index => ({
  email: process.env[`PILOT_SUPERVISOR_${index}_EMAIL`].trim().toLowerCase(),
  name: process.env[`PILOT_SUPERVISOR_${index}_NAME`].trim(),
  password: process.env[`PILOT_SUPERVISOR_${index}_PASSWORD`],
}))

for (const supervisor of supervisors) {
  if (!supervisor.email.includes('@')) throw new Error('Correo de supervisor no válido')
  if (supervisor.name.length < 3) throw new Error('Nombre de supervisor no válido')
  if (supervisor.password.length < 12) throw new Error('Cada contraseña debe tener al menos 12 caracteres')
}

if (!apply) {
  console.log('Previsualización válida: se crearán o vincularán dos supervisores de Farmacias.')
  console.log('Ejecuta el mismo comando con --apply únicamente contra el proyecto confirmado.')
  process.exit(0)
}

const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: String(process.env.DB_SSL ?? '').toLowerCase() === 'true'
    ? { rejectUnauthorized: false }
    : false,
})

try {
  const managerId = await resolveManager(pool)
  const createdProfiles = []

  for (const supervisor of supervisors) {
    const user = await ensureAuthUser(admin, supervisor)
    const profile = await ensureProfile(pool, user.id, supervisor.name, managerId)
    createdProfiles.push(profile)
  }

  console.log(`Listo: ${createdProfiles.length} supervisores vinculados y activos.`)
} finally {
  await pool.end()
}

async function resolveManager(database) {
  const managerEmail = String(process.env.PILOT_MANAGER_EMAIL ?? '').trim().toLowerCase()
  const result = managerEmail
    ? await database.query(
        `SELECT p.id FROM public.personas p INNER JOIN auth.users u ON u.id = p.auth_user_id
         WHERE p.area::text = 'FARMACIAS' AND p.rol::text = 'GERENTE' AND p.activo = TRUE
           AND lower(u.email) = $1 LIMIT 2`,
        [managerEmail],
      )
    : await database.query(
        `SELECT id FROM public.personas
         WHERE area::text = 'FARMACIAS' AND rol::text = 'GERENTE' AND activo = TRUE
         ORDER BY created_at ASC LIMIT 2`,
      )

  if (result.rowCount !== 1) {
    throw new Error('No se pudo determinar un gerente único; define PILOT_MANAGER_EMAIL')
  }

  return result.rows[0].id
}

async function ensureAuthUser(client, supervisor) {
  let page = 1
  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error
    const existing = data.users.find(user => user.email?.toLowerCase() === supervisor.email)
    if (existing) {
      if (String(process.env.PILOT_RESET_EXISTING_PASSWORDS ?? '').toLowerCase() === 'true') {
        const { data: updated, error: updateError } = await client.auth.admin.updateUserById(
          existing.id,
          { password: supervisor.password, email_confirm: true },
        )
        if (updateError) throw updateError
        return updated.user
      }
      return existing
    }
    if (data.users.length < 100) break
    page += 1
  }

  const { data, error } = await client.auth.admin.createUser({
    email: supervisor.email,
    password: supervisor.password,
    email_confirm: true,
    user_metadata: { name: supervisor.name, pilot: true },
  })
  if (error) throw error
  return data.user
}

async function ensureProfile(database, authUserId, name, managerId) {
  const existing = await database.query(
    'SELECT id FROM public.personas WHERE auth_user_id = $1::uuid LIMIT 1',
    [authUserId],
  )

  if (existing.rowCount > 0) {
    const result = await database.query(
      `UPDATE public.personas SET nombre = $2, area = 'FARMACIAS', rol = 'SUPERVISOR',
       superior_id = $3::uuid, activo = TRUE, pharmacy_scope_mode = 'ASSIGNED_ONLY',
       system_role = 'USER', allowed_areas = ARRAY['FARMACIAS']::text[], updated_at = NOW()
       WHERE id = $1::uuid RETURNING id`,
      [existing.rows[0].id, name, managerId],
    )
    return result.rows[0]
  }

  const result = await database.query(
    `INSERT INTO public.personas (
       nombre, auth_user_id, area, rol, superior_id, activo,
       pharmacy_scope_mode, system_role, allowed_areas
     ) VALUES ($1, $2::uuid, 'FARMACIAS', 'SUPERVISOR', $3::uuid, TRUE,
       'ASSIGNED_ONLY', 'USER', ARRAY['FARMACIAS']::text[])
     RETURNING id`,
    [name, authUserId, managerId],
  )
  return result.rows[0]
}

// Usa una base nueva y desechable, exclusivamente en PostgreSQL de localhost.
import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { getTerritory, listTerritorialSupervisors } from '../services/supervisorTerritorialRoute.service.js'
import express from 'express'
import { createTerritorialRouter } from '../routes/web.supervisorTerritorialRoutes.route.js'
import { requireAuth } from '../middleware/requireAuth.js'

test(
  'territorial permissions, origin migration and HTTP contract on disposable PostgreSQL',
  { skip: !process.env.TEST_ADMIN_DATABASE_URL },
  async () => {
    const url = new URL(process.env.TEST_ADMIN_DATABASE_URL)
    assert.ok(['localhost', '127.0.0.1', '::1'].includes(url.hostname), 'Only localhost is allowed')
    url.pathname = '/postgres'
    const control = new Pool({ connectionString: url.toString(), max: 1 })
    const name = 'routes_territorial_test_' + randomUUID().replaceAll('-', '')
    let pool,
      client,
      created = false
    const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
    const db = { query: (sql, params) => client.query(sql, params) }
    try {
      await control.query(`CREATE DATABASE "${name}"`)
      created = true
      url.pathname = '/' + name
      pool = new Pool({ connectionString: url.toString(), max: 1 })
      client = await pool.connect()
      await client.query(`
    CREATE TABLE personas (id uuid PRIMARY KEY, nombre text, rol text, area text, activo boolean,
      superior_id uuid, pharmacy_scope_mode text, system_role text);
    CREATE TABLE farmacia (id bigint PRIMARY KEY, unidad text, clues text, direccion text,
      estado text, proyecto text, estatus text, latitud numeric, longitud numeric);
    CREATE TABLE person_state_scope (persona_id uuid, estado text, revoked_at timestamptz);
    CREATE TABLE pharmacy_supervisor_assignment (pharmacy_id bigint, supervisor_id uuid, revoked_at timestamptz);
    CREATE TABLE pharmacy_coordinator_assignment (pharmacy_id bigint, coordinator_id uuid, revoked_at timestamptz);
    CREATE TABLE puebla_supervisor_coordinator (coordinator_id uuid, supervisor_id uuid, revoked_at timestamptz);
  `)
      const policy = await readFile(
        new URL('../../supabase/migrations/20261018120000_puebla_shared_reporting_availability.sql', import.meta.url),
        'utf8'
      )
      for (const fn of ['puebla_shared_supervisor', 'puebla_shared_pharmacy']) {
        const definition = policy.match(new RegExp('CREATE FUNCTION public\\.' + fn + '\\([\\s\\S]*?\\$\\$;'))
        assert.ok(definition, fn)
        await client.query(definition[0])
      }
      const migration = await readFile(
        new URL('../sql/20260912_supervisor_territorial_origin.sql', import.meta.url),
        'utf8'
      )
      await db.query(migration)
      await db.query(migration) // idempotencia
      await client.query('BEGIN')
      for (const [n, role, superior] of [
        [1, 'GERENTE', null],
        [2, 'COORDINADOR', 1],
        [3, 'SUPERVISOR', 2],
        [4, 'SUPERVISOR', 2],
        [5, 'GERENTE', null],
        [6, 'COORDINADOR', 5],
        [7, 'SUPERVISOR', 6]
      ]) {
        await db.query(
          `INSERT INTO public.personas (id,nombre,rol,area,activo,superior_id,pharmacy_scope_mode,system_role)
      VALUES ($1,$2,$3,'FARMACIAS',true,$4,'ASSIGNED_ONLY','USER')`,
          [id(n), `Persona ${n}`, role, superior ? id(superior) : null]
        )
        await db.query("INSERT INTO public.person_state_scope (persona_id,estado) VALUES ($1,'Jalisco')", [id(n)])
      }
      for (const [unit, owner, coordinator, revoked] of [
        [1, 3, 2, false],
        [2, 4, 2, false],
        [3, 7, 6, false],
        [4, 3, 2, true]
      ]) {
        await db.query(
          "INSERT INTO public.farmacia (id,unidad,estado,proyecto,latitud,longitud) VALUES ($1,$2,'Jalisco','Proyecto A',20,-103)",
          [unit, `Unidad ${unit}`]
        )
        await db.query(
          'INSERT INTO public.pharmacy_supervisor_assignment (pharmacy_id,supervisor_id,revoked_at) VALUES ($1,$2,$3)',
          [unit, id(owner), revoked ? new Date() : null]
        )
        await db.query(
          'INSERT INTO public.pharmacy_coordinator_assignment (pharmacy_id,coordinator_id) VALUES ($1,$2)',
          [unit, id(coordinator)]
        )
      }
      const actor = (n, rol) => ({ id: id(n), area: 'FARMACIAS', rol, system_role: 'USER' })
      assert.deepEqual(
        (await listTerritorialSupervisors(db, actor(1, 'GERENTE'))).map((s) => s.id),
        [id(3), id(4)]
      )
      assert.deepEqual(
        (await listTerritorialSupervisors(db, actor(2, 'COORDINADOR'))).map((s) => s.id),
        [id(3), id(4)]
      )
      const own = await getTerritory(db, actor(3, 'SUPERVISOR'), id(3))
      assert.deepEqual(
        own.units.map((u) => u.id),
        [1]
      ) // revoked_at excluido
      assert.equal(own.units[0].proyecto, 'Proyecto A')
      await assert.rejects(getTerritory(db, actor(3, 'SUPERVISOR'), id(4)), { status: 403 })
      await assert.rejects(getTerritory(db, actor(1, 'GERENTE'), id(7)), { status: 403 })
      await assert.rejects(getTerritory(db, actor(2, 'COORDINADOR'), id(7)), { status: 403 })
      await db.query("UPDATE public.personas SET pharmacy_scope_mode='ALL' WHERE id=$1", [id(3)])
      assert.equal(
        (await getTerritory(db, { ...actor(3, 'SUPERVISOR'), pharmacy_scope_mode: 'ALL' }, id(3))).units.length,
        1
      )
      await assert.rejects(getTerritory(db, { ...actor(3, 'SUPERVISOR'), pharmacy_scope_mode: 'ALL' }, id(4)), {
        status: 403
      })
      await db.query("UPDATE public.farmacia SET estado='Colima' WHERE id=1")
      await assert.rejects(getTerritory(db, actor(1, 'GERENTE'), id(3)), { status: 403 })
      await db.query("UPDATE public.farmacia SET estado='Jalisco' WHERE id=1")
      await db.query('UPDATE public.pharmacy_coordinator_assignment SET coordinator_id=$1 WHERE pharmacy_id=1', [id(6)])
      await assert.rejects(getTerritory(db, actor(2, 'COORDINADOR'), id(3)), { status: 403 })
      await assert.rejects(getTerritory(db, actor(1, 'GERENTE'), id(3)), { status: 403 })
      await db.query('UPDATE public.pharmacy_coordinator_assignment SET coordinator_id=$1 WHERE pharmacy_id=1', [id(2)])
      await db.query(
        `INSERT INTO public.supervisor_territorial_origin (supervisor_id,name,lat,lng,updated_by) VALUES ($1,'Base A',20,-103,$2)`,
        [id(3), id(1)]
      )
      assert.equal((await getTerritory(db, actor(3, 'SUPERVISOR'), id(3))).origin.name, 'Base A')
      await db.query('SAVEPOINT invalid_origin')
      await assert.rejects(
        db.query('UPDATE public.supervisor_territorial_origin SET lat=100 WHERE supervisor_id=$1', [id(3)]),
        { code: '23514' }
      )
      await db.query('ROLLBACK TO SAVEPOINT invalid_origin')
      const rls = await client.query(
        "SELECT relrowsecurity FROM pg_class WHERE oid='public.supervisor_territorial_origin'::regclass"
      )
      assert.equal(rls.rows[0].relrowsecurity, true)
      // Contrato HTTP con perfiles de prueba (sin fingir tokens Supabase reales).
      // El servicio SQL, el router y la persistencia sí son los de producción.
      const app = express()
      app.use(express.json())
      app.get('/auth-check', requireAuth, (req, res) => res.json({ ok: true }))
      app.use(
        '/territory',
        (req, res, next) => {
          req.profile = req.headers['x-test-actor'] === 'supervisor' ? actor(3, 'SUPERVISOR') : actor(1, 'GERENTE')
          next()
        },
        createTerritorialRouter(db, async (territory, options) => {
          const { calculateTerritorialRoute } = await import('../services/supervisorTerritorialRoute.service.js')
          return calculateTerritorialRoute(territory, options, async () => ({
            distanceMeters: 1000,
            duration: '120s',
            polyline: { encodedPolyline: 'abcd' }
          }))
        })
      )
      app.use((err, req, res, next) => res.status(err.status || 500).json({ code: err.code, error: err.message }))
      const server = await new Promise((resolve) => {
        const server = app.listen(0, '127.0.0.1', () => resolve(server))
      })
      try {
        const base = `http://127.0.0.1:${server.address().port}`
        const call = (path, method = 'GET', body, extra = {}) =>
          fetch(`${base}/territory${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', ...extra },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
          })
        assert.equal((await fetch(`${base}/auth-check`)).status, 401)
        assert.equal((await call('')).status, 200)
        assert.equal((await call(`/${id(3)}`)).status, 200)
        assert.equal((await call(`/${id(3)}/origin`)).status, 200)
        assert.equal((await call(`/${id(4)}/calculate`, 'POST', {})).status, 422)
        assert.equal((await call(`/${id(3)}/origin`, 'PUT', { name: 'Nueva base', lat: 21, lng: -103 })).status, 200)
        assert.equal((await call(`/${id(3)}/origin`, 'PUT', { name: 'Inválida', lat: null, lng: -103 })).status, 400)
        assert.equal(
          (
            await call(
              `/${id(4)}/origin`,
              'PUT',
              { name: 'Ajena', lat: 21, lng: -103 },
              { 'x-test-actor': 'supervisor' }
            )
          ).status,
          403
        )
        const individual = await (await call(`/${id(3)}/calculate`, 'POST', {})).json()
        assert.equal(individual.returnToOrigin, true)
        assert.equal(individual.origin.name, 'Nueva base')
        assert.equal((await call('/calculate-all', 'POST', { returnToOrigin: 'false' })).status, 400)
        const batch = await (await call('/calculate-all', 'POST', {})).json()
        assert.equal(batch.summary.supervisorsCalculated, 1)
        assert.equal(batch.summary.supervisorsWithError, 1)
        assert.equal(batch.results[1].error.code, 'ORIGIN_REQUIRED')
        console.log(
          'PASS: HTTP listado, detalle, GET/PUT origen, cálculo individual/general, 401, 403, 400 y error individual 422.'
        )
      } finally {
        await new Promise((resolve) => server.close(resolve))
      }
      console.log(
        'PASS: migración idempotente, origen, restricciones, RLS, jerarquía, estados, proyectos, ALL y asignaciones revocadas (base desechable).'
      )
    } finally {
      if (client) {
        await client.query('ROLLBACK')
        client.release()
      }
      if (pool) await pool.end()
      try {
        if (created) await control.query(`DROP DATABASE "${name}"`)
      } finally {
        await control.end()
      }
    }
  }
)

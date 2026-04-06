import { pool } from '../db/pool.js'

export async function listAssignments(req, res) {
  const { date, personId, role } = req.query
  const where = []
  const params = []
  let i=1

  if (date){ where.push(`"date"=$${i++}`); params.push(date) }
  if (personId){ where.push(`person_id=$${i++}`); params.push(personId) }
  if (role){ where.push(`role=$${i++}`); params.push(role) }

  const sql = `
    SELECT id, route_template_id, route_version, role, person_id, "date",
           overrides, status, notes, created_at
    FROM route_assignments
    ${where.length ? 'WHERE '+where.join(' AND ') : ''}
    ORDER BY "date" DESC, created_at DESC
  `
  const { rows } = await pool.query(sql, params)
  res.json(rows)
}

export async function createAssignment(req, res) {
  const { routeTemplateId, routeVersion, role, personId, date, overrides, notes } = req.body
  const sql = `
    INSERT INTO route_assignments
      (route_template_id, route_version, role, person_id, "date", overrides, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *
  `
  const { rows } = await pool.query(sql, [
    routeTemplateId, Number(routeVersion), role, personId, date, overrides ?? {}, notes ?? null
  ])
  res.status(201).json(rows[0])
}

export async function updateAssignment(req, res) {
  const { id } = req.params
  const { status, overrides, notes } = req.body

  const fields = []
  const params = []
  let i=1

  if (status !== undefined){ fields.push(`status=$${i++}`); params.push(status) }
  if (overrides !== undefined){ fields.push(`overrides=$${i++}`); params.push(overrides) }
  if (notes !== undefined){ fields.push(`notes=$${i++}`); params.push(notes) }

  if (!fields.length) return res.status(400).json({ error: 'No fields to update' })

  const sql = `UPDATE route_assignments SET ${fields.join(', ')} WHERE id=$${i} RETURNING *`
  params.push(id)
  const { rows } = await pool.query(sql, params)
  if (!rows.length) return res.status(404).json({ error: 'Not found' })
  res.json(rows[0])
}
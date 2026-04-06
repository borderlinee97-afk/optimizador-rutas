// backend/controllers/routeTemplates.controller.js
import { pool } from '../db/pool.js'

/** Utilidad: responde error 400/500 con detalle y log */
function sendDbError(res, e, fallbackMsg = 'Error en operación de base de datos') {
  console.error('[route-templates][DB]', e?.message, e?.stack)
  const msg = (e?.message || '').toLowerCase()
  const isBadInput =
    msg.includes('invalid input') ||
    msg.includes('violates') ||
    msg.includes('foreign key') ||
    msg.includes('null value') ||
    msg.includes('uuid') ||
    msg.includes('bigint') ||
    msg.includes('enum') ||
    msg.includes('syntax')
  if (isBadInput) {
    return res.status(400).json({ error: e.message })
  }
  return res.status(500).json({ error: fallbackMsg })
}

/** GET /route-templates?type=DELIVERY|SUPERVISOR&active=true */
export async function listTemplates(req, res) {
  try {
    const { type, active } = req.query
    const params = []
    const where = []

    if (type) { params.push(type); where.push(`type = $${params.length}`) }
    if (active !== undefined) { params.push(active === 'true'); where.push(`active = $${params.length}`) }

    const sql = `
      SELECT id, type, name, color, default_origin_lat, default_origin_lng,
             default_origin_pharmacy_id, supervisor_id, active, current_version,
             created_at, updated_at
      FROM route_templates
      ${where.length ? 'WHERE '+where.join(' AND ') : ''}
      ORDER BY updated_at DESC
    `
    const { rows } = await pool.query(sql, params)
    res.json(rows)
  } catch (e) {
    return sendDbError(res, e, 'Error listando plantillas')
  }
}

/** GET /route-templates/:id */
export async function getTemplateById(req, res) {
  try {
    const { id } = req.params
    const sql = `
      SELECT id, type, name, color, default_origin_lat, default_origin_lng,
             default_origin_pharmacy_id, supervisor_id, active, current_version,
             created_at, updated_at
      FROM route_templates WHERE id = $1
    `
    const { rows } = await pool.query(sql, [id])
    if (!rows.length) return res.status(404).json({ error: 'Plantilla no encontrada' })
    res.json(rows[0])
  } catch (e) {
    return sendDbError(res, e, 'Error obteniendo plantilla')
  }
}

/** GET /route-templates/:id/versions/:version */
export async function getTemplateVersion(req, res) {
  try {
    const { id, version } = req.params
    const sqlV = `
      SELECT id, route_template_id, version, strategy, options, created_at, created_by,
             region_sanitaria
      FROM route_template_versions
      WHERE route_template_id = $1 AND version = $2
    `
    const { rows: vrows } = await pool.query(sqlV, [id, Number(version)])
    if (!vrows.length) return res.status(404).json({ error: 'Versión no encontrada' })
    const ver = vrows[0]

    const sqlS = `
      SELECT id, pharmacy_id, seq, required, notes
      FROM route_template_stops
      WHERE route_template_version_id = $1
      ORDER BY seq ASC
    `
    const { rows: srows } = await pool.query(sqlS, [ver.id])
    res.json({ version: ver, stops: srows })
  } catch (e) {
    return sendDbError(res, e, 'Error obteniendo versión de plantilla')
  }
}

/** POST /route-templates */
export async function createTemplate(req, res) {
  try {
    const {
      type, name, color,
      defaultOrigin,  // {lat,lng} o {pharmacyId: BIGINT}
      supervisorId,
      active = true
    } = req.body

    if (!type || !name) {
      return res.status(400).json({ error: 'type y name son requeridos' })
    }
    if (type !== 'DELIVERY' && type !== 'SUPERVISOR') {
      return res.status(400).json({ error: 'type debe ser DELIVERY o SUPERVISOR' })
    }

    let doLat=null, doLng=null, doPh=null, supId=null
    if (defaultOrigin?.lat != null && defaultOrigin?.lng != null) {
      doLat = Number(defaultOrigin.lat)
      doLng = Number(defaultOrigin.lng)
    } else if (defaultOrigin?.pharmacyId != null) {
      doPh = Number(defaultOrigin.pharmacyId) // FK BIGINT hacia farmacia(id)
    }
    if (supervisorId) supId = supervisorId // UUID o null

    const insTpl = `
      INSERT INTO route_templates
        (type, name, color, default_origin_lat, default_origin_lng,
         default_origin_pharmacy_id, supervisor_id, active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `
    const { rows } = await pool.query(insTpl, [
      type, name, color ?? '#1565C0', doLat, doLng, doPh ?? null, supId ?? null, !!active
    ])
    const tpl = rows[0]

    // Crea versión 1 vacía (estrategia por defecto según tipo)
    const vsql = `
      INSERT INTO route_template_versions
        (route_template_id, version, strategy, options, region_sanitaria)
      VALUES ($1, 1, $2, '{}'::jsonb, NULL)
      RETURNING *
    `
    const defaultStrategy = type === 'SUPERVISOR' ? 'MANUAL' : 'FASTEST'
    await pool.query(vsql, [tpl.id, defaultStrategy])

    res.status(201).json(tpl)
  } catch (e) {
    return sendDbError(res, e, 'No se pudo crear la plantilla')
  }
}

/** PATCH /route-templates/:id */
export async function updateTemplateHeader(req, res) {
  try {
    const { id } = req.params
    const { name, color, active, supervisorId, defaultOrigin } = req.body

    const fields = []
    const params = []
    let i = 1

    if (name !== undefined) { fields.push(`name=$${i++}`); params.push(name) }
    if (color !== undefined){ fields.push(`color=$${i++}`); params.push(color) }
    if (active !== undefined){ fields.push(`active=$${i++}`); params.push(!!active) }
    if (supervisorId !== undefined){ fields.push(`supervisor_id=$${i++}`); params.push(supervisorId) }

    if (defaultOrigin !== undefined) {
      let doLat=null, doLng=null, doPh=null
      if (defaultOrigin?.lat != null && defaultOrigin?.lng != null) {
        doLat = Number(defaultOrigin.lat); doLng = Number(defaultOrigin.lng)
      } else if (defaultOrigin?.pharmacyId != null) {
        doPh = Number(defaultOrigin.pharmacyId)
      }
      fields.push(`default_origin_lat=$${i++}`); params.push(doLat)
      fields.push(`default_origin_lng=$${i++}`); params.push(doLng)
      fields.push(`default_origin_pharmacy_id=$${i++}`); params.push(doPh)
    }

    if (!fields.length) return res.status(400).json({ error: 'No hay campos a actualizar' })

    const sql = `
      UPDATE route_templates
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${i}
      RETURNING *
    `
    params.push(id)
    const { rows } = await pool.query(sql, params)
    if (!rows.length) return res.status(404).json({ error: 'Plantilla no encontrada' })
    res.json(rows[0])
  } catch (e) {
    return sendDbError(res, e, 'No se pudo actualizar la plantilla')
  }
}

/** POST /route-templates/:id/versions */
export async function createNewVersion(req, res) {
  const { id } = req.params
  const {
    strategy = 'FASTEST',
    options = {},
    stops = [],
    createdBy,
    regionSanitaria // <--- la recibimos del front y la guardamos
  } = req.body

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const curSql = `SELECT current_version FROM route_templates WHERE id=$1 FOR UPDATE`
    const { rows: cur } = await client.query(curSql, [id])
    if (!cur.length) throw new Error('Plantilla no encontrada')

    const newVersion = (cur[0].current_version || 1) + 1

    const vsql = `
      INSERT INTO route_template_versions
        (route_template_id, version, strategy, options, created_by, region_sanitaria)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id
    `
    const { rows: vrows } = await client.query(vsql, [
      id, newVersion, strategy, options, createdBy ?? null, regionSanitaria ?? null
    ])
    const versionId = vrows[0].id

    // Insert stops con secuencia (BIGINT para pharmacy_id)
    for (let i=0;i<stops.length;i++){
      const s = stops[i]
      if (s?.pharmacyId == null) continue
      const pharmacyId = Number(s.pharmacyId)
      await client.query(
        `INSERT INTO route_template_stops
          (route_template_version_id, pharmacy_id, seq, required, notes)
         VALUES ($1,$2,$3,$4,$5)`,
        [versionId, pharmacyId, i+1, !!s.required, s.notes ?? null]
      )
    }

    // Actualiza current_version
    await client.query(
      `UPDATE route_templates SET current_version=$1, updated_at=NOW() WHERE id=$2`,
      [newVersion, id]
    )

    await client.query('COMMIT')
    res.status(201).json({ routeTemplateId: id, version: newVersion, stops: stops.length, region_sanitaria: regionSanitaria ?? null })
  } catch (e) {
    await client.query('ROLLBACK')
    return sendDbError(res, e, 'No se pudo crear la nueva versión')
  } finally {
    client.release()
  }
}

/** POST /route-templates/:id/duplicate */
export async function duplicateTemplate(req, res) {
  const { id } = req.params
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: srcT } = await client.query(
      `SELECT * FROM route_templates WHERE id=$1`, [id]
    )
    if (!srcT.length) throw new Error('Plantilla no encontrada')
    const src = srcT[0]

    // Clona cabecera
    const insT = `
      INSERT INTO route_templates
        (type, name, color, default_origin_lat, default_origin_lng,
         default_origin_pharmacy_id, supervisor_id, active, current_version)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1)
      RETURNING id
    `
    const { rows: newT } = await client.query(insT, [
      src.type, `${src.name} (copia)`, src.color,
      src.default_origin_lat, src.default_origin_lng, src.default_origin_pharmacy_id,
      src.supervisor_id, src.active
    ])
    const newId = newT[0].id

    // Última versión del original
    const { rows: ver } = await client.query(
      `SELECT id, version, strategy, options, region_sanitaria
       FROM route_template_versions
       WHERE route_template_id=$1 AND version=$2`,
      [id, src.current_version]
    )
    // Crea v1 en la nueva (hereda strategy y region_sanitaria)
    const { rows: v1 } = await client.query(
      `INSERT INTO route_template_versions (route_template_id, version, strategy, options, region_sanitaria)
       VALUES ($1, 1, $2, $3, $4) RETURNING id`,
      [newId, ver[0]?.strategy || 'FASTEST', ver[0]?.options || {}, ver[0]?.region_sanitaria || null]
    )
    const newV1 = v1[0].id

    // Copia stops si existían
    if (ver.length){
      const { rows: stops } = await client.query(
        `SELECT pharmacy_id, seq, required, notes
         FROM route_template_stops WHERE route_template_version_id=$1 ORDER BY seq`,
        [ver[0].id]
      )
      for (const s of stops){
        await client.query(
          `INSERT INTO route_template_stops
            (route_template_version_id, pharmacy_id, seq, required, notes)
           VALUES ($1,$2,$3,$4,$5)`,
          [newV1, s.pharmacy_id, s.seq, s.required, s.notes]
        )
      }
    }

    await client.query('COMMIT')
    res.status(201).json({ id: newId, current_version: 1 })
  } catch (e) {
    await client.query('ROLLBACK')
    return sendDbError(res, e, 'No se pudo duplicar la plantilla')
  } finally {
    client.release()
  }
}